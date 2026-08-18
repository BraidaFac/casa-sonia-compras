import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async () => {
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
});
