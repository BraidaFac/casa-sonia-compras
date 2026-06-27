import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import { watermarkPDF, generateGridPDF } from "@/lib/pdf";
import type {
  Article,
  ArticleRow,
  AttributeValue,
  ColorImages,
  ColorValue,
  ProductAttribute,
  ProductCategory,
  SizeValue,
} from "@/types";
import {
  resolveAttributeValues,
  resolveOrCreateColors,
  getOrCreateProduct,
  getVariants,
  mapVariantToColorSize,
  syncProductImages,
  type ResolvedAttributeValue,
} from "@/lib/odooProducts";

interface OdooPurchaseLine {
  id: number;
  product_id: [number, string] | number;
  product_qty: number;
  price_unit: number;
}

interface OdooVariantRecord {
  id: number;
  product_template_attribute_value_ids: number[];
}

interface PtavRecord {
  id: number;
  attribute_id: [number, string] | number;
  product_attribute_value_id: [number, string] | number;
}

function getId(val: [number, string] | number | false): number | null {
  if (!val) return null;
  return Array.isArray(val) ? val[0] : val;
}

function getName(val: [number, string] | number | false): string {
  if (!val) return "";
  return Array.isArray(val) ? val[1] : "";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    // 1. Read order header
    const orders = await odoo.read("purchase.order", [orderId], [
      "id",
      "name",
      "partner_id",
      "date_order",
      "x_studio_sucursal",
      "write_date",
      "state",
      "order_line",
      "picking_ids",
    ]);

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const order = orders[0];

    if (!order.order_line || order.order_line.length === 0) {
      return NextResponse.json({
        order: buildOrderHeader(order),
        articles: [],
      });
    }

    // 2. Read order lines
    const lines: OdooPurchaseLine[] = await odoo.read(
      "purchase.order.line",
      order.order_line,
      ["id", "product_id", "product_qty", "price_unit"],
    );

    // 3. Get color attribute ID
    const colorAttrs = await odoo.searchRead(
      "product.attribute",
      [["name", "ilike", "Color"]],
      ["id", "name"],
    );
    const colorAttr = colorAttrs.find((a: { name: string }) =>
      a.name.toLowerCase().includes("color"),
    );
    if (!colorAttr) throw new Error('Atributo "Color" no encontrado en Odoo');
    const colorAttributeId: number = colorAttr.id;

    // 3b. Get size attribute IDs (same logic as /api/size-attributes)
    const sizeAttrRecords = await odoo.searchRead(
      "product.attribute",
      ["|", ["name", "ilike", "Talle"], ["name", "ilike", "Tamaño"]],
      ["id", "create_variant"],
    );
    const sizeAttributeIds = new Set<number>(
      sizeAttrRecords
        .filter((a: { create_variant: string }) => a.create_variant === "always")
        .map((a: { id: number }) => a.id),
    );

    // 4. Resolve template ID per line via product.product
    const lineVariantIds = [
      ...new Set(lines.map((l) => getId(l.product_id)).filter(Boolean) as number[]),
    ];
    const lineVariants = lineVariantIds.length > 0
      ? await odoo.read("product.product", lineVariantIds, ["id", "product_tmpl_id"])
      : [];
    const variantToTemplate = new Map<number, number>();
    for (const v of lineVariants) {
      const tmplId = getId(v.product_tmpl_id);
      if (tmplId) variantToTemplate.set(v.id as number, tmplId);
    }

    // 5. Group lines by template ID
    const linesByTemplate = new Map<number, OdooPurchaseLine[]>();
    for (const line of lines) {
      const variantId = getId(line.product_id);
      if (!variantId) continue;
      const tmplId = variantToTemplate.get(variantId);
      if (!tmplId) continue;
      if (!linesByTemplate.has(tmplId)) linesByTemplate.set(tmplId, []);
      linesByTemplate.get(tmplId)!.push(line);
    }

    // 6. Reconstruct Article[] — one per template
    const articles: Article[] = [];

    for (const [templateId, tmplLines] of linesByTemplate) {
      // a. Read product.template
      const templates = await odoo.read("product.template", [templateId], [
        "id",
        "name",
        "standard_price",
        "list_price",
        "default_code",
        "x_studio_referencia",
        "categ_id",
        "description_ecommerce",
        "attribute_line_ids",
      ]);
      if (!templates || templates.length === 0) continue;
      const tmpl = templates[0];

      // b. Read attribute lines for this template
      const attrLineIds: number[] = tmpl.attribute_line_ids || [];
      const attrLines =
        attrLineIds.length > 0
          ? await odoo.read(
              "product.template.attribute.line",
              attrLineIds,
              ["id", "attribute_id", "value_ids"],
            )
          : [];

      // c. Classify attribute lines: color | size (any non-color variant line) | extra
      let sizeAttributeId: number | null = null;
      const extraAttrLines: typeof attrLines = [];

      for (const attrLine of attrLines) {
        const attrId = getId(attrLine.attribute_id);
        if (attrId === colorAttributeId) continue; // color — handled separately
        // Determine if this line generates variants by checking if any order-line variant
        // uses it. We identify size as the first non-color attribute found in PTAVs.
        // Set after PTAV analysis below; for now collect as extra candidates.
        extraAttrLines.push(attrLine);
      }

      // d. Get unique variant IDs referenced by lines
      const variantIds = [
        ...new Set(tmplLines.map((l) => getId(l.product_id)).filter(Boolean) as number[]),
      ];

      // e. Read product.product variants
      const variants: (OdooVariantRecord & { image_variant_1920: string | false })[] = await odoo.read(
        "product.product",
        variantIds,
        ["id", "product_template_attribute_value_ids", "image_variant_1920"],
      );

      // f. Batch read all PTAV records
      const allPtavIds = [
        ...new Set(variants.flatMap((v) => v.product_template_attribute_value_ids || [])),
      ];

      const ptavMap: Record<number, { attributeId: number; pavId: number }> = {};
      if (allPtavIds.length > 0) {
        const ptavRecords: PtavRecord[] = await odoo.read(
          "product.template.attribute.value",
          allPtavIds,
          ["id", "attribute_id", "product_attribute_value_id"],
        );
        for (const ptav of ptavRecords) {
          ptavMap[ptav.id] = {
            attributeId: getId(ptav.attribute_id)!,
            pavId: getId(ptav.product_attribute_value_id)!,
          };
        }
      }

      // g. Determine sizeAttributeId: first attribute in PTAVs that matches known size attributes
      for (const ptav of Object.values(ptavMap)) {
        if (sizeAttributeIds.has(ptav.attributeId) && !sizeAttributeId) {
          sizeAttributeId = ptav.attributeId;
          break;
        }
      }

      // Remove all variant-generating attrs from extraAttrLines (color, size, Diseño, etc.)
      const variantAttrIds = new Set<number>(Object.values(ptavMap).map((p) => p.attributeId));
      const filteredExtraLines = extraAttrLines.filter((l: { attribute_id: [number, string] | number; value_ids: number[] }) => {
        const attrId = getId(l.attribute_id);
        return attrId !== null && !variantAttrIds.has(attrId);
      });

      // h. Build variantId → { colorPavId, sizePavId }
      const variantColorSize = new Map<
        number,
        { colorPavId: number | null; sizePavId: number | null }
      >();
      for (const variant of variants) {
        let colorPavId: number | null = null;
        let sizePavId: number | null = null;
        for (const ptavId of variant.product_template_attribute_value_ids || []) {
          const ptav = ptavMap[ptavId];
          if (!ptav) continue;
          if (ptav.attributeId === colorAttributeId) colorPavId = ptav.pavId;
          if (sizeAttributeId && ptav.attributeId === sizeAttributeId)
            sizePavId = ptav.pavId;
        }
        variantColorSize.set(variant.id, { colorPavId, sizePavId });
      }

      // i. Collect unique PAV IDs for colors and sizes
      const uniqueColorPavIds = new Set<number>();
      const uniqueSizePavIds = new Set<number>();
      for (const variantId of variantIds) {
        const cs = variantColorSize.get(variantId);
        if (!cs) continue;
        if (cs.colorPavId != null) uniqueColorPavIds.add(cs.colorPavId);
        if (cs.sizePavId != null) uniqueSizePavIds.add(cs.sizePavId);
      }

      // j. Read color PAV records → ColorValue map
      const colorPavMap = new Map<number, ColorValue>();
      if (uniqueColorPavIds.size > 0) {
        const colorPavs = await odoo.read(
          "product.attribute.value",
          [...uniqueColorPavIds],
          ["id", "name", "html_color", "x_studio_color_base"],
        );
        for (const pav of colorPavs) {
          colorPavMap.set(pav.id, {
            id: pav.id,
            name: pav.name,
            hexColor: pav.html_color || "",
            colorBase: pav.x_studio_color_base || "",
            isNew: false,
          });
        }
      }

      // k. Read size PAV records → SizeValue map
      const sizePavMap = new Map<number, SizeValue>();
      if (uniqueSizePavIds.size > 0) {
        const sizePavs = await odoo.read(
          "product.attribute.value",
          [...uniqueSizePavIds],
          ["id", "name", "x_studio_equivalencias"],
        );
        for (const pav of sizePavs) {
          sizePavMap.set(pav.id, {
            id: pav.id,
            name: pav.name,
            equivalencia: pav.x_studio_equivalencias || "",
          });
        }
      }

      // l. Detect price granularity
      const priceSet = new Set(tmplLines.map((l) => l.price_unit));
      const priceGranular = priceSet.size > 1;
      const basePrice = tmplLines[0]?.price_unit ?? 0;

      // m. Order size PAV IDs by their first appearance in tmplLines
      const orderedSizePavIds: number[] = [];
      const seenSizePavIds = new Set<number>();
      for (const line of tmplLines) {
        const variantId = getId(line.product_id);
        if (!variantId) continue;
        const cs = variantColorSize.get(variantId);
        if (!cs?.sizePavId) continue;
        if (!seenSizePavIds.has(cs.sizePavId)) {
          seenSizePavIds.add(cs.sizePavId);
          orderedSizePavIds.push(cs.sizePavId);
        }
      }
      const sizes: SizeValue[] = orderedSizePavIds
        .map((sid) => sizePavMap.get(sid))
        .filter(Boolean) as SizeValue[];

      // n. Group lines by colorPavId → ArticleRow[]
      // Use insertion order to preserve original row ordering
      const rowsByColorPav = new Map<
        number | null,
        {
          color: ColorValue | null;
          sizeEntries: Map<number, { qty: number; price: number; lineId: number }>;
        }
      >();

      for (const line of tmplLines) {
        const variantId = getId(line.product_id);
        if (!variantId) continue;
        const cs = variantColorSize.get(variantId);
        if (!cs) continue;

        const { colorPavId, sizePavId } = cs;
        if (!rowsByColorPav.has(colorPavId)) {
          rowsByColorPav.set(colorPavId, {
            color: colorPavId != null ? (colorPavMap.get(colorPavId) ?? null) : null,
            sizeEntries: new Map(),
          });
        }
        if (sizePavId != null) {
          rowsByColorPav
            .get(colorPavId)!
            .sizeEntries.set(sizePavId, { qty: line.product_qty, price: line.price_unit, lineId: line.id });
        }
      }

      const rows: ArticleRow[] = [];
      for (const [, rowData] of rowsByColorPav) {
        const quantities: Record<string, string> = {};
        const rowPrices: Record<string, string> = {};
        const odooLineIds: Record<string, number> = {};
        for (const size of sizes) {
          const entry = rowData.sizeEntries.get(size.id);
          if (entry && entry.qty > 0) {
            quantities[size.name] = String(entry.qty);
            rowPrices[size.name] = String(entry.price);
            odooLineIds[size.name] = entry.lineId;
          }
        }
        rows.push({
          id: crypto.randomUUID(),
          color: rowData.color,
          quantities,
          prices: priceGranular ? rowPrices : undefined,
          warehouseQuantities: {},
          odooLineIds,
        });
      }

      // p-images. Build colorImages from Odoo data
      const colorImages: ColorImages = {};

      // Primary images: one per color from image_variant_1920
      const seenColorPavIds = new Set<number>();
      for (const variant of variants) {
        if (!variant.image_variant_1920) continue;
        const cs = variantColorSize.get(variant.id);
        if (!cs?.colorPavId || seenColorPavIds.has(cs.colorPavId)) continue;
        seenColorPavIds.add(cs.colorPavId);
        const color = colorPavMap.get(cs.colorPavId);
        if (!color) continue;
        colorImages[color.name] = [{
          id: crypto.randomUUID(),
          fileName: `${color.name}.jpg`,
          base64: variant.image_variant_1920,
          mimeType: "image/jpeg",
          previewUrl: `data:image/jpeg;base64,${variant.image_variant_1920}`,
          isFromOdoo: true,
        }];
      }

      // Additional images from product.image (name format: "ColorName - filename")
      const additionalImgs = await odoo.searchRead(
        "product.image",
        [["product_tmpl_id", "=", templateId]],
        ["id", "name", "image_1920"],
      );
      for (const img of additionalImgs) {
        if (!img.image_1920) continue;
        const sepIdx = (img.name as string).indexOf(" - ");
        const rawColorName = sepIdx > -1 ? (img.name as string).slice(0, sepIdx) : null;
        if (!rawColorName) continue;
        const matchedColorName = Object.keys(colorImages).find(
          (c) => c.toLowerCase() === rawColorName.toLowerCase(),
        ) ?? rows.find((r) => r.color?.name.toLowerCase() === rawColorName.toLowerCase())?.color?.name;
        if (!matchedColorName) continue;
        if (!colorImages[matchedColorName]) colorImages[matchedColorName] = [];
        colorImages[matchedColorName].push({
          id: crypto.randomUUID(),
          fileName: img.name as string,
          base64: img.image_1920 as string,
          mimeType: "image/jpeg",
          previewUrl: `data:image/jpeg;base64,${img.image_1920}`,
          isFromOdoo: true,
          odooId: img.id as number,
        });
      }

      // o. Build extra (non-variant) ProductAttribute[]
      const extraAttributes: ProductAttribute[] = [];
      for (const attrLine of filteredExtraLines) {
        const attrId = getId(attrLine.attribute_id);
        const attrName = getName(attrLine.attribute_id);
        if (!attrId) continue;

        const valueIds: number[] = attrLine.value_ids || [];
        const values: AttributeValue[] = [];
        if (valueIds.length > 0) {
          const pavs = await odoo.read("product.attribute.value", valueIds, ["id", "name"]);
          for (const pav of pavs) values.push({ id: pav.id, name: pav.name });
        }

        extraAttributes.push({
          attributeId: attrId,
          attributeName: attrName,
          values,
          generatesVariants: false,
        });
      }

      // p. Resolve category
      let category: ProductCategory | null = null;
      if (tmpl.categ_id) {
        const categId = getId(tmpl.categ_id);
        const categFullName = getName(tmpl.categ_id);
        if (categId) {
          category = {
            id: categId,
            name: categFullName.split(" / ").pop() || categFullName,
            completeName: categFullName,
          };
        }
      }

      articles.push({
        id: crypto.randomUUID(),
        name: tmpl.name || "",
        existingProductId: templateId,
        referencia: tmpl.x_studio_referencia || tmpl.default_code || "",
        price: String(basePrice),
        salePrice: String(tmpl.list_price || 0),
        priceGranular,
        category,
        rows,
        sizes,
        sizeAttributeId,
        attributes: extraAttributes,
        description: tmpl.description_ecommerce || "",
        colorImages,
        deletedOdooImageIds: [],
        clearedPrimaryColorNames: [],
        maxCoeficiente: 0,
      });
    }

    return NextResponse.json({
      order: buildOrderHeader(order),
      articles,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error cargando orden" },
      { status: 500 },
    );
  }
}

function buildOrderHeader(order: {
  id: number;
  name: string;
  partner_id: [number, string] | number;
  date_order: string;
  x_studio_sucursal: number[] | false;
  write_date: string;
  state: string;
}) {
  const supplierId = Array.isArray(order.partner_id) ? order.partner_id[0] : order.partner_id;
  const supplierName = Array.isArray(order.partner_id) ? order.partner_id[1] : "";
  const warehouseIds: number[] = Array.isArray(order.x_studio_sucursal)
    ? order.x_studio_sucursal
    : [];
  const date = order.date_order ? order.date_order.split(" ")[0] : "";

  return {
    id: order.id,
    name: order.name,
    supplierId,
    supplierName,
    date,
    warehouseIds,
    state: order.state,
    writeDate: order.write_date,
  };
}

async function processNewArticle(
  article: Article,
  colorAttributeId: number,
  linesToCreate: { productVariantId: number; qty: number; price: number }[],
): Promise<void> {
  const colorIdMap = await resolveOrCreateColors(article.rows, colorAttributeId);
  const resolvedColors: ResolvedAttributeValue[] = [];
  for (const [name, id] of colorIdMap.entries()) {
    resolvedColors.push({ id, name });
  }

  const resolvedSizes: ResolvedAttributeValue[] = article.sizeAttributeId
    ? (await resolveAttributeValues(article.sizes, article.sizeAttributeId)).resolved
    : [];

  const templateId = await getOrCreateProduct(
    article,
    resolvedColors,
    resolvedSizes,
    colorAttributeId,
    article.sizeAttributeId ?? 0,
  );

  const variants = await getVariants(templateId);
  const variantMap = await mapVariantToColorSize(
    variants,
    resolvedColors,
    resolvedSizes,
    colorAttributeId,
    article.sizeAttributeId ?? 0,
  );

  for (const row of article.rows) {
    for (const size of article.sizes) {
      const qty = parseInt(row.quantities[size.name] || "0");
      if (qty <= 0) continue;
      const price = article.priceGranular
        ? parseFloat(row.prices?.[size.name] || article.price) || 0
        : parseFloat(article.price) || 0;

      const resolvedColor = row.color
        ? resolvedColors.find((c) => c.name === row.color!.name)
        : null;
      const resolvedSize = resolvedSizes.find((s) => s.name === size.name);
      if (!resolvedSize) continue;

      const key = resolvedColor
        ? `${resolvedColor.id}:${resolvedSize.id}`
        : `:${resolvedSize.id}`;
      const variantId = variantMap.get(key);
      if (!variantId) continue;

      linesToCreate.push({ productVariantId: variantId, qty, price });
    }
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const body = await request.json();
  const { articles, snapshot, supplierId, date, writeDate } = body as {
    articles: Article[];
    snapshot: Article[];
    supplierId: number;
    date: string;
    writeDate: string;
  };

  try {
    const orders = await odoo.read("purchase.order", [orderId], [
      "write_date",
      "picking_ids",
      "state",
      "partner_id",
      "date_order",
    ]);

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const order = orders[0];

    if (order.write_date !== writeDate) {
      return NextResponse.json(
        { error: "La orden fue modificada externamente. Recargá la página." },
        { status: 409 },
      );
    }

    const colorAttrs = await odoo.searchRead(
      "product.attribute",
      [["name", "ilike", "Color"]],
      ["id", "name"],
    );
    const colorAttr = colorAttrs.find((a: { name: string }) =>
      a.name.toLowerCase().includes("color"),
    );
    if (!colorAttr) {
      return NextResponse.json(
        { error: 'Atributo "Color" no encontrado en Odoo' },
        { status: 400 },
      );
    }
    const colorAttributeId: number = colorAttr.id;

    const snapshotLineIds = new Set<number>();
    for (const snapArt of snapshot) {
      for (const row of snapArt.rows) {
        if (row.odooLineIds) {
          for (const lineId of Object.values(row.odooLineIds)) {
            snapshotLineIds.add(lineId);
          }
        }
      }
    }

    const linesToUpdate: { id: number; qty: number; price: number }[] = [];
    const linesToCreate: { productVariantId: number; qty: number; price: number }[] = [];
    const lineIdsToDelete: number[] = [];
    const seenLineIds = new Set<number>();
    const errors: string[] = [];
    const results = { created: 0, updated: 0, deleted: 0 };

    const articleVariantData = new Map<number, {
      resolvedColors: ResolvedAttributeValue[];
      variantMap: Map<string, number>;
    }>();

    for (const article of articles) {
      if (!article.existingProductId) {
        try {
          await processNewArticle(article, colorAttributeId, linesToCreate);
        } catch (err) {
          errors.push(
            `Error procesando artículo nuevo "${article.name}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        continue;
      }

      const snapArt = snapshot.find((s) => s.existingProductId === article.existingProductId);

      const hasNewLines = article.rows.some((row) =>
        article.sizes.some((size) => {
          const qty = parseInt(row.quantities[size.name] || "0");
          return qty > 0 && !row.odooLineIds?.[size.name];
        }),
      );

      let variantMap: Map<string, number> | null = null;
      let resolvedColors: ResolvedAttributeValue[] = [];
      let resolvedSizes: ResolvedAttributeValue[] = [];

      if (hasNewLines) {
        try {
          const colorIdMap = await resolveOrCreateColors(article.rows, colorAttributeId);
          for (const [name, colorId] of colorIdMap.entries()) {
            resolvedColors.push({ id: colorId, name });
          }

          if (article.sizeAttributeId) {
            resolvedSizes = (
              await resolveAttributeValues(article.sizes, article.sizeAttributeId)
            ).resolved;
          }

          await getOrCreateProduct(
            article,
            resolvedColors,
            resolvedSizes,
            colorAttributeId,
            article.sizeAttributeId ?? 0,
          );

          const variants = await getVariants(article.existingProductId);
          variantMap = await mapVariantToColorSize(
            variants,
            resolvedColors,
            resolvedSizes,
            colorAttributeId,
            article.sizeAttributeId ?? 0,
          );
        } catch (err) {
          errors.push(
            `Error preparando variantes para "${article.name}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (variantMap && article.existingProductId) {
        articleVariantData.set(article.existingProductId, { resolvedColors, variantMap });
      }

      for (const row of article.rows) {
        for (const size of article.sizes) {
          const qty = parseInt(row.quantities[size.name] || "0");
          const price = article.priceGranular
            ? parseFloat(row.prices?.[size.name] || article.price) || 0
            : parseFloat(article.price) || 0;
          const lineId = row.odooLineIds?.[size.name];

          if (lineId) {
            seenLineIds.add(lineId);
            if (qty <= 0) {
              lineIdsToDelete.push(lineId);
            } else {
              const snapRow = snapArt?.rows.find((r) => r.odooLineIds?.[size.name] === lineId);
              const snapQty = parseInt(snapRow?.quantities[size.name] || "0");
              const snapPrice = article.priceGranular
                ? parseFloat(snapRow?.prices?.[size.name] || snapArt?.price || "0") || 0
                : parseFloat(snapArt?.price || "0") || 0;
              if (qty !== snapQty || price !== snapPrice) {
                linesToUpdate.push({ id: lineId, qty, price });
              }
            }
          } else if (qty > 0 && variantMap) {
            const resolvedColor = row.color
              ? resolvedColors.find((c) => c.name === row.color!.name)
              : null;
            const resolvedSize = resolvedSizes.find((s) => s.name === size.name);
            if (!resolvedSize) continue;

            const key = resolvedColor
              ? `${resolvedColor.id}:${resolvedSize.id}`
              : `:${resolvedSize.id}`;
            const variantId = variantMap.get(key);
            if (variantId) {
              linesToCreate.push({ productVariantId: variantId, qty, price });
            }
          }
        }
      }
    }

    for (const snapLineId of snapshotLineIds) {
      if (!seenLineIds.has(snapLineId) && !lineIdsToDelete.includes(snapLineId)) {
        lineIdsToDelete.push(snapLineId);
      }
    }

    const currentSupplierId = Array.isArray(order.partner_id)
      ? order.partner_id[0]
      : order.partner_id;
    const currentDate = order.date_order ? order.date_order.split(" ")[0] : "";
    const headerChanges: Record<string, unknown> = {};
    if (supplierId && supplierId !== currentSupplierId) headerChanges.partner_id = supplierId;
    if (date && date !== currentDate) headerChanges.date_order = date;
    if (Object.keys(headerChanges).length > 0) {
      try {
        await odoo.write("purchase.order", [orderId], headerChanges);
      } catch (err) {
        errors.push(`Error actualizando encabezado: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const line of linesToCreate) {
      try {
        await odoo.create("purchase.order.line", {
          order_id: orderId,
          product_id: line.productVariantId,
          product_qty: line.qty,
          price_unit: line.price,
        });
        results.created++;
      } catch (err) {
        errors.push(`Error creando línea: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const line of linesToUpdate) {
      try {
        await odoo.write("purchase.order.line", [line.id], {
          product_qty: line.qty,
          price_unit: line.price,
        });
        results.updated++;
      } catch (err) {
        errors.push(`Error actualizando línea ${line.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (lineIdsToDelete.length > 0) {
      try {
        await odoo.call("purchase.order", "button_draft", { ids: [orderId] });
      } catch (err) {
        errors.push(`Error pasando a borrador: ${err instanceof Error ? err.message : String(err)}`);
      }
      try {
        await odoo.unlink("purchase.order.line", lineIdsToDelete);
        results.deleted += lineIdsToDelete.length;
      } catch (err) {
        errors.push(`Error eliminando líneas: ${err instanceof Error ? err.message : String(err)}`);
      }
      try {
        await odoo.call("purchase.order", "button_confirm", { ids: orderId });
      } catch (err) {
        errors.push(`Error reconfirmando orden: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Image sync ────────────────────────────────────────────────────────────
    for (const article of articles) {
      if (!article.existingProductId) continue;
      const hasImageWork =
        (article.deletedOdooImageIds?.length ?? 0) > 0 ||
        (article.clearedPrimaryColorNames?.length ?? 0) > 0 ||
        Object.values(article.colorImages ?? {}).some((imgs) =>
          imgs.some((img) => !img.isFromOdoo && img.base64),
        );
      if (!hasImageWork) continue;

      let data = articleVariantData.get(article.existingProductId);
      if (!data) {
        // Compute on demand for articles without new lines
        const colorIdMap = new Map<string, number>();
        for (const row of article.rows) {
          if (row.color?.id != null) colorIdMap.set(row.color.name, row.color.id);
        }
        const rc: ResolvedAttributeValue[] = [...colorIdMap.entries()].map(([name, id]) => ({ id, name }));
        const vs = await getVariants(article.existingProductId);
        const rs: ResolvedAttributeValue[] = article.sizes
          .filter((s) => s.id != null)
          .map((s) => ({ id: s.id, name: s.name }));
        const vm = article.sizeAttributeId
          ? await mapVariantToColorSize(vs, rc, rs, colorAttributeId, article.sizeAttributeId)
          : new Map<string, number>();
        data = { resolvedColors: rc, variantMap: vm };
      }

      try {
        await syncProductImages(article.existingProductId, article, data.resolvedColors, data.variantMap);
      } catch (imgErr) {
        errors.push(
          `Error sincronizando imágenes de "${article.name}": ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`,
        );
      }
    }

    // ── PDF: watermark old, generate new ────────────────────────────────────
    let safeName = "";
    try {
      const orderRecords = await odoo.searchRead(
        "purchase.order",
        [["id", "=", orderId]],
        ["name", "partner_id", "date_order"],
      );
      if (orderRecords.length > 0) {
        const orderRecord = orderRecords[0];
        safeName = `OC-${String(orderRecord.name).replace(/\//g, "-")}`;

        const existingPdfs = await odoo.searchRead(
          "ir.attachment",
          [
            ["res_model", "=", "purchase.order"],
            ["res_id", "=", orderId],
            ["mimetype", "=", "application/pdf"],
          ],
          ["id", "name", "datas"],
        );

        for (const att of existingPdfs) {
          if (!att.datas) continue;
          try {
            const pdfBytes = Buffer.from(att.datas as string, "base64");
            const watermarked = await watermarkPDF(new Uint8Array(pdfBytes));
            const newName = (att.name as string).replace(/\.pdf$/i, "_ANULADO.pdf");
            await odoo.write("ir.attachment", [att.id as number], {
              name: newName,
              datas: Buffer.from(watermarked).toString("base64"),
            });
          } catch (wErr) {
            errors.push(`Error aplicando watermark a ${att.name}: ${wErr instanceof Error ? wErr.message : String(wErr)}`);
          }
        }

        const [supplierPdf, internalPdf] = await Promise.all([
          generateGridPDF({ order: orderRecord, articles, printColumns: [], printValues: {}, selectedWarehouses: [], supplierMode: true }),
          generateGridPDF({ order: orderRecord, articles, printColumns: [], printValues: {}, selectedWarehouses: [], supplierMode: false }),
        ]);

        await Promise.all([
          odoo.create("ir.attachment", {
            name: `${safeName}.pdf`,
            type: "binary",
            datas: Buffer.from(supplierPdf).toString("base64"),
            res_model: "purchase.order",
            res_id: orderId,
            mimetype: "application/pdf",
          }),
          odoo.create("ir.attachment", {
            name: `${safeName}-INT.pdf`,
            type: "binary",
            datas: Buffer.from(internalPdf).toString("base64"),
            res_model: "purchase.order",
            res_id: orderId,
            mimetype: "application/pdf",
          }),
        ]);
      }
    } catch (pdfErr) {
      errors.push(`Error regenerando PDFs: ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
    }

    // ── Chatter: audit trail ─────────────────────────────────────────────────
    try {
      const lines: string[] = [];
      if (results.created > 0) lines.push(`Líneas creadas: ${results.created}`);
      if (results.updated > 0) lines.push(`Líneas modificadas: ${results.updated}`);
      if (results.deleted > 0) lines.push(`Líneas eliminadas: ${results.deleted}`);
      if (Object.keys(headerChanges).length > 0) lines.push("Encabezado de orden modificado");
      const listItems = lines.map((l) => `<li>${l}</li>`).join("");
      const htmlBody = `<p><strong>Modificada desde Casa Sonia Compras</strong></p><ul>${listItems}</ul>`;
      await odoo.call("purchase.order", "message_post", {
        ids: [orderId],
        body: htmlBody,
        message_type: "comment",
        subtype_xmlid: "mail.mt_note",
      });
    } catch (chatErr) {
      console.error("Error posting chatter note:", chatErr);
    }

    return NextResponse.json({ ok: errors.length === 0, results, errors, pdfName: safeName ? `${safeName}.pdf` : null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al guardar la orden" },
      { status: 500 },
    );
  }
}
