import { odoo } from "@/lib/odoo";
import {
  resolveOrCreateColors,
  syncExtraAttributes,
  syncProductImages,
} from "@/lib/odooProducts";
import type { ResolvedAttributeValue } from "@/lib/odooProducts";
import type { Article, SizeValue } from "@/types";

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

  // 1. Actualizar campos del product.template
  await odoo.write("product.template", [templateId], {
    name: article.name,
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
