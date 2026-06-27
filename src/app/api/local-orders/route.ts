import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripImagesForDB } from "@/lib/localOrders";
import type { Article, PrintColumn, PrintValues } from "@/types";

// GET /api/local-orders?status=DRAFT&supplier_id=1&date_from=2026-01-01&date_to=2026-12-31&limit=30&offset=0
export async function GET(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const supplierId = searchParams.get("supplier_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const limit = parseInt(searchParams.get("limit") ?? "30");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (supplierId) where.supplierId = parseInt(supplierId);
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        status: true,
        odooOrderId: true,
        odooOrderName: true,
        errorDetail: true,
        supplierId: true,
        supplierName: true,
        date: true,
        articles: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.order.count({ where }),
  ]);

  // Compute articleCount from JSON, strip full articles from list response
  const summaries = orders.map((o) => {
    const { articles, ...rest } = o;
    return {
      ...rest,
      articleCount: Array.isArray(articles) ? (articles as unknown[]).length : 0,
      errorDetail: o.status === "ERROR" ? o.errorDetail : null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  });

  const page = Math.floor(offset / limit);
  return NextResponse.json({ data: summaries, total, page, limit });
}

// POST /api/local-orders — create draft
export async function POST(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    supplierId: number;
    supplierName: string;
    date: string;
    articles: Article[];
    warehouseIds: number[];
    printColumns: PrintColumn[];
    printValues: PrintValues;
  };

  const { supplierId, supplierName, date, articles } = body;

  if (!supplierId || !supplierName || !date) {
    return NextResponse.json(
      { error: "supplierId, supplierName, and date are required" },
      { status: 400 },
    );
  }
  if (!Array.isArray(articles)) {
    return NextResponse.json(
      { error: "articles must be an array" },
      { status: 400 },
    );
  }

  const order = await prisma.order.create({
    data: {
      supplierId: body.supplierId,
      supplierName: body.supplierName,
      date: body.date,
      warehouseIds: (body.warehouseIds ?? []) as unknown as object,
      articles: stripImagesForDB(body.articles ?? []) as unknown as object,
      printColumns: (body.printColumns ?? []) as unknown as object,
      printValues: (body.printValues ?? {}) as unknown as object,
    },
  });

  return NextResponse.json({ id: order.id }, { status: 201 });
}
