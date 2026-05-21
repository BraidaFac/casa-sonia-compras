import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import { generateGridPDF } from "@/lib/pdf";
import type { Article, ArticleRow, AttributeValue, ColorValue, PrintColumn, PrintValues, Warehouse, ProductImage } from "@/types";

interface ResolvedAttributeValue {
  id: number;
  name: string;
}

interface ValidationError {
  articleName: string;
  type: "color" | "size";
  value: string;
}

async function resolveAttributeValues(
  values: AttributeValue[],
  attributeId: number,
): Promise<{ resolved: ResolvedAttributeValue[]; notFound: string[] }> {
  const resolved: ResolvedAttributeValue[] = [];
  const notFound: string[] = [];

  for (const val of values) {
    const existing = await odoo.searchRead(
      "product.attribute.value",
      [
        ["name", "ilike", val.name],
        ["attribute_id", "=", attributeId],
      ],
      ["id", "name"],
    );

    const match = existing.find(
      (e: { id: number; name: string }) =>
        e.name.toLowerCase() === val.name.toLowerCase(),
    );

    if (match) {
      resolved.push({ id: match.id, name: match.name });
    } else {
      notFound.push(val.name);
    }
  }

  return { resolved, notFound };
}

// Creates new colors in Odoo and returns a map: colorName → Odoo ID
async function resolveOrCreateColors(
  rows: ArticleRow[],
  colorAttributeId: number,
): Promise<Map<string, number>> {
  const colorIdMap = new Map<string, number>();
  const seenNames = new Set<string>();

  for (const row of rows) {
    if (!row.color) continue;
    const colorName = row.color.name;
    if (seenNames.has(colorName)) continue;
    seenNames.add(colorName);

    if (!row.color.isNew && row.color.id !== null) {
      colorIdMap.set(colorName, row.color.id);
      continue;
    }

    // Check if already exists (e.g. previously confirmed)
    const existing = await odoo.searchRead(
      "product.attribute.value",
      [
        ["name", "ilike", colorName],
        ["attribute_id", "=", colorAttributeId],
      ],
      ["id", "name"],
    );

    const exactMatch = existing.find(
      (e: { id: number; name: string }) =>
        e.name.toLowerCase() === colorName.toLowerCase(),
    );

    if (exactMatch) {
      colorIdMap.set(colorName, exactMatch.id);
      continue;
    }

    const newId = await odoo.create("product.attribute.value", {
      name: colorName,
      attribute_id: colorAttributeId,
      x_studio_color_base: (row.color as ColorValue).colorBase || false,
      html_color: (row.color as ColorValue).hexColor || false,
    });

    colorIdMap.set(colorName, newId);
  }

  return colorIdMap;
}

// Returns created ID (for rollback) or null if updated existing
async function createOrUpdateSupplierInfo(
  templateId: number,
  supplierId: number,
  price: number,
  minQty: number,
): Promise<number | null> {
  if (price <= 0) return null;

  const existing = await odoo.searchRead(
    "product.supplierinfo",
    [
      ["product_tmpl_id", "=", templateId],
      ["partner_id", "=", supplierId],
    ],
    ["id"],
  );

  if (existing.length > 0) {
    await odoo.write("product.supplierinfo", [existing[0].id], {
      price,
      min_qty: minQty,
    });
    return null;
  } else {
    const id = await odoo.create("product.supplierinfo", {
      product_tmpl_id: templateId,
      partner_id: supplierId,
      price,
      min_qty: minQty,
    });
    return id;
  }
}

// Returns created ID (for rollback) or null if updated existing
async function createOrUpdatePricelistItem(
  templateId: number,
  salePrice: number,
): Promise<number | null> {
  if (salePrice <= 0) return null;

  const pricelists = await odoo.searchRead("product.pricelist", [], ["id"], {
    limit: 1,
  });
  if (pricelists.length === 0) return null;
  const pricelistId = pricelists[0].id;

  const existing = await odoo.searchRead(
    "product.pricelist.item",
    [
      ["pricelist_id", "=", pricelistId],
      ["product_tmpl_id", "=", templateId],
      ["applied_on", "=", "1_product"],
    ],
    ["id"],
  );

  if (existing.length > 0) {
    await odoo.write("product.pricelist.item", [existing[0].id], {
      fixed_price: salePrice,
      min_quantity: 0,
    });
    return null;
  } else {
    const id = await odoo.create("product.pricelist.item", {
      pricelist_id: pricelistId,
      product_tmpl_id: templateId,
      applied_on: "1_product",
      compute_price: "fixed",
      fixed_price: salePrice,
      min_quantity: 0,
    });
    return id;
  }
}

async function syncExtraAttributes(templateId: number, article: Article) {
  for (const attr of article.attributes) {
    if (attr.generatesVariants) continue;
    if (attr.values.length === 0) continue;

    const existingLines = await odoo.searchRead(
      "product.template.attribute.line",
      [
        ["product_tmpl_id", "=", templateId],
        ["attribute_id", "=", attr.attributeId],
      ],
      ["id", "value_ids"],
    );

    if (existingLines.length > 0) {
      await odoo.write(
        "product.template.attribute.line",
        [existingLines[0].id],
        { value_ids: [[6, 0, attr.values.map((v) => v.id)]] },
      );
    } else {
      await odoo.write("product.template", [templateId], {
        attribute_line_ids: [
          [
            0,
            0,
            {
              attribute_id: attr.attributeId,
              value_ids: [[6, 0, attr.values.map((v) => v.id)]],
            },
          ],
        ],
      });
    }
  }
}

async function getOrCreateProduct(
  article: Article,
  resolvedColors: ResolvedAttributeValue[],
  resolvedSizes: ResolvedAttributeValue[],
  colorAttributeId: number,
  sizeAttributeId: number,
): Promise<number> {
  if (article.existingProductId) {
    const templateId = article.existingProductId;

    // Update scalar fields
    await odoo.write("product.template", [templateId], {
      list_price: parseFloat(article.salePrice) || 0,
      default_code: article.referencia || "",
      description_ecommerce: article.description || "",
      ...(article.category?.id ? { categ_id: article.category.id } : {}),
    });

    const lines = await odoo.searchRead(
      "product.template.attribute.line",
      [["product_tmpl_id", "=", templateId]],
      ["id", "attribute_id", "value_ids"],
    );

    const colorLine = lines.find(
      (l: { attribute_id: [number, string] | number }) =>
        (Array.isArray(l.attribute_id) ? l.attribute_id[0] : l.attribute_id) ===
        colorAttributeId,
    );
    const sizeLine = lines.find(
      (l: { attribute_id: [number, string] | number }) =>
        (Array.isArray(l.attribute_id) ? l.attribute_id[0] : l.attribute_id) ===
        sizeAttributeId,
    );

    const newColors = resolvedColors.filter(
      (c) => !colorLine?.value_ids?.includes(c.id),
    );
    const newSizes = resolvedSizes.filter(
      (s) => !sizeLine?.value_ids?.includes(s.id),
    );

    if (colorLine && newColors.length > 0) {
      const allColorIds = [
        ...(colorLine.value_ids || []),
        ...newColors.map((c) => c.id),
      ];
      await odoo.write("product.template.attribute.line", [colorLine.id], {
        value_ids: [[6, 0, allColorIds]],
      });
    } else if (!colorLine && resolvedColors.length > 0) {
      await odoo.write("product.template", [templateId], {
        attribute_line_ids: [
          [
            0,
            0,
            {
              attribute_id: colorAttributeId,
              value_ids: [[6, 0, resolvedColors.map((c) => c.id)]],
            },
          ],
        ],
      });
    }

    if (sizeLine && newSizes.length > 0) {
      const allSizeIds = [
        ...(sizeLine.value_ids || []),
        ...newSizes.map((s) => s.id),
      ];
      await odoo.write("product.template.attribute.line", [sizeLine.id], {
        value_ids: [[6, 0, allSizeIds]],
      });
    } else if (!sizeLine && resolvedSizes.length > 0) {
      await odoo.write("product.template", [templateId], {
        attribute_line_ids: [
          [
            0,
            0,
            {
              attribute_id: sizeAttributeId,
              value_ids: [[6, 0, resolvedSizes.map((s) => s.id)]],
            },
          ],
        ],
      });
    }

    await syncExtraAttributes(templateId, article);
    return templateId;
  }

  const attributeLines = [];

  if (resolvedColors.length > 0) {
    attributeLines.push([
      0,
      0,
      {
        attribute_id: colorAttributeId,
        value_ids: [[6, 0, resolvedColors.map((c) => c.id)]],
      },
    ]);
  }

  if (resolvedSizes.length > 0) {
    attributeLines.push([
      0,
      0,
      {
        attribute_id: sizeAttributeId,
        value_ids: [[6, 0, resolvedSizes.map((s) => s.id)]],
      },
    ]);
  }

  for (const attr of article.attributes) {
    if (attr.generatesVariants) continue;
    if (attr.values.length === 0) continue;
    attributeLines.push([
      0,
      0,
      {
        attribute_id: attr.attributeId,
        value_ids: [[6, 0, attr.values.map((v) => v.id)]],
      },
    ]);
  }

  const templateId = await odoo.create("product.template", {
    name: article.name,
    standard_price: parseFloat(article.price) || 0,
    list_price: parseFloat(article.salePrice) || 0,
    default_code: article.referencia || "",
    description_ecommerce: article.description || "",
    available_in_pos: true,
    ...(article.category?.id ? { categ_id: article.category.id } : {}),
    ...(attributeLines.length > 0
      ? { attribute_line_ids: attributeLines }
      : {}),
  });

  return templateId;
}

interface OdooVariant {
  id: number;
  product_template_attribute_value_ids: number[];
}

async function getVariants(templateId: number): Promise<OdooVariant[]> {
  return odoo.searchRead(
    "product.product",
    [["product_tmpl_id", "=", templateId]],
    ["id", "product_template_attribute_value_ids"],
  );
}

async function mapVariantToColorSize(
  variants: OdooVariant[],
  resolvedColors: ResolvedAttributeValue[],
  resolvedSizes: ResolvedAttributeValue[],
  colorAttributeId: number,
  sizeAttributeId: number,
): Promise<Map<string, number>> {
  const allAttrValueIds = variants.flatMap(
    (v) => v.product_template_attribute_value_ids,
  );

  if (allAttrValueIds.length === 0) return new Map();

  const ptavRecords = await odoo.read(
    "product.template.attribute.value",
    [...new Set(allAttrValueIds)],
    ["id", "attribute_id", "product_attribute_value_id"],
  );

  const ptavMap: Record<number, { attributeId: number; pavId: number }> = {};
  for (const ptav of ptavRecords) {
    ptavMap[ptav.id] = {
      attributeId: Array.isArray(ptav.attribute_id)
        ? ptav.attribute_id[0]
        : ptav.attribute_id,
      pavId: Array.isArray(ptav.product_attribute_value_id)
        ? ptav.product_attribute_value_id[0]
        : ptav.product_attribute_value_id,
    };
  }

  const result = new Map<string, number>();

  for (const variant of variants) {
    let colorPavId: number | null = null;
    let sizePavId: number | null = null;

    for (const ptavId of variant.product_template_attribute_value_ids) {
      const ptav = ptavMap[ptavId];
      if (!ptav) continue;
      if (ptav.attributeId === colorAttributeId) colorPavId = ptav.pavId;
      if (ptav.attributeId === sizeAttributeId) sizePavId = ptav.pavId;
    }

    if (colorPavId !== null && sizePavId !== null) {
      result.set(`${colorPavId}:${sizePavId}`, variant.id);
    } else if (colorPavId !== null) {
      result.set(`${colorPavId}:`, variant.id);
    } else if (sizePavId !== null) {
      result.set(`:${sizePavId}`, variant.id);
    } else {
      result.set(":", variant.id);
    }
  }

  return result;
}

async function syncTemplateImage(templateId: number, article: Article): Promise<void> {
  // Build colorName → colorBase map from rows
  const colorBaseMap = new Map<string, string>();
  for (const row of article.rows) {
    if (row.color?.colorBase) {
      colorBaseMap.set(row.color.name, row.color.colorBase);
    }
  }

  // Collect all successful images across all colors
  const allImages: { image: ProductImage; colorName: string }[] = [];
  for (const [colorName, images] of Object.entries(article.colorImages || {})) {
    for (const img of images) {
      if (img.fileId && !img.error) {
        allImages.push({ image: img, colorName });
      }
    }
  }

  if (allImages.length === 0) return;

  let chosen: { image: ProductImage; colorName: string };

  if (allImages.length === 1) {
    chosen = allImages[0];
  } else {
    const negro = allImages.find(
      (e) => colorBaseMap.get(e.colorName)?.toLowerCase() === "negro",
    );
    const blanco = allImages.find(
      (e) => colorBaseMap.get(e.colorName)?.toLowerCase() === "blanco",
    );
    chosen = negro ?? blanco ?? allImages[0];
  }

  const imgRes = await fetch(chosen.image.downloadUrl);
  if (!imgRes.ok) return;
  const imgBuffer = await imgRes.arrayBuffer();
  const imgBase64 = Buffer.from(imgBuffer).toString("base64");

  await odoo.write("product.template", [templateId], {
    image_1920: imgBase64,
  });
}

async function syncVariantImages(
  article: Article,
  resolvedColors: ResolvedAttributeValue[],
  variantMap: Map<string, number>,
): Promise<void> {
  if (!article.colorImages || Object.keys(article.colorImages).length === 0) return;

  for (const [colorName, images] of Object.entries(article.colorImages)) {
    const successImages = images.filter((i) => i.fileId && !i.error);
    if (successImages.length === 0) continue;

    const resolvedColor = resolvedColors.find(
      (c) => c.name.toLowerCase() === colorName.toLowerCase(),
    );
    if (!resolvedColor) continue;

    // Collect all variant IDs for this color (across all sizes)
    const variantIds: number[] = [];
    for (const [key, variantId] of variantMap.entries()) {
      const colorPavId = key.split(":")[0];
      if (colorPavId === String(resolvedColor.id)) {
        variantIds.push(variantId);
      }
    }
    if (variantIds.length === 0) continue;

    // Fetch first image and encode to base64
    const img = successImages[0];
    const imgRes = await fetch(img.downloadUrl);
    if (!imgRes.ok) continue;
    const imgBuffer = await imgRes.arrayBuffer();
    const imgBase64 = Buffer.from(imgBuffer).toString("base64");

    // Set image_variant_1920 on all variants of this color
    for (const variantId of variantIds) {
      await odoo.write("product.product", [variantId], {
        image_variant_1920: imgBase64,
      });
    }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    supplierId,
    date,
    articles,
    warehouseIds = [],
    printColumns = [],
    printValues = {},
    selectedWarehouses = [],
  } = body as {
    supplierId: number;
    date: string;
    articles: Article[];
    warehouseIds: number[];
    printColumns: PrintColumn[];
    printValues: PrintValues;
    selectedWarehouses: Warehouse[];
  };

  const attributes = await odoo.searchRead(
    "product.attribute",
    [["name", "ilike", "Color"]],
    ["id", "name"],
  );

  const colorAttr = attributes.find((a: { id: number; name: string }) =>
    a.name.toLowerCase().includes("color"),
  );

  if (!colorAttr) {
    return NextResponse.json(
      { error: 'Atributo "Color" no encontrado en Odoo' },
      { status: 400 },
    );
  }

  const colorAttributeId = colorAttr.id;

  // ── Validation pass: resolve all attributes, collect errors ──────────────
  interface ArticleResolved {
    article: Article;
    resolvedColors: ResolvedAttributeValue[];
    resolvedSizes: ResolvedAttributeValue[];
  }

  const resolvedArticles: ArticleResolved[] = [];
  const allValidationErrors: ValidationError[] = [];

  for (const article of articles) {
    if (!article.sizeAttributeId) {
      return NextResponse.json(
        {
          error: `El artículo "${article.name}" no tiene tipo de talle seleccionado. Seleccioná los talles desde el modal antes de confirmar.`,
          validationErrors: [{ articleName: article.name, type: "size", value: "Sin atributo de talle" }],
        },
        { status: 422 },
      );
    }

    // Validate new colors have colorBase and hexColor
    for (const row of article.rows) {
      if (!row.color?.isNew) continue;
      if (!row.color.colorBase) {
        return NextResponse.json(
          {
            error: `El color nuevo "${row.color.name}" del artículo "${article.name}" no tiene Color Base asignado.`,
            validationErrors: [{ articleName: article.name, type: "color" as const, value: row.color.name }],
          },
          { status: 422 },
        );
      }
      if (!row.color.hexColor) {
        return NextResponse.json(
          {
            error: `El color nuevo "${row.color.name}" del artículo "${article.name}" no tiene color HEX asignado.`,
            validationErrors: [{ articleName: article.name, type: "color" as const, value: row.color.name }],
          },
          { status: 422 },
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
    return NextResponse.json(
      {
        error: "Algunos atributos no existen en Odoo",
        validationErrors: allValidationErrors,
      },
      { status: 422 },
    );
  }

  // ── Creation pass ─────────────────────────────────────────────────────────
  const createdProductIds: number[] = [];
  const createdSupplierInfoIds: number[] = [];
  const createdPricelistItemIds: number[] = [];
  const allOrderLines: [number, number, object][] = [];
  const articleVariantMaps = new Map<string, { variantMap: Map<string, number>; resolvedColors: ResolvedAttributeValue[]; templateId: number }>();

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
                return ws + (parseInt(row.warehouseQuantities?.[`${wId}:${size.name}`] || "0", 10) || 0);
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

      articleVariantMaps.set(article.id, { variantMap, resolvedColors, templateId });

      for (const row of article.rows as ArticleRow[]) {
        for (const size of article.sizes) {
          let qty: number;
          if (warehouseIds.length > 0) {
            qty = warehouseIds.reduce((sum, wId) => {
              const key = `${wId}:${size.name}`;
              return sum + (parseInt(row.warehouseQuantities?.[key] || "0", 10) || 0);
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

          const priceUnit = row.prices?.[size.name]
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

    const purchaseOrderId = await odoo.create("purchase.order", {
      partner_id: supplierId,
      date_order: date,
      order_line: allOrderLines,
      ...(warehouseIds.length > 0
        ? { x_studio_sucursales: [[6, 0, warehouseIds]] }
        : {}),
    });

    const orderData = await odoo.searchRead(
      "purchase.order",
      [["id", "=", purchaseOrderId]],
      ["name", "partner_id", "date_order"],
    );

    await odoo.call("purchase.order", "button_confirm", {
      ids: purchaseOrderId,
    });

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

    // ── Sincronizar imágenes a variantes Odoo (best-effort) ──────────────────
    try {
      for (const { article, resolvedColors } of resolvedArticles) {
        const maps = articleVariantMaps.get(article.id);
        if (!maps) continue;
        await syncVariantImages(article, resolvedColors, maps.variantMap);
        await syncTemplateImage(maps.templateId, article);
      }
    } catch (imgError) {
      console.error("Error sincronizando imágenes a Odoo:", imgError);
    }
    // ── FIN IMÁGENES ──────────────────────────────────────────────────────────

    return NextResponse.json({
      purchaseOrderId,
      purchaseOrderName: orderData[0]?.name || `P/${purchaseOrderId}`,
    });
  } catch (error) {
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

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error creating order",
        createdProductIds,
      },
      { status: 500 },
    );
  }
}
