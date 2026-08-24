import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export interface AttributeValue {
  id: number;
  name: string;
}

export interface AttributeByName {
  id: number;
  name: string;
  values: AttributeValue[];
}

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.trim();

  if (!name) {
    return NextResponse.json(
      { error: 'Parámetro "name" requerido' },
      { status: 400 },
    );
  }

  try {
    const attributes = (await odoo.searchRead(
      "product.attribute",
      [["name", "ilike", name]],
      ["id", "name"],
    )) as { id: number; name: string }[];

    if (attributes.length === 0) {
      return NextResponse.json({ id: null, name, values: [] });
    }

    // Prefer exact match; fall back to first result
    const attr =
      attributes.find(
        (a: { name: string }) => a.name.toLowerCase() === name.toLowerCase(),
      ) ?? attributes[0];

    const rawValues = await odoo.fetchAll<{ id: number; name: string }>(
      "product.attribute.value",
      [["attribute_id", "=", attr.id]],
      ["id", "name"],
    );

    const seen = new Set<number>();
    const values: AttributeValue[] = rawValues
      .filter((v) => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      })
      .map((v) => ({ id: v.id, name: v.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    return NextResponse.json({ id: attr.id, name: attr.name, values } satisfies AttributeByName);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error fetching attribute",
      },
      { status: 500 },
    );
  }
});
