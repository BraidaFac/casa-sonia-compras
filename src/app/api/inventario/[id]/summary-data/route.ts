import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { buildConfirmationSummary } from "@/lib/inventoryConfirmationSummary";
import type { InventoryArticle } from "@/types";

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
export const GET = withAuth(async (req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const inv = await prisma.inventory.findUnique({ where: { id: parseInt(id) } });

  if (!inv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // Confirmed inventories: return the stored snapshot taken at confirmation time
  if (inv.status === "CONFIRMADO" && inv.confirmationSummary) {
    return NextResponse.json(inv.confirmationSummary as unknown as SummaryDataResponse);
  }

  const articles = (inv.articles as unknown as InventoryArticle[]) ?? [];

  const result = await buildConfirmationSummary(articles, inv.warehouseId);
  return NextResponse.json(result satisfies SummaryDataResponse);
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
