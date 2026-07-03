import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { odoo } from "@/lib/odoo";

export interface CategoryProduct {
  varianteId: number;
  barcode: string;
  name: string;
  salePrice: number;
  cost: number;
}

// GET /api/inventario/category-products?category_id=X
// Pre-carga todos los productos activos con barcode de una categoría
export async function GET(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category_id");

  if (!categoryId) {
    return NextResponse.json({ error: "category_id es requerido" }, { status: 400 });
  }

  const products = await odoo.fetchAll<{
    id: number;
    name: string;
    barcode: string | false;
    list_price: number;
    standard_price: number;
  }>(
    "product.product",
    [
      ["categ_id", "=", parseInt(categoryId)],
      ["active", "=", true],
      ["barcode", "!=", false],
    ],
    ["id", "name", "barcode", "list_price", "standard_price"],
    "name asc",
  );

  const result: CategoryProduct[] = products.map((p) => ({
    varianteId: p.id,
    barcode: p.barcode as string,
    name: p.name,
    salePrice: p.list_price ?? 0,
    cost: p.standard_price ?? 0,
  }));

  return NextResponse.json(result);
}
