import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";

  try {
    const suppliers = await odoo.searchRead(
      "res.partner",
      [
        ["supplier_rank", ">", 0],
        ["name", "ilike", q],
      ],
      ["id", "name"],
      { limit: 20 },
    );

    return NextResponse.json(suppliers);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching suppliers" },
      { status: 500 },
    );
  }
}
