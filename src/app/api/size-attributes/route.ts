import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
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

export const GET = withAuth(async (_req: NextRequest) => {
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

    const rawValues = await odoo.fetchAll(
      "product.attribute.value",
      [["attribute_id", "in", attrIds]],
      ["id", "name", "attribute_id", "x_studio_equivalencias"],
    );

    // Deduplicate by ID (fetchAll pagination with unstable sort can return duplicates)
    type RawValue = { id: number; name: string; attribute_id: [number, string] | number; x_studio_equivalencias: string };
    const seen = new Set<number>();
    const values = (rawValues as RawValue[]).filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    });

    const result: SizeAttribute[] = sizeAttrs.map(
      (attr: { id: number; name: string }) => ({
        id: attr.id,
        name: attr.name,
        values: values
          .filter((v) => {
            const attrId = Array.isArray(v.attribute_id)
              ? v.attribute_id[0]
              : v.attribute_id;
            return attrId === attr.id;
          })
          .map((v) => ({
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
});
