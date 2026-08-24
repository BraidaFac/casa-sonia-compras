import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async () => {
  const medios = await prisma.medioPago.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, activo: true, creadoEn: true, actualizadoEn: true },
  });
  return NextResponse.json(medios);
}, { roles: ["ADMIN", "MANAGER"] });

export const POST = withAuth(async (req: NextRequest, payload) => {
  const { nombre } = await req.json();
  if (!nombre?.trim()) {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  const existing = await prisma.medioPago.findUnique({ where: { nombre: nombre.trim() } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un medio de pago con ese nombre" }, { status: 409 });
  }

  const medio = await prisma.medioPago.create({
    data: { nombre: nombre.trim(), creadoPorId: payload.employeeId },
    select: { id: true, nombre: true, activo: true, creadoEn: true, actualizadoEn: true },
  });
  return NextResponse.json(medio, { status: 201 });
}, { roles: ["ADMIN", "MANAGER"] });
