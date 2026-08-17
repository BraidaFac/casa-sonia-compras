import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import type { InventoryArticle, InventoryStatus } from "@/types";

export const GET = withAuth(async (req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const inv = await prisma.inventory.findUnique({ where: { id: parseInt(id) } });

  if (!inv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // Backward-compat: articles saved before the productId→varianteId rename
  const rawArticles = (inv.articles as unknown as (InventoryArticle & { productId?: number })[]) ?? [];
  const articles: InventoryArticle[] = rawArticles.map((a) => ({
    ...a,
    varianteId: a.varianteId ?? a.productId ?? 0,
    productoId: a.productoId ?? 0,
  }));

  return NextResponse.json({
    id: inv.id,
    status: inv.status as InventoryStatus,
    warehouseId: inv.warehouseId,
    warehouseName: inv.warehouseName,
    name: inv.name ?? null,
    countDate: inv.countDate ?? null,
    accountingDate: inv.accountingDate ?? null,
    articles,
    odooRef: inv.odooRef,
    errorDetail: inv.errorDetail,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  });
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });

export const PATCH = withAuth(async (req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const body = (await req.json()) as {
    status?: InventoryStatus;
    articles?: InventoryArticle[];
    name?: string | null;
    countDate?: string | null;
    accountingDate?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.articles !== undefined) {
    data.articles = body.articles as unknown as object[];
    data.articleCount = body.articles.length;
  }
  if (body.name !== undefined) data.name = body.name;
  if (body.countDate !== undefined) data.countDate = body.countDate;
  if (body.accountingDate !== undefined) data.accountingDate = body.accountingDate;

  const inv = await prisma.inventory.update({
    where: { id: parseInt(id) },
    data,
  });

  return NextResponse.json({
    id: inv.id,
    status: inv.status,
    updatedAt: inv.updatedAt.toISOString(),
  });
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });

export const DELETE = withAuth(async (req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  await prisma.inventory.delete({ where: { id: parseInt(id) } });

  return NextResponse.json({ ok: true });
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
