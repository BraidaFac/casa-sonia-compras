import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async (_req: NextRequest) => {
  try {
    const attributes = await odoo.searchRead(
      "product.attribute",
      [],
      ["id", "name"],
    );
    return NextResponse.json(attributes);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching attributes" },
      { status: 500 },
    );
  }
});
