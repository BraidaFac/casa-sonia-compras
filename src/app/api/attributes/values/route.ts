import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET(request: NextRequest) {
  const attributeId = parseInt(
    request.nextUrl.searchParams.get("attributeId") || "0",
  );
  if (!attributeId) return NextResponse.json([]);

  try {
    const values = await odoo.searchRead(
      "product.attribute.value",
      [["attribute_id", "=", attributeId]],
      ["id", "name"],
    );
    return NextResponse.json(values);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching attribute values" },
      { status: 500 },
    );
  }
}
