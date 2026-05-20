import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET() {
  try {
    const warehouses = await odoo.searchRead(
      "stock.warehouse",
      [],
      ["id", "name", "code"],
    );
    return NextResponse.json(
      warehouses.map((w: { id: number; name: string; code: string }) => ({
        id: w.id,
        name: w.name,
        code: w.code,
      })),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error fetching warehouses",
      },
      { status: 500 },
    );
  }
}
