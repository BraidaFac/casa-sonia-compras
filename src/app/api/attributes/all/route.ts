import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET() {
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
}
