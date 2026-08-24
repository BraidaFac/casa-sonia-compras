import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export interface ProductCategory {
  id: number;
  name: string;
  completeName: string; // "Abuelo / Padre / Hijo"
}

export const GET = withAuth(async () => {
  try {
    const allCategories = await odoo.fetchAll<{
      id: number;
      name: string;
      parent_id: [number, string] | false;
      complete_name?: string;
    }>("product.category", [], ["id", "name", "parent_id", "complete_name"], "complete_name asc");

    const categories = allCategories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      completeName: cat.complete_name || cat.name,
    }));

    return NextResponse.json(categories);
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
});
