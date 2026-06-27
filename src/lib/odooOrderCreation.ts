import { odoo } from "@/lib/odoo";
import { generateGridPDF } from "@/lib/pdf";
import type {
  Article,
  ArticleRow,
  PrintColumn,
  PrintValues,
  Warehouse,
} from "@/types";
import {
  resolveAttributeValues,
  resolveOrCreateColors,
  createOrUpdateSupplierInfo,
  createOrUpdatePricelistItem,
  getOrCreateProduct,
  getVariants,
  mapVariantToColorSize,
  type ResolvedAttributeValue,
} from "@/lib/odooProducts";

export interface ImageSyncEntry {
  articleId: string;
  templateId: number;
  resolvedColors: ResolvedAttributeValue[];
  variantMap: [string, number][];
}

export interface OdooCreationResult {
  purchaseOrderId: number;
  purchaseOrderName: string;
  imageSyncData: ImageSyncEntry[];
}

interface ValidationError {
  articleName: string;
  type: "color" | "size";
  value: string;
}

export class OdooValidationError extends Error {
  validationErrors: ValidationError[];
  statusCode: number;

  constructor(message: string, validationErrors: ValidationError[], statusCode = 422) {
    super(message);
    this.name = "OdooValidationError";
    this.validationErrors = validationErrors;
    this.statusCode = statusCode;
  }
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function createOrderInOdoo(params: {
  supplierId: number;
  date: string;
  articles: Article[];
  warehouseIds: number[];
  printColumns: PrintColumn[];
  printValues: PrintValues;
  selectedWarehouses: Warehouse[];
}): Promise<OdooCreationResult> {
  const {
    supplierId,
    date,
    articles,
    warehouseIds,
    printColumns,
    printValues,
    selectedWarehouses,
  } = params;

  // Normalize article names and color names to Title Case
  for (const article of articles) {
    article.name = toTitleCase(article.name);
    for (const row of article.rows) {
      if (row.color?.name) {
        row.color.name = toTitleCase(row.color.name);
      }
    }
  }

  // Resolve color attribute ID
  const attributes = await odoo.searchRead(
    "product.attribute",
    [["name", "ilike", "Color"]],
    ["id", "name"],
  );

  const colorAttr = attributes.find((a: { id: number; name: string }) =>
    a.name.toLowerCase().includes("color"),
  );

  if (!colorAttr) {
    throw new OdooValidationError(
      'Atributo "Color" no encontrado en Odoo',
      [{ articleName: "", type: "color", value: "Color" }],
      400,
    );
  }

  const colorAttributeId: number = colorAttr.id;

  // ── Validation pass ───────────────────────────────────────────────────────
  interface ArticleResolved {
    article: Article;
    resolvedColors: ResolvedAttributeValue[];
    resolvedSizes: ResolvedAttributeValue[];
  }

  const resolvedArticles: ArticleResolved[] = [];
  const allValidationErrors: ValidationError[] = [];

  for (const article of articles) {
    if (!article.sizeAttributeId) {
      throw new OdooValidationError(
        `El artículo "${article.name}" no tiene tipo de talle seleccionado. Seleccioná los talles desde el modal antes de confirmar.`,
        [{ articleName: article.name, type: "size", value: "Sin atributo de talle" }],
        422,
      );
    }

    // Validate new colors have colorBase and hexColor
    for (const row of article.rows) {
      if (!row.color?.isNew) continue;
      if (!row.color.colorBase) {
        throw new OdooValidationError(
          `El color nuevo "${row.color.name}" del artículo "${article.name}" no tiene Color Base asignado.`,
          [{ articleName: article.name, type: "color", value: row.color.name }],
          422,
        );
      }
      if (!row.color.hexColor) {
        throw new OdooValidationError(
          `El color nuevo "${row.color.name}" del artículo "${article.name}" no tiene color HEX asignado.`,
          [{ articleName: article.name, type: "color", value: row.color.name }],
          422,
        );
      }
    }

    // Resolve colors: create new ones in Odoo, use existing IDs for existing ones
    const colorIdMap = await resolveOrCreateColors(article.rows, colorAttributeId);

    const resolvedColors: ResolvedAttributeValue[] = [];
    for (const [name, id] of colorIdMap.entries()) {
      resolvedColors.push({ id, name });
    }

    // Validate existing (non-new) colors that couldn't be resolved
    const existingColorsNotFound: string[] = [];
    for (const row of article.rows) {
      if (!row.color || row.color.isNew) continue;
      if (!colorIdMap.has(row.color.name)) {
        existingColorsNotFound.push(row.color.name);
      }
    }

    const { resolved: resolvedSizes, notFound: sizesNotFound } =
      await resolveAttributeValues(article.sizes, article.sizeAttributeId);

    allValidationErrors.push(
      ...existingColorsNotFound.map((name) => ({
        articleName: article.name,
        type: "color" as const,
        value: name,
      })),
      ...sizesNotFound.map((name) => ({
        articleName: article.name,
        type: "size" as const,
        value: name,
      })),
    );

    resolvedArticles.push({ article, resolvedColors, resolvedSizes });
  }

  if (allValidationErrors.length > 0) {
    throw new OdooValidationError(
      "Algunos atributos no existen en Odoo",
      allValidationErrors,
      422,
    );
  }

  // ── Creation pass ─────────────────────────────────────────────────────────
  const createdProductIds: number[] = [];
  const createdSupplierInfoIds: number[] = [];
  const createdPricelistItemIds: number[] = [];
  const allOrderLines: [number, number, object][] = [];
  const articleVariantMaps = new Map<
    string,
    {
      variantMap: Map<string, number>;
      resolvedColors: ResolvedAttributeValue[];
      templateId: number;
    }
  >();

  try {
    for (const { article, resolvedColors, resolvedSizes } of resolvedArticles) {
      const templateId = await getOrCreateProduct(
        article,
        resolvedColors,
        resolvedSizes,
        colorAttributeId,
        article.sizeAttributeId!,
      );

      if (!article.existingProductId) {
        createdProductIds.push(templateId);
      }

      // Sync supplier info and pricelist item
      const costPrice = parseFloat(article.price) || 0;
      const salePrice = parseFloat(article.salePrice) || 0;
      const totalQty = article.rows.reduce(
        (sum, row) =>
          sum +
          article.sizes.reduce((s2, size) => {
            let q: number;
            if (warehouseIds.length > 0) {
              q = warehouseIds.reduce((ws, wId) => {
                return (
                  ws +
                  (parseInt(
                    row.warehouseQuantities?.[`${wId}:${size.name}`] || "0",
                    10,
                  ) || 0)
                );
              }, 0);
            } else {
              q = parseInt(row.quantities[size.name] || "0", 10);
            }
            return s2 + (isNaN(q) ? 0 : q);
          }, 0),
        0,
      );

      const supplierInfoId = await createOrUpdateSupplierInfo(
        templateId,
        supplierId,
        costPrice,
        totalQty,
      );
      if (supplierInfoId) createdSupplierInfoIds.push(supplierInfoId);

      const pricelistItemId = await createOrUpdatePricelistItem(
        templateId,
        salePrice,
      );
      if (pricelistItemId) createdPricelistItemIds.push(pricelistItemId);

      const variants = await getVariants(templateId);

      const variantMap = await mapVariantToColorSize(
        variants,
        resolvedColors,
        resolvedSizes,
        colorAttributeId,
        article.sizeAttributeId!,
      );

      articleVariantMaps.set(article.id, {
        variantMap,
        resolvedColors,
        templateId,
      });

      for (const row of article.rows as ArticleRow[]) {
        for (const size of article.sizes) {
          let qty: number;
          if (warehouseIds.length > 0) {
            qty = warehouseIds.reduce((sum, wId) => {
              const key = `${wId}:${size.name}`;
              return (
                sum + (parseInt(row.warehouseQuantities?.[key] || "0", 10) || 0)
              );
            }, 0);
          } else {
            qty = parseInt(row.quantities[size.name] || "0", 10);
          }
          if (qty <= 0) continue;

          const resolvedSize = resolvedSizes.find((s) => s.name === size.name);
          if (!resolvedSize) continue;

          const resolvedColor = row.color
            ? resolvedColors.find((c) => c.name === row.color!.name)
            : null;

          const key = resolvedColor
            ? `${resolvedColor.id}:${resolvedSize.id}`
            : `:${resolvedSize.id}`;

          const variantId = variantMap.get(key);
          if (!variantId) continue;

          const priceUnit =
            article.priceGranular && row.prices?.[size.name]
              ? parseFloat(row.prices[size.name])
              : parseFloat(article.price) || 0;

          allOrderLines.push([
            0,
            0,
            {
              product_id: variantId,
              product_qty: qty,
              price_unit: priceUnit,
            },
          ]);
        }
      }
    }

    if (allOrderLines.length === 0) {
      throw new Error(
        "No se encontraron variantes para las cantidades ingresadas. Verificá que los productos tengan colores y talles configurados en Odoo.",
      );
    }

    // Create purchase.order
    const purchaseOrderId = await odoo.create("purchase.order", {
      partner_id: supplierId,
      date_order: date,
      order_line: allOrderLines,
      ...(warehouseIds.length > 0
        ? { x_studio_sucursal: [[6, 0, warehouseIds]] }
        : {}),
    });

    const orderData = await odoo.searchRead(
      "purchase.order",
      [["id", "=", purchaseOrderId]],
      ["name", "partner_id", "date_order"],
    );

    // Confirm order — if this fails, unlink to avoid dangling draft orders
    try {
      await odoo.call("purchase.order", "button_confirm", {
        ids: purchaseOrderId,
      });
    } catch (confirmErr) {
      try {
        await odoo.unlink("purchase.order", [purchaseOrderId]);
      } catch {
        console.error("Rollback of purchase.order failed for id:", purchaseOrderId);
      }
      throw confirmErr;
    }

    // ── Generar PDFs y adjuntarlos a la orden (best-effort) ──────────────────
    try {
      const safeName = `OC-${String(orderData[0].name).replace(/\//g, "-")}`;

      // PDF proveedor: printColumns sí, sin sucursales, cantidades sumadas
      const supplierPdfBytes = await generateGridPDF({
        order: orderData[0],
        articles,
        printColumns,
        printValues,
        selectedWarehouses,
        supplierMode: true,
      });
      await odoo.create("ir.attachment", {
        name: `${safeName}.pdf`,
        type: "binary",
        datas: Buffer.from(supplierPdfBytes).toString("base64"),
        res_model: "purchase.order",
        res_id: purchaseOrderId,
        mimetype: "application/pdf",
      });

      // PDF interno: sin printColumns, con sucursales
      const internalPdfBytes = await generateGridPDF({
        order: orderData[0],
        articles,
        printColumns,
        printValues,
        selectedWarehouses,
        supplierMode: false,
      });
      await odoo.create("ir.attachment", {
        name: `${safeName}-INT.pdf`,
        type: "binary",
        datas: Buffer.from(internalPdfBytes).toString("base64"),
        res_model: "purchase.order",
        res_id: purchaseOrderId,
        mimetype: "application/pdf",
      });
    } catch (pdfError) {
      console.error("Error adjuntando PDFs a la orden:", pdfError);
    }
    // ── FIN PDFs ──────────────────────────────────────────────────────────────

    // Build imageSyncData for client-side image sync
    const imageSyncData: ImageSyncEntry[] = resolvedArticles
      .map(({ article, resolvedColors }) => {
        const maps = articleVariantMaps.get(article.id);
        if (!maps) return null;
        return {
          articleId: article.id,
          templateId: maps.templateId,
          resolvedColors,
          variantMap: [...maps.variantMap.entries()] as [string, number][],
        };
      })
      .filter((x): x is ImageSyncEntry => x !== null);

    return {
      purchaseOrderId,
      purchaseOrderName: orderData[0]?.name || `P/${purchaseOrderId}`,
      imageSyncData,
    };
  } catch (error) {
    // Rollback products/supplier info/pricelist items on failure
    if (createdPricelistItemIds.length > 0) {
      try {
        await odoo.unlink("product.pricelist.item", createdPricelistItemIds);
      } catch {
        console.error(
          "Rollback failed for product.pricelist.item ids:",
          createdPricelistItemIds,
        );
      }
    }
    if (createdSupplierInfoIds.length > 0) {
      try {
        await odoo.unlink("product.supplierinfo", createdSupplierInfoIds);
      } catch {
        console.error(
          "Rollback failed for product.supplierinfo ids:",
          createdSupplierInfoIds,
        );
      }
    }
    if (createdProductIds.length > 0) {
      try {
        await odoo.unlink("product.template", createdProductIds);
      } catch {
        console.error(
          "Rollback failed for product.template ids:",
          createdProductIds,
        );
      }
    }
    throw error;
  }
}
