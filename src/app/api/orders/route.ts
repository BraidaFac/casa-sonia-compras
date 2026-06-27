import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";
import type {
  Article,
  PrintColumn,
  PrintValues,
  Warehouse,
} from "@/types";
import {
  createOrderInOdoo,
  OdooValidationError,
} from "@/lib/odooOrderCreation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const supplierId = searchParams.get("supplier_id");
  const state = searchParams.get("state");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const limit = parseInt(searchParams.get("limit") || "30");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const domain: unknown[] = [
      ["state", "not in", ["cancel", "done"]],
    ];

    if (q) domain.push(["name", "ilike", q]);
    if (supplierId) domain.push(["partner_id", "=", parseInt(supplierId)]);
    if (state) domain.push(["state", "=", state]);
    if (dateFrom) domain.push(["date_order", ">=", dateFrom]);
    if (dateTo) domain.push(["date_order", "<=", dateTo + " 23:59:59"]);

    const [orders, total] = await Promise.all([
      odoo.searchRead(
        "purchase.order",
        domain,
        ["id", "name", "partner_id", "state", "date_order", "amount_total"],
        { limit, offset, order: "date_order desc" },
      ),
      odoo.call("purchase.order", "search_count", { domain }),
    ]);

    return NextResponse.json({ orders, total });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching orders" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    supplierId,
    date,
    articles,
    warehouseIds = [],
    printColumns = [],
    printValues = {},
    selectedWarehouses = [],
  } = body as {
    supplierId: number;
    date: string;
    articles: Article[];
    warehouseIds: number[];
    printColumns: PrintColumn[];
    printValues: PrintValues;
    selectedWarehouses: Warehouse[];
  };

  try {
    const result = await createOrderInOdoo({
      supplierId,
      date,
      articles,
      warehouseIds,
      printColumns,
      printValues,
      selectedWarehouses,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OdooValidationError) {
      return NextResponse.json(
        { error: error.message, validationErrors: error.validationErrors },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error creating order",
      },
      { status: 500 },
    );
  }
}
