import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async () => {
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
});
