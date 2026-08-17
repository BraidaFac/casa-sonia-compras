import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { getProductTemplate } from "@/lib/odooExistencias";

export const GET = withAuth(async (req: NextRequest) => {
  const templateIdStr = new URL(req.url).searchParams.get("templateId");
  if (!templateIdStr) {
    return NextResponse.json({ error: "templateId requerido" }, { status: 400 });
  }
  const templateId = parseInt(templateIdStr);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: "templateId inválido" }, { status: 400 });
  }

  const product = await getProductTemplate(templateId);
  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  return NextResponse.json(product);
});
