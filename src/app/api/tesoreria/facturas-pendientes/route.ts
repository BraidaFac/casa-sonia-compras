import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { facturasPendientes } from "@/lib/odooTesoreria";

// ?contactoId=&tipo=PAGO|COBRO — facturas con saldo del contacto a imputar
export const GET = withAuth(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const contactoId = Number(sp.get("contactoId"));
  const tipo = sp.get("tipo");
  if (!contactoId) return NextResponse.json({ error: "Falta el contacto" }, { status: 400 });
  if (tipo !== "PAGO" && tipo !== "COBRO") return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  return NextResponse.json(await facturasPendientes(contactoId, tipo));
}, { roles: ROLES_TESORERIA });
