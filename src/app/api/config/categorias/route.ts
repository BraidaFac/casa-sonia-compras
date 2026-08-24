import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

// Todas las categorías de Odoo (no solo hojas), con su parentId.
// Usado por el cliente para resolver la cadena de ancestros al calcular descuentos.
export interface CategoriaFlat {
  id: number;
  nombre: string;
  parentId: number | null;
}

export const GET = withAuth(async () => {
  try {
    const all = await odoo.fetchAll<{
      id: number;
      name: string;
      parent_id: [number, string] | false;
    }>("product.category", [], ["id", "name", "parent_id"], "id asc");

    const result: CategoriaFlat[] = all.map((cat) => ({
      id: cat.id,
      nombre: cat.name,
      parentId: cat.parent_id ? cat.parent_id[0] : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al obtener categorías" },
      { status: 500 },
    );
  }
});
