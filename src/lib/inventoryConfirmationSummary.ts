import { odoo } from "@/lib/odoo";
import type { InventoryArticle } from "@/types";
import type { SummaryCategory, SummaryDataResponse } from "@/app/api/inventario/[id]/summary-data/route";

function extractLocalName(completeName: string): string {
  const parts = completeName.split(" / ");
  return parts[parts.length - 1] ?? completeName;
}

/**
 * Builds a SummaryDataResponse from current Odoo state for the given inventory.
 * Should be called BEFORE applying any stock adjustments to Odoo so that
 * qtyOnHand reflects the stock levels prior to the inventory confirmation.
 */
export async function buildConfirmationSummary(
  articles: InventoryArticle[],
  warehouseId: number,
): Promise<SummaryDataResponse> {
  // Collect unique categories from articles
  const categoryMap = new Map<number, {
    categoryId: number;
    categoryName: string;
    categoryParentId: number | null;
    categoryParentName: string | null;
  }>();

  for (const a of articles) {
    if (!categoryMap.has(a.categoryId)) {
      categoryMap.set(a.categoryId, {
        categoryId: a.categoryId,
        categoryName: extractLocalName(a.categoryName),
        categoryParentId: a.categoryParentId,
        categoryParentName: a.categoryParentName ? extractLocalName(a.categoryParentName) : null,
      });
    }
  }

  if (categoryMap.size === 0) {
    return { categories: [] };
  }

  const categoryIds = Array.from(categoryMap.keys());

  const allProducts = await odoo.fetchAll<{
    id: number;
    display_name: string;
    barcode: string | false;
    standard_price: number;
    categ_id: [number, string] | false;
    product_tmpl_id: [number, string] | false;
  }>(
    "product.product",
    [
      ["categ_id", "in", categoryIds],
      ["active", "=", true],
      ["barcode", "!=", false],
    ],
    ["id", "display_name", "barcode", "standard_price", "categ_id", "product_tmpl_id"],
    "id asc",
  );

  const locations = await odoo.searchRead(
    "stock.location",
    [
      ["warehouse_id", "=", warehouseId],
      ["usage", "=", "internal"],
      ["active", "=", true],
    ],
    ["id"],
  ) as { id: number }[];

  const locationIds = locations.map((l) => l.id);
  const productIds = allProducts.map((p) => p.id);

  const qtyOnHandMap = new Map<number, number>();
  if (locationIds.length > 0 && productIds.length > 0) {
    const quants = await odoo.fetchAll<{
      product_id: [number, string];
      quantity: number;
    }>(
      "stock.quant",
      [
        ["product_id", "in", productIds],
        ["location_id", "in", locationIds],
      ],
      ["product_id", "quantity"],
      "id asc",
    );

    for (const q of quants) {
      const pid = Array.isArray(q.product_id) ? q.product_id[0] : null;
      if (!pid) continue;
      qtyOnHandMap.set(pid, (qtyOnHandMap.get(pid) ?? 0) + (q.quantity ?? 0));
    }
  }

  const productsByCategory = new Map<number, SummaryCategory["products"]>();
  for (const p of allProducts) {
    const categId = Array.isArray(p.categ_id) ? p.categ_id[0] : null;
    if (!categId) continue;
    if (!productsByCategory.has(categId)) productsByCategory.set(categId, []);
    productsByCategory.get(categId)!.push({
      varianteId: p.id,
      productoId: Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : 0,
      barcode: p.barcode as string,
      name: p.display_name,
      cost: p.standard_price ?? 0,
      qtyOnHand: qtyOnHandMap.get(p.id) ?? 0,
    });
  }

  const categories: SummaryCategory[] = [];
  for (const [categoryId, meta] of categoryMap.entries()) {
    categories.push({
      ...meta,
      products: productsByCategory.get(categoryId) ?? [],
    });
  }

  return { categories };
}
