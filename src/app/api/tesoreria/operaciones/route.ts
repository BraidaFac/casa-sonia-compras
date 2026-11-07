import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "../../../../../prisma/generated/client";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { leerBorrador, ROLES_TESORERIA } from "@/lib/tesoreriaApi";
import { totalOperacion } from "@/lib/tesoreria";

// Crea un borrador. Nunca escribe en Odoo.
export const POST = withAuth(async (req: NextRequest, payload) => {
  const b = leerBorrador(await req.json().catch(() => null));
  if (b instanceof NextResponse) return b;
  const op = await prisma.tesoreriaOperacion.create({
    data: {
      tipo: b.tipo,
      fechaContable: new Date(`${b.fechaContable}T00:00:00Z`),
      contactoId: b.contactoId,
      contactoNombre: b.contactoNombre,
      observacion: b.observacion,
      datos: b.datos as Prisma.InputJsonValue,
      total: totalOperacion(b.tipo, b.datos) || 0,
      creadoPorId: payload.employeeId,
    },
  });
  await prisma.tesoreriaEvento.create({ data: { operacionId: op.id, empleadoId: payload.employeeId, tipo: "creada" } });
  return NextResponse.json({ id: op.id }, { status: 201 });
}, { roles: ROLES_TESORERIA });

// Borradores y operaciones que requieren atención, de cualquier fecha (aviso de la Vista General)
export const GET = withAuth(async () => {
  const ops = await prisma.tesoreriaOperacion.findMany({
    where: { estado: { in: ["BORRADOR", "REQUIERE_ATENCION"] } },
    orderBy: [{ fechaContable: "desc" }, { id: "desc" }],
    take: 50,
    select: { id: true, tipo: true, estado: true, fechaContable: true, contactoNombre: true, observacion: true, total: true },
  });
  return NextResponse.json(
    ops.map((o) => ({ ...o, fechaContable: o.fechaContable.toISOString().slice(0, 10), total: Number(o.total) })),
  );
}, { roles: ROLES_TESORERIA });
