import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { odoo } from "@/lib/odoo";
import type { InventoryArticle } from "@/types";

type Params = { params: Promise<{ id: string }> };

export interface SummaryProduct {
  varianteId: number;
  productoId: number;
  barcode: string;
  name: string;
  cost: number;
  qtyOnHand: number;
}

export interface SummaryCategory {
  categoryId: number;
  categoryName: string;
  categoryParentId: number | null;
  categoryParentName: string | null;
  products: SummaryProduct[];
}

export interface SummaryDataResponse {
  categories: SummaryCategory[];
}

// GET /api/inventario/[id]/summary-data
// Returns all Odoo products for each category touched by this inventory,
// with their current qty_available. Used to compute diffs and surface uncounted articles.
export async function GET(request: NextRequest, { params }: Params) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const inv = await prisma.inventory.findUnique({ where: { id: parseInt(id) } });

  if (!inv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const articles = (inv.articles as unknown as InventoryArticle[]) ?? [];

  function extractLocalName(completeName: string): string {
    const parts = completeName.split(" / ");
    return parts[parts.length - 1] ?? completeName;
  }

  // Collect unique categories touched by this inventory
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
    return NextResponse.json({ categories: [] } satisfies SummaryDataResponse);
  }

  // Fetch all active products with barcode for each affected category
  const categoryIds = Array.from(categoryMap.keys());

  const allProducts = await odoo.fetchAll<{
    id: number;
    display_name: string;
    barcode: string | false;
    standard_price: number;
    qty_available: number;
    categ_id: [number, string] | false;
    product_tmpl_id: [number, string] | false;
  }>(
    "product.product",
    [
      ["categ_id", "in", categoryIds],
      ["active", "=", true],
      ["barcode", "!=", false],
    ],
    ["id", "display_name", "barcode", "standard_price", "qty_available", "categ_id", "product_tmpl_id"],
    "id asc",
  );

  // Group products by category
  const productsByCategory = new Map<number, SummaryProduct[]>();
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
      qtyOnHand: p.qty_available ?? 0,
    });
  }

  const categories: SummaryCategory[] = [];
  for (const [categoryId, meta] of categoryMap.entries()) {
    categories.push({
      ...meta,
      products: productsByCategory.get(categoryId) ?? [],
    });
  }

  return NextResponse.json({ categories } satisfies SummaryDataResponse);
}
