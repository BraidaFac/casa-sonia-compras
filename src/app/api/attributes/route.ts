import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async () => {
  try {
    const attributes = await odoo.fetchAll(
      "product.attribute",
      ["|", ["name", "ilike", "Color"], ["name", "ilike", "Talle"]],
      ["id", "name"],
    );
    const colorAttr = attributes.find((a) =>
      a.name.toLowerCase().includes("color"),
    );
    const sizeAttr = attributes.find((a) =>
      a.name.toLowerCase().includes("talle"),
    );
    if (!colorAttr || !sizeAttr) {
      return NextResponse.json(
        { error: 'No se encontraron los atributos "Color" o "Talle" en Odoo' },
        { status: 404 },
      );
    }

    const values = await odoo.fetchAll<{
      id: number;
      name: string;
      attribute_id: [number, string] | number;
      html_color?: string;
      x_studio_color_base?: string;
    }>(
      "product.attribute.value",
      [["attribute_id", "=", colorAttr.id]],
      ["id", "name", "attribute_id", "html_color", "x_studio_color_base"],
    );

    const colors = values.map((v) => ({
        id: v.id,
        name: v.name,
        colorBase: v.x_studio_color_base || "",
        hexColor: v.html_color || "",
        isNew: false,
      }));

    return NextResponse.json({
      colors,
      colorAttributeId: colorAttr.id,
      sizeAttributeId: sizeAttr.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching attributes" },
      { status: 500 },
    );
  }
});
