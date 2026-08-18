import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async () => {
  try {
    // Try fields_get first to get selection options dynamically
    let options: string[] = [];

    try {
      const fieldsData = await odoo.call(
        "product.attribute.value",
        "fields_get",
        {
          allfields: ["x_studio_color_base"],
          attributes: ["string", "type", "selection"],
        },
      );

      const colorBaseField = fieldsData?.x_studio_color_base;

      if (colorBaseField && colorBaseField.type === "selection" && Array.isArray(colorBaseField.selection)) {
        options = colorBaseField.selection.map(
          ([, label]: [string, string]) => label,
        );
      }
    } catch {
      // Fallback: query ir.model.fields directly
      const fields = await odoo.searchRead(
        "ir.model.fields",
        [
          ["model", "=", "product.attribute.value"],
          ["name", "=", "x_studio_color_base"],
        ],
        ["name", "ttype", "selection_ids"],
      );

      if (fields.length > 0 && Array.isArray(fields[0].selection_ids) && fields[0].selection_ids.length > 0) {
        const selectionRecords = await odoo.read(
          "ir.model.fields.selection",
          fields[0].selection_ids,
          ["value", "name"],
        );
        options = selectionRecords.map((r: { name: string }) => r.name);
      }
    }

    if (options.length === 0) {
      return NextResponse.json(
        { error: "Campo x_studio_color_base no encontrado o sin opciones" },
        { status: 404 },
      );
    }

    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error fetching color base options",
      },
      { status: 500 },
    );
  }
});
