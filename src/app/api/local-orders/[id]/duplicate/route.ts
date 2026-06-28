import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { batchResolveProductIds } from "@/lib/odooProducts";
import type { LocalArticle } from "@/types";
import { randomUUID } from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const source = await prisma.order.findUnique({ where: { id: orderId } });
  if (!source) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }

  // Reset article IDs and row IDs so duplicate is fully independent
  const sourceArticles = source.articles as unknown as LocalArticle[];

  // For CONFIRMED orders: batch-resolve articles missing existingProductId from Odoo
  // (by name + referencia). Covers orders confirmed before the backfill logic existed.
  let resolvedIdBySourceId = new Map<string, number>();
  if (source.status === "CONFIRMED") {
    const needsLookup = sourceArticles.filter((a) => !a.existingProductId && a.name);
    if (needsLookup.length > 0) {
      resolvedIdBySourceId = await batchResolveProductIds(needsLookup);
    }
  }

  const freshArticles = sourceArticles.map((a) => ({
    ...a,
    id: randomUUID(),
    existingProductId: a.existingProductId ?? resolvedIdBySourceId.get(a.id) ?? null,
    rows: a.rows.map((r) => ({
      ...r,
      id: randomUUID(),
      odooLineIds: undefined,
      // Colors that were isNew in the source are already in Odoo after confirmation.
      // Reset the flag so they're treated as existing on the next confirmation.
      color: r.color ? { ...r.color, isNew: false } : null,
    })),
    deletedOdooImageIds: [],
    clearedPrimaryColorNames: [],
    // Strip tempPath — images need re-upload in new draft
    colorImages: Object.fromEntries(
      Object.entries(a.colorImages).map(([color, imgs]) => [
        color,
        imgs.map((img) => ({ ...img, tempPath: undefined })),
      ]),
    ),
  }));

  const newOrder = await prisma.order.create({
    data: {
      supplierId: source.supplierId,
      supplierName: source.supplierName,
      date: source.date,
      warehouseIds: source.warehouseIds as unknown as object,
      articles: freshArticles as unknown as object,
      printColumns: source.printColumns as unknown as object,
      printValues: source.printValues as unknown as object,
    },
  });

  return NextResponse.json({ id: newOrder.id }, { status: 201 });
}
