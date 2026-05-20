import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export interface SizeValue {
  id: number;
  name: string;
  equivalencia: string; // x_studio_equivalencias
}

export interface SizeAttribute {
  id: number;
  name: string;
  values: SizeValue[];
}

export async function GET() {
  try {
    const attributes = await odoo.searchRead(
      "product.attribute",
      [
        "|",
        ["name", "ilike", "Talle"],
        ["name", "ilike", "Tamaño"],
      ],
      ["id", "name", "create_variant"],
    );

    const sizeAttrs = attributes.filter(
      (a: { create_variant: string }) => a.create_variant === "always",
    );

    if (sizeAttrs.length === 0) return NextResponse.json([]);

    const attrIds = sizeAttrs.map((a: { id: number }) => a.id);

    const values = await odoo.searchRead(
      "product.attribute.value",
      [["attribute_id", "in", attrIds]],
      ["id", "name", "attribute_id", "x_studio_equivalencias"],
    );

    const result: SizeAttribute[] = sizeAttrs.map(
      (attr: { id: number; name: string }) => ({
        id: attr.id,
        name: attr.name,
        values: values
          .filter((v: { attribute_id: [number, string] | number }) => {
            const attrId = Array.isArray(v.attribute_id)
              ? v.attribute_id[0]
              : v.attribute_id;
            return attrId === attr.id;
          })
          .map((v: { id: number; name: string; x_studio_equivalencias: string }) => ({
            id: v.id,
            name: v.name,
            equivalencia: v.x_studio_equivalencias || "",
          })),
      }),
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error fetching size attributes",
      },
      { status: 500 },
    );
  }
}
