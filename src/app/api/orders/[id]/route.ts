import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import type {
  Article,
  ArticleRow,
  AttributeValue,
  ColorValue,
  ProductAttribute,
  ProductCategory,
  SizeValue,
} from "@/types";

interface OdooPurchaseLine {
  id: number;
  product_id: [number, string] | number;
  product_qty: number;
  price_unit: number;
  product_template_id: [number, string] | number | false;
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

    if (order.picking_ids && order.picking_ids.length > 0) {
      return NextResponse.json(
        { error: "Esta orden tiene recepciones y no puede editarse desde la app." },
        { status: 403 },
      );
    }

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
      ["id", "product_id", "product_qty", "price_unit", "product_template_id"],
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

    // 4. Group lines by template ID
    const linesByTemplate = new Map<number, OdooPurchaseLine[]>();
    for (const line of lines) {
      const tmplId = getId(line.product_template_id);
      if (!tmplId) continue;
      if (!linesByTemplate.has(tmplId)) linesByTemplate.set(tmplId, []);
      linesByTemplate.get(tmplId)!.push(line);
    }

    // 5. Reconstruct Article[] — one per template
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
      const variants: OdooVariantRecord[] = await odoo.read(
        "product.product",
        variantIds,
        ["id", "product_template_attribute_value_ids"],
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

      // g. Determine sizeAttributeId: first non-color attribute ID found in PTAV records
      for (const ptav of Object.values(ptavMap)) {
        if (ptav.attributeId !== colorAttributeId && !sizeAttributeId) {
          sizeAttributeId = ptav.attributeId;
          break;
        }
      }

      // Remove size line from extraAttrLines (non-variant extra attributes only)
      const filteredExtraLines = extraAttrLines.filter((l: { attribute_id: [number, string] | number; value_ids: number[] }) => {
        const attrId = getId(l.attribute_id);
        return attrId !== sizeAttributeId;
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
          sizeEntries: Map<number, { qty: number; price: number }>;
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
            .sizeEntries.set(sizePavId, { qty: line.product_qty, price: line.price_unit });
        }
      }

      const rows: ArticleRow[] = [];
      for (const [, rowData] of rowsByColorPav) {
        const quantities: Record<string, string> = {};
        const rowPrices: Record<string, string> = {};
        for (const size of sizes) {
          const entry = rowData.sizeEntries.get(size.id);
          if (entry && entry.qty > 0) {
            quantities[size.name] = String(entry.qty);
            rowPrices[size.name] = String(entry.price);
          }
        }
        rows.push({
          id: crypto.randomUUID(),
          color: rowData.color,
          quantities,
          prices: priceGranular ? rowPrices : undefined,
          warehouseQuantities: {},
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
        colorImages: {},
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
