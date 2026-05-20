import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export interface ProductCategory {
  id: number;
  name: string;
  completeName: string; // "Abuelo / Padre / Hijo"
}

export async function GET() {
  try {
    const allCategories = await odoo.searchRead(
      "product.category",
      [],
      ["id", "name", "parent_id", "complete_name"],
    );

    const parentIds = new Set<number>();
    for (const cat of allCategories) {
      if (cat.parent_id) {
        const parentId = Array.isArray(cat.parent_id)
          ? cat.parent_id[0]
          : cat.parent_id;
        parentIds.add(parentId);
      }
    }

    const leafCategories = allCategories
      .filter((cat: { id: number }) => !parentIds.has(cat.id))
      .map((cat: { id: number; name: string; complete_name?: string }) => ({
        id: cat.id,
        name: cat.name,
        completeName: cat.complete_name || cat.name,
      }));

    return NextResponse.json(leafCategories);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error fetching categories",
      },
      { status: 500 },
    );
  }
}
