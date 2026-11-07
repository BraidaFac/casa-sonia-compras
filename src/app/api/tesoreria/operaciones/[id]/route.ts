import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "../../../../../../prisma/generated/client";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { idDe, leerBorrador, ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { rescatarHuerfana } from "@/lib/tesoreriaMotor";
import { PASO_LABEL, type PasoDef } from "@/lib/tesoreriaPasos";
import { totalOperacion } from "@/lib/tesoreria";

const nombre = { select: { name: true } } as const;

export const GET = withAuth(async (_req: NextRequest, _p, ctx) => {
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  await rescatarHuerfana(id);
  const op = await prisma.tesoreriaOperacion.findUnique({
    where: { id },
    include: {
      creadoPor: nombre,
      confirmadoPor: nombre,
      anuladoPor: nombre,
      pasos: { orderBy: [{ fase: "asc" }, { orden: "asc" }] },
      eventos: { orderBy: { id: "asc" }, include: { empleado: nombre } },
    },
  });
  if (!op) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({
    id: op.id,
    tipo: op.tipo,
    estado: op.estado,
    fechaContable: op.fechaContable.toISOString().slice(0, 10),
    contactoId: op.contactoId,
    contactoNombre: op.contactoNombre,
    observacion: op.observacion,
    datos: op.datos,
    total: Number(op.total),
    error: op.error,
    creadoPor: op.creadoPor.name,
    creadoEn: op.creadoEn,
    confirmadoPor: op.confirmadoPor?.name ?? null,
    confirmadoEn: op.confirmadoEn,
    anuladoPor: op.anuladoPor?.name ?? null,
    anuladoEn: op.anuladoEn,
    pasos: op.pasos.map((p) => ({
      fase: p.fase,
      orden: p.orden,
      descripcion: PASO_LABEL[p.tipo as PasoDef["tipo"]]?.(p.payload as unknown as PasoDef) ?? p.tipo,
      estado: p.estado,
      referencia: p.referencia,
      odooModelo: p.odooModelo,
      odooId: p.odooId,
      error: p.error,
      intentos: p.intentos,
      finalizadoEn: p.finalizadoEn,
    })),
    eventos: op.eventos.map((e) => ({ tipo: e.tipo, empleado: e.empleado.name, detalle: e.detalle, creadoEn: e.creadoEn })),
  });
}, { roles: ROLES_TESORERIA });

// Solo los borradores se editan
export const PUT = withAuth(async (req: NextRequest, _p, ctx) => {
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const b = leerBorrador(await req.json().catch(() => null));
  if (b instanceof NextResponse) return b;
  const r = await prisma.tesoreriaOperacion.updateMany({
    where: { id, estado: "BORRADOR" },
    data: {
      tipo: b.tipo,
      fechaContable: new Date(`${b.fechaContable}T00:00:00Z`),
      contactoId: b.contactoId,
      contactoNombre: b.contactoNombre,
      observacion: b.observacion,
      datos: b.datos as Prisma.InputJsonValue,
      total: totalOperacion(b.tipo, b.datos) || 0,
      error: null,
    },
  });
  if (!r.count) return NextResponse.json({ error: "Solo se editan los borradores" }, { status: 409 });
  return NextResponse.json({ id });
}, { roles: ROLES_TESORERIA });

export const DELETE = withAuth(async (_req: NextRequest, _p, ctx) => {
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const r = await prisma.tesoreriaOperacion.deleteMany({ where: { id, estado: "BORRADOR" } });
  if (!r.count) return NextResponse.json({ error: "Solo se eliminan los borradores" }, { status: 409 });
  return NextResponse.json({ ok: true });
}, { roles: ROLES_TESORERIA });
