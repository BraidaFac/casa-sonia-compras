import { odoo } from "@/lib/odoo";
import type { Article, ArticleRow, AttributeValue, ColorValue } from "@/types";

export interface ResolvedAttributeValue {
  id: number;
  name: string;
}

export interface OdooVariant {
  id: number;
  product_template_attribute_value_ids: number[];
}

/**
 * Batch-resolve a list of articles (by name + referencia) to existing Odoo
 * product.template IDs in a single request. Returns a map of article UUID →
 * templateId for articles that matched. Referencia (default_code /
 * x_studio_referencia) takes priority over name to avoid false positives.
 */
export async function batchResolveProductIds(
  articles: { id: string; name: string; referencia: string }[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (articles.length === 0) return result;

  const names = articles.map((a) => a.name).filter(Boolean);
  const refs = [...new Set(articles.map((a) => a.referencia).filter(Boolean))];

  // Build OR domain across name, default_code, x_studio_referencia
  type OdooLeaf = [string, string, string | string[]];
  type OdooDomain = ("|" | OdooLeaf)[];
  let domain: OdooDomain;
  if (refs.length > 0) {
    domain = [
      "|",
      ["name", "in", names] as OdooLeaf,
      ["default_code", "in", refs] as OdooLeaf,
    ];
  } else {
    domain = [["name", "in", names] as OdooLeaf];
  }

  const found: { id: number; name: string; default_code: string }[] =
    await odoo.searchRead("product.template", domain, [
      "id",
      "name",
      "default_code",
    ]);

  // Build lookup maps — default_code takes priority over name
  const nameToId = new Map(found.map((p) => [p.name.toLowerCase(), p.id]));
  const defaultCodeToId = new Map(
    found.filter((p) => p.default_code).map((p) => [p.default_code, p.id]),
  );

  for (const article of articles) {
    const byRef = article.referencia ? defaultCodeToId.get(article.referencia) : undefined;
    const byName = article.name ? nameToId.get(article.name.toLowerCase()) : undefined;
    const id = byRef ?? byName;
    if (id) result.set(article.id, id);
  }

  return result;
}

export async function resolveAttributeValues(
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

export async function resolveOrCreateColors(
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

export async function createOrUpdateSupplierInfo(
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

export async function createOrUpdatePricelistItem(
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

export async function syncExtraAttributes(templateId: number, article: Article) {
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

export async function getOrCreateProduct(
  article: Article,
  resolvedColors: ResolvedAttributeValue[],
  resolvedSizes: ResolvedAttributeValue[],
  colorAttributeId: number,
  sizeAttributeId: number,
): Promise<number> {
  if (article.existingProductId) {
    const templateId = article.existingProductId;

    await odoo.write("product.template", [templateId], {
      list_price: parseFloat(article.salePrice) || 0,
      default_code: article.referencia || "",
      description_ecommerce: article.description || "",
      is_storable: true,
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
    is_storable: true,
    ...(article.category?.id ? { categ_id: article.category.id } : {}),
    ...(attributeLines.length > 0
      ? { attribute_line_ids: attributeLines }
      : {}),
  });

  return templateId;
}

export async function syncProductImages(
  templateId: number,
  article: Article,
  resolvedColors: ResolvedAttributeValue[],
  variantMap: Map<string, number>,
): Promise<void> {
  // ── ELIMINAR imágenes adicionales borradas por el usuario ─────────────────
  const deletedIds = article.deletedOdooImageIds ?? [];
  if (deletedIds.length > 0) {
    try {
      await odoo.unlink("product.image", deletedIds);
    } catch (err) {
      console.error("Error eliminando imágenes de Odoo:", err);
    }
  }

  // ── LIMPIAR imagen primaria de colores donde se borró todo ────────────────
  const clearedColors = article.clearedPrimaryColorNames ?? [];
  for (const colorName of clearedColors) {
    const resolvedColor = resolvedColors.find(
      (c) => c.name.toLowerCase() === colorName.toLowerCase(),
    );
    if (!resolvedColor) continue;
    const variantIdsForColor: number[] = [];
    for (const [key, variantId] of variantMap.entries()) {
      if (key.startsWith(`${resolvedColor.id}:`)) variantIdsForColor.push(variantId);
    }
    if (variantIdsForColor.length > 0) {
      try {
        await odoo.write("product.product", variantIdsForColor, { image_variant_1920: false });
      } catch (err) {
        console.error(`Error limpiando imagen primaria para color ${colorName}:`, err);
      }
    }
  }

  if (!article.colorImages || Object.keys(article.colorImages).length === 0) return;

  let templateImageWritten = false;

  for (const [colorName, images] of Object.entries(article.colorImages)) {
    const validImages = images.filter((img) => img.base64 && !img.error);
    if (validImages.length === 0) continue;

    const resolvedColor = resolvedColors.find(
      (c) => c.name.toLowerCase() === colorName.toLowerCase(),
    );
    if (!resolvedColor) continue;

    const primaryImage = validImages[0];

    const variantIdsForColor: number[] = [];
    for (const [key, variantId] of variantMap.entries()) {
      if (key.startsWith(`${resolvedColor.id}:`)) variantIdsForColor.push(variantId);
    }

    // ── IMAGEN PRINCIPAL DE VARIANTE ──────────────────────────────────────────
    if (variantIdsForColor.length > 0 && !primaryImage.isFromOdoo) {
      try {
        await odoo.write("product.product", variantIdsForColor, {
          image_variant_1920: primaryImage.base64,
        });
      } catch (err) {
        console.error(`Error seteando imagen principal para color ${colorName}:`, err);
      }

      // ── IMAGEN PRINCIPAL DEL TEMPLATE (primera imagen nueva que aparezca) ───
      // product.template.image_1920 es necesaria para la vista de catálogo y web.
      if (!templateImageWritten) {
        try {
          await odoo.write("product.template", [templateId], {
            image_1920: primaryImage.base64,
          });
          templateImageWritten = true;
        } catch (err) {
          console.error(`Error seteando image_1920 en template ${templateId}:`, err);
        }
      }
    }

    // ── IMÁGENES ADICIONALES — solo crear las nuevas (sin odooId) ────────────
    const newAdditionalImages = validImages.slice(1).filter((img) => !img.odooId);

    for (const img of newAdditionalImages) {
      try {
        await odoo.create("product.image", {
          product_tmpl_id: templateId,
          name: `${colorName} - ${img.fileName}`,
          image_1920: img.base64,
        });
      } catch (err) {
        console.error(`Error agregando imagen adicional para color ${colorName}:`, err);
      }
    }
  }
}

export async function getVariants(templateId: number): Promise<OdooVariant[]> {
  return odoo.searchRead(
    "product.product",
    [["product_tmpl_id", "=", templateId]],
    ["id", "product_template_attribute_value_ids"],
  );
}

export async function mapVariantToColorSize(
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
