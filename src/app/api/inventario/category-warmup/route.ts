import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";
import { getAttrMetadata } from "@/lib/productCache";
import type { InventoryArticle } from "@/types";

function extractLocalName(completeName: string): string {
  const parts = completeName.split(" / ");
  return parts[parts.length - 1] ?? completeName;
}

/**
 * GET /api/inventario/category-warmup?categoryIds=1,2,3&warehouseId=5
 *
 * Bulk pre-load of all active variants with barcodes for the given leaf
 * category IDs. Used to warm the client-side articleCache before scanning.
 *
 * lastPurchaseDate is intentionally omitted (null) for performance —
 * individual barcode fetches will supply it when a product is actually scanned.
 */
export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const categoryIdsParam = searchParams.get("categoryIds");
  const warehouseIdParam = searchParams.get("warehouseId");

  if (!categoryIdsParam || !warehouseIdParam) {
    return NextResponse.json(
      { error: "categoryIds y warehouseId son requeridos" },
      { status: 400 },
    );
  }

  const categoryIds = categoryIdsParam
    .split(",")
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);
  const warehouseId = parseInt(warehouseIdParam);

  if (categoryIds.length === 0) {
    return NextResponse.json([] satisfies InventoryArticle[]);
  }

  // ── 1. All active variants with barcodes in these categories ────────────────
  const variants = await odoo.fetchAll<{
    id: number;
    name: string;
    barcode: string | false;
    default_code: string | false;
    list_price: number;
    standard_price: number;
    product_tmpl_id: [number, string] | number;
    categ_id: [number, string] | false;
    product_template_attribute_value_ids: number[];
  }>(
    "product.product",
    [
      ["categ_id", "in", categoryIds],
      ["active", "=", true],
      ["barcode", "!=", false],
    ],
    [
      "id",
      "name",
      "barcode",
      "default_code",
      "list_price",
      "standard_price",
      "product_tmpl_id",
      "categ_id",
      "product_template_attribute_value_ids",
    ],
    "name asc",
  );

  if (variants.length === 0) {
    return NextResponse.json([] satisfies InventoryArticle[]);
  }

  const productIds = variants.map((v) => v.id);
  const templateIds = [
    ...new Set(
      variants.map((v) =>
        Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : (v.product_tmpl_id as number),
      ),
    ),
  ];
  const uniqueCategIds = [
    ...new Set(
      variants
        .map((v) => (Array.isArray(v.categ_id) ? v.categ_id[0] : null))
        .filter((id): id is number => id !== null),
    ),
  ];
  const allPtavIds = [
    ...new Set(variants.flatMap((v) => v.product_template_attribute_value_ids)),
  ];

  // ── 2. Attr metadata first (needed to conditionally fetch brand lines) ────────
  const { sizeAttrIdSet, brandAttrId, colorAttrId } = await getAttrMetadata();

  // ── 3. Parallel: locations + PTAVs + categories + brand lines ────────────────
  const [locations, ptavRecords, categoryRecords, brandLines] = await Promise.all([
    odoo.searchRead(
      "stock.location",
      [
        ["warehouse_id", "=", warehouseId],
        ["usage", "=", "internal"],
        ["active", "=", true],
      ],
      ["id"],
    ) as Promise<{ id: number }[]>,

    allPtavIds.length > 0
      ? (odoo.read(
          "product.template.attribute.value",
          allPtavIds,
          ["id", "attribute_id", "name"],
        ) as Promise<{ id: number; attribute_id: [number, string] | number; name: string }[]>)
      : Promise.resolve([]),

    uniqueCategIds.length > 0
      ? (odoo.read("product.category", uniqueCategIds, ["id", "name", "parent_id"]) as Promise<
          { id: number; name: string; parent_id: [number, string] | false }[]
        >)
      : Promise.resolve([]),

    brandAttrId
      ? (odoo.searchRead(
          "product.template.attribute.line",
          [
            ["product_tmpl_id", "in", templateIds],
            ["attribute_id", "=", brandAttrId],
          ],
          ["product_tmpl_id", "value_ids"],
        ) as Promise<{ product_tmpl_id: [number, string] | number; value_ids: number[] }[]>)
      : Promise.resolve([]),
  ]);

  // ── 3. stock.quant for all products in this warehouse ───────────────────────
  const locationIds = locations.map((l) => l.id);
  const quants =
    locationIds.length > 0
      ? await odoo.fetchAll<{ product_id: [number, string] | number; quantity: number }>(
          "stock.quant",
          [
            ["product_id", "in", productIds],
            ["location_id", "in", locationIds],
          ],
          ["product_id", "quantity"],
          "id asc",
        )
      : [];

  // ── 4. Brand attribute values ────────────────────────────────────────────────
  const allBrandValueIds = [
    ...new Set(brandLines.flatMap((l) => l.value_ids)),
  ];
  const brandAttributeValues =
    allBrandValueIds.length > 0
      ? (await odoo.read("product.attribute.value", allBrandValueIds, ["id", "name"]) as {
          id: number;
          name: string;
        }[])
      : [];
  const brandValueMap = new Map(brandAttributeValues.map((bv) => [bv.id, bv.name]));

  // ── Build lookup maps ────────────────────────────────────────────────────────

  const ptavMap = new Map(ptavRecords.map((p) => [p.id, p]));

  const categoryMap = new Map(categoryRecords.map((c) => [c.id, c]));

  const qtyOnHandMap = new Map<number, number>();
  for (const q of quants) {
    const pid = Array.isArray(q.product_id) ? q.product_id[0] : (q.product_id as number);
    qtyOnHandMap.set(pid, (qtyOnHandMap.get(pid) ?? 0) + (q.quantity ?? 0));
  }

  // brand per template: first value_id of the brand line
  const brandByTemplate = new Map<number, string>();
  for (const line of brandLines) {
    const tmplId = Array.isArray(line.product_tmpl_id)
      ? line.product_tmpl_id[0]
      : (line.product_tmpl_id as number);
    const valueId = line.value_ids[0];
    if (valueId !== undefined && brandValueMap.has(valueId)) {
      brandByTemplate.set(tmplId, brandValueMap.get(valueId)!);
    }
  }

  // ── 5. Build InventoryArticle per variant ────────────────────────────────────
  const articles: InventoryArticle[] = variants.map((v) => {
    const templateId = Array.isArray(v.product_tmpl_id)
      ? v.product_tmpl_id[0]
      : (v.product_tmpl_id as number);
    const categId = Array.isArray(v.categ_id) ? v.categ_id[0] : null;
    const categ = categId ? categoryMap.get(categId) : null;
    const categoryName =
      categ?.name ?? (Array.isArray(v.categ_id) ? extractLocalName(v.categ_id[1]) : "");
    const parentRaw =
      categ && Array.isArray(categ.parent_id) ? (categ.parent_id as [number, string]) : null;
    const categoryParentId = parentRaw ? parentRaw[0] : null;
    const categoryParentName = parentRaw ? extractLocalName(parentRaw[1]) : null;

    // Resolve size from PTAVs
    let size: string | null = null;
    for (const ptavId of v.product_template_attribute_value_ids) {
      const ptav = ptavMap.get(ptavId);
      if (!ptav) continue;
      const attrId = Array.isArray(ptav.attribute_id)
        ? ptav.attribute_id[0]
        : (ptav.attribute_id as number);
      if (sizeAttrIdSet.has(attrId)) {
        size = ptav.name;
        break;
      }
    }

    // Resolve color from PTAVs
    let color: string | null = null;
    for (const ptavId of v.product_template_attribute_value_ids) {
      const ptav = ptavMap.get(ptavId);
      if (!ptav) continue;
      const attrId = Array.isArray(ptav.attribute_id)
        ? ptav.attribute_id[0]
        : (ptav.attribute_id as number);
      if (colorAttrId && attrId === colorAttrId) {
        color = ptav.name;
        break;
      }
    }

    return {
      varianteId: v.id,
      productoId: templateId,
      barcode: v.barcode as string,
      defaultCode: (v.default_code as string | false) || null,
      name: v.name,
      qty: 1,
      salePrice: v.list_price ?? 0,
      cost: v.standard_price ?? 0,
      lastPurchaseDate: null, // skipped for warmup performance
      size,
      brand: brandByTemplate.get(templateId) ?? null,
      color,
      categoryId: categId ?? 0,
      categoryName,
      categoryParentId,
      categoryParentName,
      qtyOnHand: qtyOnHandMap.get(v.id) ?? 0,
    };
  });

  return NextResponse.json(articles satisfies InventoryArticle[]);
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
