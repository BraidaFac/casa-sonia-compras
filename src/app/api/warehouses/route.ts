import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async (_req: NextRequest) => {
  try {
    const warehouses = await odoo.fetchAll<{
      id: number;
      name: string;
      code: string;
    }>("stock.warehouse", [], ["id", "name", "code"]);

    return NextResponse.json(
      warehouses.map((w) => ({ id: w.id, name: w.name, code: w.code })),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching warehouses" },
      { status: 500 },
    );
  }
});
