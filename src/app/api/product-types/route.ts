import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async () => {
  try {
    const attrs = await odoo.fetchAll(
      "product.attribute",
      [["name", "ilike", "Tipo de Producto"]],
      ["id", "name"],
    );
    const typeAttr = attrs.find((a) =>
      a.name.toLowerCase().includes("tipo de producto"),
    );
    if (!typeAttr) return NextResponse.json([]);

    const values = await odoo.fetchAll<{
      id: number;
      name: string;
      x_studio_coeficiente?: number;
    }>(
      "product.attribute.value",
      [["attribute_id", "=", typeAttr.id]],
      ["id", "name", "x_studio_coeficiente"],
    );

    return NextResponse.json(
      values.map((v) => ({
        id: v.id,
        name: v.name,
        coeficiente: v.x_studio_coeficiente || 0,
      })),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching product types" },
      { status: 500 },
    );
  }
});
