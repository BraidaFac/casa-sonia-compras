import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { armarVista, type Periodo } from "@/lib/tesoreriaVista";
import { hoyAR } from "@/lib/tesoreria";

export const GET = withAuth(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const periodo = (sp.get("periodo") ?? "dia") as Periodo;
  const fecha = sp.get("fecha") ?? hoyAR();
  if (!["dia", "mes", "anio"].includes(periodo) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  return NextResponse.json(await armarVista(periodo, fecha));
}, { roles: ["ADMIN", "TESORERO"] });
