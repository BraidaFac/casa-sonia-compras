import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import type { Article, ArticleRow, AttributeValue } from "@/types";

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
      description_picking: article.description || "",
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
    description_picking: article.description || "",
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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { supplierId, date, articles } = body as {
    supplierId: number;
    date: string;
    articles: Article[];
  };

  const attributes = await odoo.searchRead(
    "product.attribute",
    ["|", ["name", "ilike", "Color"], ["name", "ilike", "Talle"]],
    ["id", "name"],
  );

  const colorAttr = attributes.find((a: { id: number; name: string }) =>
    a.name.toLowerCase().includes("color"),
  );
  const sizeAttr = attributes.find((a: { id: number; name: string }) =>
    a.name.toLowerCase().includes("talle"),
  );

  if (!colorAttr || !sizeAttr) {
    return NextResponse.json(
      { error: 'Atributos "Color" o "Talle" no encontrados en Odoo' },
      { status: 400 },
    );
  }

  const colorAttributeId = colorAttr.id;
  const sizeAttributeId = sizeAttr.id;

  // ── Validation pass: resolve all attributes, collect errors ──────────────
  interface ArticleResolved {
    article: Article;
    resolvedColors: ResolvedAttributeValue[];
    resolvedSizes: ResolvedAttributeValue[];
  }

  const resolvedArticles: ArticleResolved[] = [];
  const allValidationErrors: ValidationError[] = [];

  for (const article of articles) {
    const allColorsUsed: AttributeValue[] = [];
    const seenColorNames = new Set<string>();
    for (const row of article.rows) {
      if (row.color && !seenColorNames.has(row.color.name)) {
        allColorsUsed.push(row.color);
        seenColorNames.add(row.color.name);
      }
    }

    const { resolved: resolvedColors, notFound: colorsNotFound } =
      await resolveAttributeValues(allColorsUsed, colorAttributeId);

    const { resolved: resolvedSizes, notFound: sizesNotFound } =
      await resolveAttributeValues(article.sizes, sizeAttributeId);

    allValidationErrors.push(
      ...colorsNotFound.map((name) => ({
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

  try {
    for (const { article, resolvedColors, resolvedSizes } of resolvedArticles) {
      const templateId = await getOrCreateProduct(
        article,
        resolvedColors,
        resolvedSizes,
        colorAttributeId,
        sizeAttributeId,
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
            const q = parseInt(row.quantities[size.name] || "0", 10);
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
        sizeAttributeId,
      );

      for (const row of article.rows as ArticleRow[]) {
        for (const size of article.sizes) {
          const qty = parseInt(row.quantities[size.name] || "0", 10);
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
    });

    const orderData = await odoo.searchRead(
      "purchase.order",
      [["id", "=", purchaseOrderId]],
      ["name"],
    );

    await odoo.call("purchase.order", "button_confirm", {
      ids: purchaseOrderId,
    });

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
