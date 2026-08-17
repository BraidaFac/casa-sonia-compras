import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

const SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export const PUT = withAuth(async (request: NextRequest, payload, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const empId = parseInt(id, 10);
  if (isNaN(empId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const target = await prisma.employee.findUnique({ where: { id: empId } });
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (payload.role === "MANAGER" && target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Sin permisos para editar empleados ADMIN" },
      { status: 403 },
    );
  }

  const { username, name, role, password } = await request.json();

  if (!username || !name || !role) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  if (payload.role === "MANAGER" && role === "ADMIN") {
    return NextResponse.json(
      { error: "Sin permisos para asignar rol ADMIN" },
      { status: 403 },
    );
  }

  if (username !== target.username) {
    const existing = await prisma.employee.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "El username ya existe" }, { status: 409 });
    }
  }

  const data: Record<string, unknown> = { username, name, role };
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 12);
  }

  const updated = await prisma.employee.update({
    where: { id: empId },
    data,
    select: SELECT,
  });

  return NextResponse.json(updated);
}, { roles: ["ADMIN", "MANAGER"] });
