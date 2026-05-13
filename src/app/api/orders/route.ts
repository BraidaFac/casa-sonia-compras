import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import type { Article, ArticleRow, AttributeValue } from "@/types";

interface ResolvedAttributeValue {
  id: number;
  name: string;
}

async function resolveOrCreateAttributeValue(
  name: string,
  attributeId: number,
): Promise<number> {
  const existing = await odoo.searchRead(
    "product.attribute.value",
    [
      ["name", "=", name],
      ["attribute_id", "=", attributeId],
    ],
    ["id"],
  );

  if (existing.length > 0) return existing[0].id;

  const newId = await odoo.create("product.attribute.value", {
    name,
    attribute_id: attributeId,
  });
  return newId;
}

async function resolveAttributeValues(
  values: AttributeValue[],
  attributeId: number,
): Promise<ResolvedAttributeValue[]> {
  const resolved: ResolvedAttributeValue[] = [];
  for (const val of values) {
    if (val.isNew) {
      const id = await resolveOrCreateAttributeValue(val.name, attributeId);
      resolved.push({ id, name: val.name });
    } else {
      resolved.push({ id: val.id, name: val.name });
    }
  }
  return resolved;
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

    // Get existing attribute lines for this template
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

    // Add missing color values
    const newColors = resolvedColors.filter(
      (c) => !colorLine?.value_ids?.includes(c.id),
    );
    // Add missing size values
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

    return templateId;
  }

  // Create new product template
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

  const templateId = await odoo.create("product.template", {
    name: article.name,
    standard_price: parseFloat(article.price) || 0,
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

// Get the product.template.attribute.value records to map variant → color/size
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

  // Map ptav id → { attributeId, productAttributeValueId }
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

  // Map (colorId, sizeId) → variantId
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

  // Get attribute IDs
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

  const createdProductIds: number[] = [];
  const allOrderLines: [number, number, object][] = [];

  try {
    for (const article of articles) {
      // Step 1: Collect all colors and sizes used in this article
      const allColorsUsed: AttributeValue[] = [];
      const seenColorNames = new Set<string>();
      for (const row of article.rows) {
        if (row.color && !seenColorNames.has(row.color.name)) {
          allColorsUsed.push(row.color);
          seenColorNames.add(row.color.name);
        }
      }

      // Sizes come from article.sizes
      const resolvedColors = await resolveAttributeValues(
        allColorsUsed,
        colorAttributeId,
      );
      const resolvedSizes = await resolveAttributeValues(
        article.sizes,
        sizeAttributeId,
      );

      // Step 2: Resolve product template
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

      // Step 3: Get variant IDs
      const variants = await getVariants(templateId);

      const variantMap = await mapVariantToColorSize(
        variants,
        resolvedColors,
        resolvedSizes,
        colorAttributeId,
        sizeAttributeId,
      );

      // Step 4: Build order lines
      for (const row of article.rows as ArticleRow[]) {
        for (const size of article.sizes) {
          const qty = parseInt(row.quantities[size.name] || "0", 10);
          if (qty <= 0) continue;

          const resolvedSize = resolvedSizes.find((s) => s.name === size.name);
          if (!resolvedSize) continue;

          // Build variant key: color optional
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

    // Step 5: Create purchase order
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

    // Fetch the order name
    const orderData = await odoo.searchRead(
      "purchase.order",
      [["id", "=", purchaseOrderId]],
      ["name"],
    );

    // Confirmar RFQ → Purchase Order
    await odoo.call("purchase.order", "button_confirm", {
      ids: purchaseOrderId,
    });

    return NextResponse.json({
      purchaseOrderId,
      purchaseOrderName: orderData[0]?.name || `P/${purchaseOrderId}`,
    });
  } catch (error) {
    // Rollback: eliminar productos creados en esta operación
    if (createdProductIds.length > 0) {
      try {
        await odoo.unlink("product.template", createdProductIds);
      } catch {
        // Rollback parcial — loguear pero no bloquear la respuesta de error
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
