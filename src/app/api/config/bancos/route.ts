import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

const SELECT = { id: true, nombre: true, icono: true, activo: true, creadoEn: true, actualizadoEn: true } as const;

export const GET = withAuth(async () => {
  const bancos = await prisma.banco.findMany({
    orderBy: { nombre: "asc" },
    select: SELECT,
  });
  return NextResponse.json(bancos);
}, { roles: ["ADMIN", "MANAGER"] });

export const POST = withAuth(async (req: NextRequest, payload) => {
  const { nombre, icono } = await req.json();
  if (!nombre?.trim()) {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  const existing = await prisma.banco.findUnique({ where: { nombre: nombre.trim() } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un banco con ese nombre" }, { status: 409 });
  }

  const banco = await prisma.banco.create({
    data: { nombre: nombre.trim(), icono: icono ?? null, creadoPorId: payload.employeeId },
    select: SELECT,
  });
  return NextResponse.json(banco, { status: 201 });
}, { roles: ["ADMIN", "MANAGER"] });
