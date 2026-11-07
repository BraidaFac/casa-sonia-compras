import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { idDe, respuestaMotor, ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { anular } from "@/lib/tesoreriaMotor";

export const maxDuration = 300;

export const POST = withAuth(async (_req: NextRequest, payload, ctx) => {
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  return respuestaMotor(await anular(id, { id: payload.employeeId, nombre: payload.name }));
}, { roles: ROLES_TESORERIA });
