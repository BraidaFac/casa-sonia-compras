import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { idDe, ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { OdooTesoreriaError } from "@/lib/odooTesoreria";
import { adjuntosOdoo, esencia, MAX_ADJUNTO, mimeValido, registrosOperacion, subirAdjunto } from "@/lib/tesoreriaAdjuntos";

export const maxDuration = 60;

// Lista: los de Odoo (fuente de verdad) + los del borrador que todavía no se subieron
export const GET = withAuth(async (_req: NextRequest, _p, ctx) => {
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const locales = await prisma.tesoreriaAdjunto.findMany({ where: { operacionId: id }, select: { id: true, diarioId: true, nombre: true, mimetype: true }, orderBy: { id: "asc" } });
  let odoo: Awaited<ReturnType<typeof adjuntosOdoo>> = [];
  let odooError: string | null = null;
  try {
    odoo = await adjuntosOdoo(await registrosOperacion(id));
  } catch {
    odooError = "No se pudieron leer los adjuntos de Odoo.";
  }
  return NextResponse.json({
    adjuntos: [...odoo.map((a) => ({ ...a, origen: "odoo" as const })), ...locales.map((a) => ({ ...a, tamano: null, origen: "app" as const }))],
    odooError,
  });
}, { roles: ROLES_TESORERIA });

// Alta: en borrador se guarda en la app; en una operación completada se sube directo a Odoo
export const POST = withAuth(async (req: NextRequest, payload, ctx) => {
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const diarioRaw = form?.get("diarioId");
  const diarioId = diarioRaw ? Number(diarioRaw) : null;
  if (!(archivo instanceof File) || Number.isNaN(diarioId)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  if (!mimeValido(archivo.type)) return NextResponse.json({ error: "Solo se adjuntan PDF o imágenes" }, { status: 400 });
  if (archivo.size > MAX_ADJUNTO) return NextResponse.json({ error: "El archivo supera los 10 MB" }, { status: 400 });

  const op = await prisma.tesoreriaOperacion.findUnique({ where: { id }, select: { estado: true } });
  if (!op) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const contenido = new Uint8Array(await archivo.arrayBuffer());

  if (op.estado === "BORRADOR") {
    const a = await prisma.tesoreriaAdjunto.create({ data: { operacionId: id, diarioId, nombre: archivo.name, mimetype: esencia(archivo.type), contenido, creadoPorId: payload.employeeId } });
    return NextResponse.json({ id: a.id }, { status: 201 });
  }
  if (op.estado !== "COMPLETADA" && op.estado !== "PENDIENTE_DEBITO") return NextResponse.json({ error: "Solo se adjunta en borradores u operaciones completadas" }, { status: 409 });

  try {
    const regs = (await registrosOperacion(id)).filter((r) => r.diarioId === diarioId);
    if (!regs.length) return NextResponse.json({ error: "No hay un registro en Odoo para ese medio" }, { status: 409 });
    const desc = `TES-${id}-ADJ-${Date.now()}`;
    for (const [i, r] of regs.entries()) await subirAdjunto(r, { nombre: archivo.name, mimetype: esencia(archivo.type), contenido }, `${desc}-${i}`);
  } catch (e) {
    const msg = e instanceof OdooTesoreriaError && !e.ambiguo ? `Odoo rechazó el adjunto: ${e.message}` : "Odoo no respondió. Probá de nuevo.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}, { roles: ROLES_TESORERIA });
