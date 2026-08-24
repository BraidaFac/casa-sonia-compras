import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const medioId = parseInt(id, 10);
  if (isNaN(medioId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const medio = await prisma.medioPago.findUnique({ where: { id: medioId } });
  if (!medio) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { nombre, activo } = await req.json();

  if (nombre !== undefined) {
    const trimmed = nombre.trim();
    if (!trimmed) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    if (trimmed !== medio.nombre) {
      const existing = await prisma.medioPago.findUnique({ where: { nombre: trimmed } });
      if (existing) {
        return NextResponse.json({ error: "Ya existe un medio de pago con ese nombre" }, { status: 409 });
      }
    }
  }

  const updated = await prisma.medioPago.update({
    where: { id: medioId },
    data: {
      ...(nombre !== undefined && { nombre: nombre.trim() }),
      ...(activo !== undefined && { activo }),
    },
    select: { id: true, nombre: true, activo: true, creadoEn: true, actualizadoEn: true },
  });
  return NextResponse.json(updated);
}, { roles: ["ADMIN", "MANAGER"] });

export const DELETE = withAuth(async (_req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const medioId = parseInt(id, 10);
  if (isNaN(medioId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const medio = await prisma.medioPago.findUnique({ where: { id: medioId } });
  if (!medio) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const count = await prisma.descuentoEspecial.count({ where: { medioPagoId: medioId } });
  if (count > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: tiene ${count} descuento${count > 1 ? "s" : ""} asociado${count > 1 ? "s" : ""}. Eliminá los descuentos primero.` },
      { status: 409 },
    );
  }

  await prisma.medioPago.delete({ where: { id: medioId } });
  return new NextResponse(null, { status: 204 });
}, { roles: ["ADMIN", "MANAGER"] });
