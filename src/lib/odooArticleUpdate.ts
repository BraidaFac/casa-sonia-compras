import { odoo } from "@/lib/odoo";
import {
  resolveOrCreateColors,
  syncExtraAttributes,
  syncProductImages,
} from "@/lib/odooProducts";
import type { ResolvedAttributeValue } from "@/lib/odooProducts";
import type { Article, SizeValue } from "@/types";

/**
 * Sincroniza UN artículo editado de una orden confirmada con Odoo:
 * 1. Llama updateArticleInOdoo → sincroniza precios, descripción, categoría,
 *    colores/talles nuevos, atributos extra, imágenes, barcodes
 * 2. Actualiza purchase.order.line con nuevas cantidades/precios
 * 3. Crea nuevas purchase.order.line para variantes que ahora tienen qty > 0
 *
 * NO actualiza nombre ni default_code — esos campos no son editables en órdenes confirmadas.
 */
export async function syncConfirmedArticleToOdoo(
  article: Article,
  odooOrderId: number,
  warehouseIds: number[],
): Promise<void> {
  if (typeof article.existingProductId !== "number" || typeof article.sizeAttributeId !== "number") return;

  // Fetch colorAttributeId
  const colorAttrs: { id: number; name: string }[] = await odoo.searchRead(
    "product.attribute",
    [["name", "ilike", "Color"]],
    ["id", "name"],
  );
  const colorAttrObj = colorAttrs.find((a) => a.name.toLowerCase().includes("color"));
  if (!colorAttrObj) return;
  const colorAttributeId = colorAttrObj.id;

  const templateId = article.existingProductId;
  const sizeAttributeId = article.sizeAttributeId;

  // 1. Sync product data: prices, description, category, colors, sizes, attrs, images, barcodes
  //    (updateArticleInOdoo ya no escribe name ni default_code)
  await updateArticleInOdoo(article, colorAttributeId, sizeAttributeId);

  // 2. Fetch PO lines for this order
  const poLines: { id: number; product_id: [number, string] | number; product_qty: number; price_unit: number }[] =
    await odoo.searchRead(
      "purchase.order.line",
      [["order_id", "=", odooOrderId]],
      ["id", "product_id", "product_qty", "price_unit"],
    );

  const variantToLine = new Map<number, { id: number; currentQty: number; currentPrice: number }>();
  for (const line of poLines) {
    const variantId = Array.isArray(line.product_id) ? line.product_id[0] : (line.product_id as number);
    variantToLine.set(variantId, { id: line.id, currentQty: line.product_qty, currentPrice: line.price_unit });
  }

  // Build variant map: "colorValId:sizeValId" → variantId
  const variantMap = await buildVariantMap(templateId, colorAttributeId, sizeAttributeId);

  // Get color name → colorValueId for this template
  const ptavs: { id: number; attribute_id: [number, string] | number; product_attribute_value_id: [number, string] | number }[] =
    await odoo.searchRead(
      "product.template.attribute.value",
      [["product_tmpl_id", "=", templateId], ["attribute_id", "=", colorAttributeId]],
      ["id", "attribute_id", "product_attribute_value_id"],
    );
  const colorValIds = ptavs.map((p) =>
    Array.isArray(p.product_attribute_value_id) ? p.product_attribute_value_id[0] : p.product_attribute_value_id,
  );
  if (colorValIds.length === 0) return;

  const colorValues: { id: number; name: string }[] = await odoo.read(
    "product.attribute.value",
    colorValIds,
    ["id", "name"],
  );
  const colorNameToId = new Map<string, number>(
    colorValues.map((v) => [v.name.toLowerCase(), v.id]),
  );

  // 3. Update/create PO lines per row × size
  for (const row of article.rows) {
    if (!row.color) continue;
    const colorValId = colorNameToId.get(row.color.name.toLowerCase());
    if (!colorValId) continue;

    for (const size of article.sizes) {
      const variantId = variantMap.get(`${colorValId}:${size.id}`);
      if (!variantId) continue;

      let qty: number;
      if (warehouseIds.length > 0) {
        qty = warehouseIds.reduce((sum, wId) => {
          return sum + (parseInt(row.warehouseQuantities?.[`${wId}:${size.name}`] || "0", 10) || 0);
        }, 0);
      } else {
        qty = parseInt(row.quantities[size.name] || "0", 10) || 0;
      }
      const price = article.priceGranular && row.prices?.[size.name]
        ? parseFloat(row.prices[size.name]) || 0
        : parseFloat(article.price) || 0;

      const lineInfo = variantToLine.get(variantId);
      if (lineInfo) {
        if (qty !== lineInfo.currentQty || price !== lineInfo.currentPrice) {
          await odoo.write("purchase.order.line", [lineInfo.id], {
            product_qty: qty,
            price_unit: price,
          });
        }
      } else if (qty > 0) {
        try {
          await odoo.create("purchase.order.line", {
            order_id: odooOrderId,
            product_id: variantId,
            product_qty: qty,
            price_unit: price,
          });
        } catch (err) {
          console.error("[syncConfirmedArticle] Failed to create PO line for variant", variantId, err);
        }
      }
    }
  }
}

/**
 * Construye un mapa `${colorValueId}:${sizeValueId}` → variantId
 * leyendo product.template.attribute.value y product.product de Odoo.
 */
async function buildVariantMap(
  templateId: number,
  colorAttributeId: number,
  sizeAttributeId: number,
): Promise<Map<string, number>> {
  const ptavs: {
    id: number;
    attribute_id: [number, string] | number;
    product_attribute_value_id: [number, string] | number;
  }[] = await odoo.searchRead(
    "product.template.attribute.value",
    [["product_tmpl_id", "=", templateId]],
    ["id", "attribute_id", "product_attribute_value_id"],
  );

  const colorValToPtav = new Map<number, number>();
  const sizeValToPtav = new Map<number, number>();

  for (const ptav of ptavs) {
    const attrId = Array.isArray(ptav.attribute_id)
      ? ptav.attribute_id[0]
      : ptav.attribute_id;
    const valId = Array.isArray(ptav.product_attribute_value_id)
      ? ptav.product_attribute_value_id[0]
      : ptav.product_attribute_value_id;
    if (attrId === colorAttributeId) colorValToPtav.set(valId, ptav.id);
    if (attrId === sizeAttributeId) sizeValToPtav.set(valId, ptav.id);
  }

  const variants: {
    id: number;
    product_template_attribute_value_ids: number[];
  }[] = await odoo.searchRead(
    "product.product",
    [
      ["product_tmpl_id", "=", templateId],
      ["active", "in", [true, false]],
    ],
    ["id", "product_template_attribute_value_ids"],
  );

  const variantMap = new Map<string, number>();

  for (const variant of variants) {
    const ptavIds = variant.product_template_attribute_value_ids ?? [];
    let colorValId = 0;
    let sizeValId = 0;
    for (const [valId, ptavId] of colorValToPtav) {
      if (ptavIds.includes(ptavId)) {
        colorValId = valId;
        break;
      }
    }
    for (const [valId, ptavId] of sizeValToPtav) {
      if (ptavIds.includes(ptavId)) {
        sizeValId = valId;
        break;
      }
    }
    variantMap.set(`${colorValId}:${sizeValId}`, variant.id);
  }

  return variantMap;
}

/**
 * Actualiza un artículo en Odoo sin tocar purchase.order lines.
 * - Actualiza product.template (nombre, categoría, precios, descripción)
 * - Agrega colores/talles nuevos como variantes
 * - Sincroniza atributos extras, barcodes e imágenes
 */
export async function updateArticleInOdoo(
  article: Article,
  colorAttributeId: number,
  sizeAttributeId: number,
): Promise<void> {
  const templateId = article.existingProductId!;

  // 1. Actualizar campos del product.template (sin name ni default_code — no son editables en órdenes confirmadas)
  await odoo.write("product.template", [templateId], {
    standard_price: parseFloat(article.price) || 0,
    list_price: parseFloat(article.salePrice) || 0,
    description_ecommerce: article.description || "",
    ...(article.category?.id ? { categ_id: article.category.id } : {}),
  });

  // 2. Resolver/crear colores y agregar nuevos a la línea de atributo
  const colorIdMap = await resolveOrCreateColors(article.rows, colorAttributeId);
  const resolvedColors: ResolvedAttributeValue[] = [];
  for (const [name, id] of colorIdMap) {
    resolvedColors.push({ id, name });
  }

  const lines: {
    id: number;
    attribute_id: [number, string] | number;
    value_ids: number[];
  }[] = await odoo.searchRead(
    "product.template.attribute.line",
    [["product_tmpl_id", "=", templateId]],
    ["id", "attribute_id", "value_ids"],
  );

  const colorLine = lines.find(
    (l) =>
      (Array.isArray(l.attribute_id) ? l.attribute_id[0] : l.attribute_id) ===
      colorAttributeId,
  );
  const sizeLine = lines.find(
    (l) =>
      (Array.isArray(l.attribute_id) ? l.attribute_id[0] : l.attribute_id) ===
      sizeAttributeId,
  );

  // Agregar colores nuevos
  if (colorLine) {
    const newColorIds = resolvedColors
      .filter((c) => !colorLine.value_ids.includes(c.id))
      .map((c) => c.id);
    if (newColorIds.length > 0) {
      await odoo.write("product.template.attribute.line", [colorLine.id], {
        value_ids: [[6, 0, [...colorLine.value_ids, ...newColorIds]]],
      });
    }
  } else if (resolvedColors.length > 0) {
    await odoo.write("product.template", [templateId], {
      attribute_line_ids: [
        [0, 0, {
          attribute_id: colorAttributeId,
          value_ids: [[6, 0, resolvedColors.map((c) => c.id)]],
        }],
      ],
    });
  }

  // 3. Agregar talles nuevos (los que no estaban en originalSizeIds)
  const originalSizeIds = article.originalSizeIds ?? [];
  const newSizes: SizeValue[] = article.sizes.filter(
    (s) => !originalSizeIds.includes(s.id),
  );

  if (newSizes.length > 0) {
    const newSizeIds = newSizes.map((s) => s.id);
    if (sizeLine) {
      await odoo.write("product.template.attribute.line", [sizeLine.id], {
        value_ids: [[6, 0, [...sizeLine.value_ids, ...newSizeIds]]],
      });
    } else {
      await odoo.write("product.template", [templateId], {
        attribute_line_ids: [
          [0, 0, {
            attribute_id: sizeAttributeId,
            value_ids: [[6, 0, newSizeIds]],
          }],
        ],
      });
    }
  }

  // 4. Sincronizar atributos extras (no-variante)
  await syncExtraAttributes(templateId, article);

  // 5. Construir variantMap para barcodes e imágenes
  const variantMap = await buildVariantMap(
    templateId,
    colorAttributeId,
    sizeAttributeId,
  );

  // 6. Actualizar barcodes por variante color × talle
  for (const row of article.rows) {
    if (!row.color || !row.barcodes || Object.keys(row.barcodes).length === 0)
      continue;
    const colorId = colorIdMap.get(row.color.name);
    if (!colorId) continue;
    for (const [sizeName, barcode] of Object.entries(row.barcodes)) {
      if (!barcode) continue;
      const size = article.sizes.find((s) => s.name === sizeName);
      if (!size) continue;
      const variantId = variantMap.get(`${colorId}:${size.id}`);
      if (!variantId) continue;
      try {
        await odoo.write("product.product", [variantId], { barcode });
      } catch (err) {
        console.error(
          `Error actualizando barcode ${row.color.name}/${sizeName}:`,
          err,
        );
      }
    }
  }

  // 7. Sincronizar imágenes (reutiliza syncProductImages de odooProducts)
  await syncProductImages(templateId, article, resolvedColors, variantMap);
}
