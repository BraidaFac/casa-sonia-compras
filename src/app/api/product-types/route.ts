import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET() {
  try {
    const attrs = await odoo.searchRead(
      "product.attribute",
      [["name", "ilike", "Tipo de Producto"]],
      ["id", "name"],
    );
    const typeAttr = attrs.find((a: { id: number; name: string }) =>
      a.name.toLowerCase().includes("tipo de producto"),
    );
    if (!typeAttr) return NextResponse.json([]);

    const values = await odoo.searchRead(
      "product.attribute.value",
      [["attribute_id", "=", typeAttr.id]],
      ["id", "name", "x_studio_coeficiente"],
    );

    return NextResponse.json(
      values.map((v: { id: number; name: string; x_studio_coeficiente?: number }) => ({
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
}
