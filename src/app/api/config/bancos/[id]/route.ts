import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const SELECT = { id: true, nombre: true, icono: true, activo: true, creadoEn: true, actualizadoEn: true } as const;

export const PATCH = withAuth(async (req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const bancoId = parseInt(id, 10);
  if (isNaN(bancoId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const banco = await prisma.banco.findUnique({ where: { id: bancoId } });
  if (!banco) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { nombre, activo, icono } = await req.json();

  if (nombre !== undefined) {
    const trimmed = nombre.trim();
    if (!trimmed) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    if (trimmed !== banco.nombre) {
      const existing = await prisma.banco.findUnique({ where: { nombre: trimmed } });
      if (existing) {
        return NextResponse.json({ error: "Ya existe un banco con ese nombre" }, { status: 409 });
      }
    }
  }

  const updated = await prisma.banco.update({
    where: { id: bancoId },
    data: {
      ...(nombre !== undefined && { nombre: nombre.trim() }),
      ...(activo !== undefined && { activo }),
      ...(icono !== undefined && { icono: icono ?? null }),
    },
    select: SELECT,
  });
  return NextResponse.json(updated);
}, { roles: ["ADMIN", "MANAGER"] });

export const DELETE = withAuth(async (_req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const bancoId = parseInt(id, 10);
  if (isNaN(bancoId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const banco = await prisma.banco.findUnique({
    where: { id: bancoId },
    include: { _count: { select: { promociones: true } } },
  });
  if (!banco) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const count = banco._count.promociones;
  if (count > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: tiene ${count} promoción${count > 1 ? "es" : ""} asociada${count > 1 ? "s" : ""}. Eliminá las promociones primero.` },
      { status: 409 },
    );
  }

  await prisma.banco.delete({ where: { id: bancoId } });
  return new NextResponse(null, { status: 204 });
}, { roles: ["ADMIN", "MANAGER"] });
