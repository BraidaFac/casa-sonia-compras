import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { getStockByTemplate, getInternalLocations } from "@/lib/odooExistencias";

export const GET = withAuth(async (req: NextRequest) => {
  const templateIdStr = new URL(req.url).searchParams.get("templateId");
  if (!templateIdStr) {
    return NextResponse.json({ error: "templateId requerido" }, { status: 400 });
  }
  const templateId = parseInt(templateIdStr);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: "templateId inválido" }, { status: 400 });
  }

  const [stock, locations] = await Promise.all([
    getStockByTemplate(templateId),
    getInternalLocations(),
  ]);

  return NextResponse.json({ stock, locations });
});
