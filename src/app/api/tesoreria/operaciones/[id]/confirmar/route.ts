import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { idDe, respuestaMotor, ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { confirmar } from "@/lib/tesoreriaMotor";

// Ejecuta contra Odoo dentro del request; el cliente sigue el progreso con GET /operaciones/[id].
export const maxDuration = 300;

export const POST = withAuth(async (req: NextRequest, payload, ctx) => {
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  return respuestaMotor(await confirmar(id, { id: payload.employeeId, nombre: payload.name }, !!body?.aceptarDuplicado));
}, { roles: ROLES_TESORERIA });
