import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import type { TokenPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (req: NextRequest, payload: TokenPayload) => {
  const entries = await prisma.searchHistory.findMany({
    where: { employeeId: payload.employeeId },
    orderBy: { searchedAt: "desc" },
    take: 20,
  });

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      productTemplateId: e.productTemplateId,
      productName: e.productName,
      productRef: e.productRef ?? null,
      thumbUrl: e.thumbUrl ?? null,
      searchedAt: e.searchedAt.toISOString(),
    })),
  );
});

export const POST = withAuth(async (req: NextRequest, payload: TokenPayload) => {
  const body = await req.json();
  const { productTemplateId, productName, productRef, thumbUrl } = body;

  if (!productTemplateId || !productName) {
    return NextResponse.json(
      { error: "productTemplateId y productName requeridos" },
      { status: 400 },
    );
  }

  // Upsert: update searchedAt if exists, insert if not
  await prisma.searchHistory.upsert({
    where: {
      employeeId_productTemplateId: {
        employeeId: payload.employeeId,
        productTemplateId,
      },
    },
    update: {
      searchedAt: new Date(),
      productName,
      productRef: productRef ?? null,
      thumbUrl: thumbUrl ?? null,
    },
    create: {
      employeeId: payload.employeeId,
      productTemplateId,
      productName,
      productRef: productRef ?? null,
      thumbUrl: thumbUrl ?? null,
    },
  });

  // Enforce max 20 entries per employee: delete oldest beyond limit
  const count = await prisma.searchHistory.count({
    where: { employeeId: payload.employeeId },
  });
  if (count > 20) {
    const oldest = await prisma.searchHistory.findMany({
      where: { employeeId: payload.employeeId },
      orderBy: { searchedAt: "asc" },
      take: count - 20,
      select: { id: true },
    });
    await prisma.searchHistory.deleteMany({
      where: { id: { in: oldest.map((e) => e.id) } },
    });
  }

  return NextResponse.json({ ok: true });
});
