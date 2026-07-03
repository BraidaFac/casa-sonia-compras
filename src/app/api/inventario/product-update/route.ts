import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { odoo } from "@/lib/odoo";

// PATCH /api/inventario/product-update
// Actualiza campos editables de un producto en Odoo
export async function PATCH(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    varianteId: number;
    salePrice?: number;
    cost?: number;
    lastPurchaseDate?: string | null;
  };

  const { varianteId, salePrice, cost, lastPurchaseDate } = body;

  if (!varianteId) {
    return NextResponse.json({ error: "varianteId es requerido" }, { status: 400 });
  }

  const values: Record<string, unknown> = {};
  if (salePrice !== undefined) values.list_price = salePrice;
  if (cost !== undefined) values.standard_price = cost;
  if (lastPurchaseDate !== undefined) values.last_purchase_date = lastPurchaseDate ?? false;

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  await odoo.write("product.product", [varianteId], values);

  return NextResponse.json({ ok: true });
}
