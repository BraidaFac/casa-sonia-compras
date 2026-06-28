import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET() {
  try {
    const employees = await odoo.searchRead(
      "hr.employee",
      [["active", "=", true]],
      ["id", "name"],
    );

    return NextResponse.json({ compradoras: employees });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching compradoras" },
      { status: 500 },
    );
  }
}
