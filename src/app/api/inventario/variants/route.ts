import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { odoo } from "@/lib/odoo";
import { getAttrMetadata } from "@/lib/productCache";
import type { InventoryArticle } from "@/types";

export async function GET(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const productoId = searchParams.get("productoId");
  const warehouseId = searchParams.get("warehouseId");

  if (!productoId || !warehouseId) {
    return NextResponse.json({ error: "productoId y warehouseId son requeridos" }, { status: 400 });
  }

  const templateId = parseInt(productoId);
  const whId = parseInt(warehouseId);

  // ── 1. All active variants with barcode for this template ─────────────────
  const variants = await odoo.searchRead(
    "product.product",
    [
      ["product_tmpl_id", "=", templateId],
      ["active", "=", true],
      ["barcode", "!=", false],
    ],
    ["id", "name", "barcode", "default_code", "list_price", "standard_price", "product_template_attribute_value_ids", "categ_id"],
  ) as {
    id: number;
    name: string;
    barcode: string | false;
    default_code: string | false;
    list_price: number;
    standard_price: number;
    product_template_attribute_value_ids: number[];
    categ_id: [number, string] | false;
  }[];

  if (variants.length === 0) {
    return NextResponse.json([] satisfies InventoryArticle[]);
  }

  const productIds = variants.map((v) => v.id);
  const firstVariant = variants[0];
  const categId = Array.isArray(firstVariant.categ_id) ? firstVariant.categ_id[0] : null;
  const categNameRaw = Array.isArray(firstVariant.categ_id) ? firstVariant.categ_id[1] : "";

  function extractLocalName(completeName: string): string {
    const parts = completeName.split(" / ");
    return parts[parts.length - 1] ?? completeName;
  }

  // ── 2. Parallel: attr metadata + category parent + warehouse locations ────
  const [{ sizeAttrIdSet, brandAttrId, colorAttrId }, categoryData, locations] = await Promise.all([
    getAttrMetadata(),
    categId
      ? (odoo.read("product.category", [categId], ["id", "name", "parent_id"]) as Promise<
          { id: number; name: string; parent_id: [number, string] | false }[]
        >)
      : Promise.resolve([]),
    odoo.searchRead(
      "stock.location",
      [["warehouse_id", "=", whId], ["usage", "=", "internal"], ["active", "=", true]],
      ["id"],
    ) as Promise<{ id: number }[]>,
  ]);

  const categ = categoryData[0];
  const categoryParentId = categ && Array.isArray(categ.parent_id) ? categ.parent_id[0] : null;
  const rawParentDisplay = categ && Array.isArray(categ.parent_id) ? (categ.parent_id[1] as string) : null;
  const categoryParentName = rawParentDisplay ? extractLocalName(rawParentDisplay) : null;
  const categoryName = categ?.name ?? extractLocalName(categNameRaw);

  // ── 3. Batch: all PTAVs for all variants + quants for all products ─────────
  const allPtavIds = [...new Set(variants.flatMap((v) => v.product_template_attribute_value_ids))];
  const locationIds = locations.map((l) => l.id);

  const [ptavRecords, quants] = await Promise.all([
    allPtavIds.length > 0
      ? (odoo.read("product.template.attribute.value", allPtavIds, ["id", "attribute_id", "name"]) as Promise<
          { id: number; attribute_id: [number, string] | number; name: string }[]
        >)
      : Promise.resolve([]),
    locationIds.length > 0
      ? odoo.fetchAll<{ product_id: [number, string]; quantity: number }>(
          "stock.quant",
          [["product_id", "in", productIds], ["location_id", "in", locationIds]],
          ["product_id", "quantity"],
          "id asc",
        )
      : Promise.resolve([]),
  ]);

  // Build PTAV lookup map
  const ptavMap = new Map(ptavRecords.map((p) => [p.id, p]));

  // Build qty-on-hand map per product
  const qtyOnHandMap = new Map<number, number>();
  for (const q of quants) {
    const pid = Array.isArray(q.product_id) ? q.product_id[0] : null;
    if (!pid) continue;
    qtyOnHandMap.set(pid, (qtyOnHandMap.get(pid) ?? 0) + (q.quantity ?? 0));
  }

  // ── 4. Brand from template attribute line (one query) ─────────────────────
  let brand: string | null = null;
  if (brandAttrId) {
    const brandLines = await odoo.searchRead(
      "product.template.attribute.line",
      [["product_tmpl_id", "=", templateId], ["attribute_id", "=", brandAttrId]],
      ["value_ids"],
    ) as { value_ids: number[] }[];

    const brandValueIds = brandLines[0]?.value_ids ?? [];
    if (brandValueIds.length > 0) {
      const brandValues = await odoo.read("product.attribute.value", brandValueIds, ["name"]) as { name: string }[];
      brand = brandValues[0]?.name ?? null;
    }
  }

  // ── 5. Last purchase date — parallel per product ──────────────────────────
  const lastPurchaseDates = await Promise.all(
    productIds.map((pid) =>
      odoo.searchRead(
        "purchase.order",
        [
          ["order_line.product_id", "=", pid],
          ["state", "in", ["purchase", "done"]],
          ["date_approve", "!=", false],
        ],
        ["date_approve"],
        { order: "date_approve desc", limit: 1 },
      ).then((rows: { date_approve: string }[]) => ({ pid, date: rows[0]?.date_approve ?? null }))
    ),
  );
  const lastPurchaseDateMap = new Map(lastPurchaseDates.map(({ pid, date }) => [pid, date]));

  // ── 6. Build InventoryArticle per variant ─────────────────────────────────
  const articles: InventoryArticle[] = variants.map((v) => {
    const ptavIds = v.product_template_attribute_value_ids;
    let size: string | null = null;
    for (const ptavId of ptavIds) {
      const ptav = ptavMap.get(ptavId);
      if (!ptav) continue;
      const attrId = Array.isArray(ptav.attribute_id) ? ptav.attribute_id[0] : ptav.attribute_id;
      if (sizeAttrIdSet.has(attrId)) {
        size = ptav.name;
        break;
      }
    }

    // Resolve color from PTAVs
    let color: string | null = null;
    for (const ptavId of ptavIds) {
      const ptav = ptavMap.get(ptavId);
      if (!ptav) continue;
      const attrId = Array.isArray(ptav.attribute_id) ? ptav.attribute_id[0] : ptav.attribute_id;
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
      lastPurchaseDate: lastPurchaseDateMap.get(v.id) ?? null,
      size,
      brand,
      color,
      categoryId: categId ?? 0,
      categoryName,
      categoryParentId,
      categoryParentName,
      qtyOnHand: qtyOnHandMap.get(v.id) ?? 0,
    };
  });

  return NextResponse.json(articles satisfies InventoryArticle[]);
}
