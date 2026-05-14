import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET() {
  try {
    const attrs = await odoo.searchRead(
      "product.attribute",
      [["name", "ilike", "Marca"]],
      ["id", "name"],
    );
    const brandAttr = attrs.find((a: { id: number; name: string }) =>
      a.name.toLowerCase().includes("marca"),
    );
    if (!brandAttr) return NextResponse.json({ attributeId: 0, brands: [] });

    const values = await odoo.searchRead(
      "product.attribute.value",
      [["attribute_id", "=", brandAttr.id]],
      ["id", "name"],
    );

    return NextResponse.json({ attributeId: brandAttr.id, brands: values });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching brands" },
      { status: 500 },
    );
  }
}
