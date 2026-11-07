import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { idDe, ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { sr } from "@/lib/odooTesoreria";

// Una operación confirmada cuyos registros se borraron/cancelaron directamente en Odoo pasa a Anulada,
// solo si de verdad no queda ninguno vivo (si queda, se anula por el camino normal).
export const POST = withAuth(async (_req: NextRequest, payload, ctx) => {
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const op = await prisma.tesoreriaOperacion.findUnique({ where: { id }, include: { pasos: { where: { fase: "EJECUCION", estado: "OK", odooId: { not: null } } } } });
  if (!op) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (op.estado !== "COMPLETADA" && op.estado !== "PENDIENTE_DEBITO") return NextResponse.json({ error: "Solo operaciones confirmadas" }, { status: 409 });

  const ids = (m: string) => op.pasos.filter((p) => p.odooModelo === m).map((p) => p.odooId!);
  try {
    const [lineas, pagos, asientos] = await Promise.all([
      sr<{ id: number }>("account.bank.statement.line", [["id", "in", ids("account.bank.statement.line")]], ["id"]),
      sr<{ id: number }>("account.payment", [["id", "in", ids("account.payment")], ["state", "!=", "canceled"]], ["id"]),
      sr<{ id: number }>("account.move", [["id", "in", ids("account.move")], ["state", "!=", "cancel"]], ["id"]),
    ]);
    if (lineas.length || pagos.length || asientos.length) return NextResponse.json({ error: "Todavía hay registros de esta operación en Odoo: anulala con Anular." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Odoo no está disponible." }, { status: 503 });
  }

  const r = await prisma.tesoreriaOperacion.updateMany({ where: { id, estado: op.estado }, data: { estado: "ANULADA", anuladoPorId: payload.employeeId, anuladoEn: new Date() } });
  if (!r.count) return NextResponse.json({ error: "La operación cambió mientras tanto." }, { status: 409 });
  await prisma.tesoreriaEvento.create({ data: { operacionId: id, empleadoId: payload.employeeId, tipo: "anulada_en_odoo" } });
  return NextResponse.json({ ok: true });
}, { roles: ROLES_TESORERIA });
