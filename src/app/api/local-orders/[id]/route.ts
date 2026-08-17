import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { stripImagesForDB, restorePreviewUrls } from "@/lib/localOrders";
import { deleteTempFolder } from "@/lib/imageStorage";
import type { Article, LocalArticle, PrintColumn, PrintValues } from "@/types";

async function getOrder(id: number) {
  return prisma.order.findUnique({ where: { id } });
}

// GET /api/local-orders/[id]
export const GET = withAuth(async (
  _request: NextRequest,
  _payload,
  ctx,
) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const order = await getOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }

  const articles = restorePreviewUrls(order.articles as unknown as LocalArticle[]);

  return NextResponse.json({
    ...order,
    articles,
    compradoraIds: order.compradoraIds as unknown as number[],
    warehouseIds: order.warehouseIds as unknown as number[],
    printColumns: order.printColumns as unknown as PrintColumn[],
    printValues: order.printValues as unknown as PrintValues,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  });
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });

// PUT /api/local-orders/[id] — update draft (or reset ERROR → DRAFT)
export const PUT = withAuth(async (
  request: NextRequest,
  _payload,
  ctx,
) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const order = await getOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }
  if (order.status === "CONFIRMED") {
    return NextResponse.json(
      { error: "No se puede editar una orden confirmada" },
      { status: 409 },
    );
  }

  const body = (await request.json()) as {
    supplierId?: number;
    supplierName?: string;
    brandId?: number | null;
    brandName?: string | null;
    compradoraIds?: number[];
    date?: string;
    articles?: Article[];
    warehouseIds?: number[];
    printColumns?: PrintColumn[];
    printValues?: PrintValues;
  };

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      // Reset ERROR → DRAFT on any edit, keep DRAFT as DRAFT
      status: order.status === "ERROR" ? "DRAFT" : order.status,
      errorDetail: order.status === "ERROR" ? null : order.errorDetail,
      ...(body.supplierId !== undefined ? { supplierId: body.supplierId } : {}),
      ...(body.supplierName !== undefined ? { supplierName: body.supplierName } : {}),
      ...("brandId" in body ? { brandId: body.brandId ?? null } : {}),
      ...("brandName" in body ? { brandName: body.brandName ?? null } : {}),
      ...("compradoraIds" in body ? { compradoraIds: (body.compradoraIds ?? []) as unknown as object } : {}),
      ...(body.date !== undefined ? { date: body.date } : {}),
      ...(body.articles !== undefined
        ? { articles: stripImagesForDB(body.articles) as unknown as object }
        : {}),
      ...(body.warehouseIds !== undefined
        ? { warehouseIds: body.warehouseIds as unknown as object }
        : {}),
      ...(body.printColumns !== undefined
        ? { printColumns: body.printColumns as unknown as object }
        : {}),
      ...(body.printValues !== undefined
        ? { printValues: body.printValues as unknown as object }
        : {}),
    },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });

// DELETE /api/local-orders/[id]
export const DELETE = withAuth(async (
  _request: NextRequest,
  _payload,
  ctx,
) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const order = await getOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }
  if (order.status === "CONFIRMED") {
    return NextResponse.json(
      { error: "No se puede eliminar una orden confirmada" },
      { status: 409 },
    );
  }

  await deleteTempFolder(orderId).catch(() => {}); // best-effort
  await prisma.order.delete({ where: { id: orderId } });
  return new NextResponse(null, { status: 204 });
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
