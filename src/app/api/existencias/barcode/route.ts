import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { getProductByBarcode } from "@/lib/odooExistencias";

export const GET = withAuth(async (req: NextRequest) => {
  const barcode = new URL(req.url).searchParams.get("barcode")?.trim();
  if (!barcode) {
    return NextResponse.json({ error: "barcode requerido" }, { status: 400 });
  }

  const result = await getProductByBarcode(barcode);
  if (!result) {
    return NextResponse.json({ error: "Código no encontrado" }, { status: 404 });
  }

  return NextResponse.json(result);
});
