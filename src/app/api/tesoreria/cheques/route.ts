import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { cartera, chequesPropiosPendientes, chequeTerceroExiste, numeroPropioUsado, proximoNumeroCheque } from "@/lib/odooTesoreria";

// ?vista=cartera&diarioId= | propios&diarioId= | proximo&diarioId= | existe&numero&bancoId&cuit | usado&diarioId&numero
export const GET = withAuth(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const diarioId = Number(sp.get("diarioId"));
  switch (sp.get("vista")) {
    case "cartera":
      return NextResponse.json(await cartera(diarioId));
    case "propios":
      return NextResponse.json(await chequesPropiosPendientes(diarioId));
    case "proximo":
      return NextResponse.json({ numero: await proximoNumeroCheque(diarioId) });
    case "existe":
      return NextResponse.json({ existe: await chequeTerceroExiste(sp.get("numero") ?? "", Number(sp.get("bancoId")), sp.get("cuit") ?? "") });
    case "usado":
      return NextResponse.json({ usado: await numeroPropioUsado(diarioId, sp.get("numero") ?? "") });
    default:
      return NextResponse.json({ error: "Vista inválida" }, { status: 400 });
  }
}, { roles: ROLES_TESORERIA });
