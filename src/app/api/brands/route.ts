import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async (_req: NextRequest) => {
  try {
    const attrs = await odoo.fetchAll(
      "product.attribute",
      [["name", "ilike", "Marca"]],
      ["id", "name"],
    );
    const brandAttr = attrs.find((a) => a.name.toLowerCase().includes("marca"));
    if (!brandAttr) return NextResponse.json({ attributeId: 0, brands: [] });

    const brands = await odoo.fetchAll(
      "product.attribute.value",
      [["attribute_id", "=", brandAttr.id]],
      ["id", "name"],
    );

    return NextResponse.json({ attributeId: brandAttr.id, brands });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching brands" },
      { status: 500 },
    );
  }
});
