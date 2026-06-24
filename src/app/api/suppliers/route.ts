import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET() {
  try {
    const suppliers = await odoo.fetchAll(
      "res.partner",
      [["supplier_rank", ">", 0]],
      ["id", "name"],
    );

    return NextResponse.json(suppliers);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching suppliers" },
      { status: 500 },
    );
  }
}
