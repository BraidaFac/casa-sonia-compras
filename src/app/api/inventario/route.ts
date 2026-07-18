import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const warehouseId = searchParams.get("warehouse_id");
  const limit = parseInt(searchParams.get("limit") ?? "30");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (warehouseId) where.warehouseId = parseInt(warehouseId);

  const [inventories, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        status: true,
        warehouseId: true,
        warehouseName: true,
        name: true,
        countDate: true,
        accountingDate: true,
        articles: true,
        odooRef: true,
        errorDetail: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.inventory.count({ where }),
  ]);

  const summaries = inventories.map((inv) => {
    const { articles, ...rest } = inv;
    return {
      ...rest,
      articleCount: Array.isArray(articles) ? (articles as unknown[]).length : 0,
      name: inv.name ?? null,
      countDate: inv.countDate ?? null,
      accountingDate: inv.accountingDate ?? null,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    };
  });

  return NextResponse.json({ data: summaries, total, limit, offset });
}

export async function POST(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    warehouseId: number;
    warehouseName: string;
    name?: string | null;
    countDate?: string | null;
    accountingDate?: string | null;
  };

  const { warehouseId, warehouseName, name, countDate, accountingDate } = body;

  if (!warehouseId || !warehouseName) {
    return NextResponse.json(
      { error: "warehouseId, warehouseName son requeridos" },
      { status: 400 },
    );
  }

  const inventory = await prisma.inventory.create({
    data: {
      warehouseId,
      warehouseName,
      name: name ?? null,
      countDate: countDate ?? null,
      accountingDate: accountingDate ?? null,
      articles: [] as unknown as object[],
    },
  });

  return NextResponse.json({ id: inventory.id }, { status: 201 });
}
