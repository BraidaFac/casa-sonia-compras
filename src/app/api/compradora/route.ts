import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET() {
  try {
    const attrs = await odoo.searchRead(
      "product.attribute",
      [["name", "ilike", "Compradora"]],
      ["id", "name"],
    );
    const compradAttr = attrs.find((a: { id: number; name: string }) =>
      a.name.toLowerCase().includes("compradora"),
    );
    if (!compradAttr) return NextResponse.json({ attributeId: 0, compradoras: [] });

    const values = await odoo.searchRead(
      "product.attribute.value",
      [["attribute_id", "=", compradAttr.id]],
      ["id", "name"],
    );

    return NextResponse.json({ attributeId: compradAttr.id, compradoras: values });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching compradoras" },
      { status: 500 },
    );
  }
}
