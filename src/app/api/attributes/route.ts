import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET() {
  try {
    const attributes = await odoo.searchRead(
      "product.attribute",
      ["|", ["name", "ilike", "Color"], ["name", "ilike", "Talle"]],
      ["id", "name"],
    );
    const colorAttr = attributes.find((a: { id: number; name: string }) =>
      a.name.toLowerCase().includes("color"),
    );
    const sizeAttr = attributes.find((a: { id: number; name: string }) =>
      a.name.toLowerCase().includes("talle"),
    );
    if (!colorAttr || !sizeAttr) {
      return NextResponse.json(
        { error: 'No se encontraron los atributos "Color" o "Talle" en Odoo' },
        { status: 404 },
      );
    }

    const values = await odoo.searchRead(
      "product.attribute.value",
      [["attribute_id", "in", [colorAttr.id, sizeAttr.id]]],
      ["id", "name", "attribute_id", "html_color", "x_studio_color_base"],
    );

    const colors = values
      .filter(
        (v: { attribute_id: [number, string] | number }) =>
          (Array.isArray(v.attribute_id)
            ? v.attribute_id[0]
            : v.attribute_id) === colorAttr.id,
      )
      .map((v: { id: number; name: string; html_color?: string; x_studio_color_base?: string }) => ({
        id: v.id,
        name: v.name,
        colorBase: v.x_studio_color_base || "",
        hexColor: v.html_color || "",
        isNew: false,
      }));

    const sizes = values
      .filter(
        (v: { attribute_id: [number, string] | number }) =>
          (Array.isArray(v.attribute_id)
            ? v.attribute_id[0]
            : v.attribute_id) === sizeAttr.id,
      )
      .map((v: { id: number; name: string }) => ({ id: v.id, name: v.name }));

    return NextResponse.json({
      colors,
      sizes,
      colorAttributeId: colorAttr.id,
      sizeAttributeId: sizeAttr.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error fetching attributes",
      },
      { status: 500 },
    );
  }
}
