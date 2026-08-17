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

export const GET = withAuth(async () => {
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    select: SELECT,
  });

  return NextResponse.json(employees);
}, { roles: ["ADMIN", "MANAGER"] });

export const POST = withAuth(async (req: NextRequest, payload) => {
  const { username, password, name, role } = await req.json();

  if (!username || !password || !name || !role) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  if (payload.role === "MANAGER" && role === "ADMIN") {
    return NextResponse.json(
      { error: "Sin permisos para crear empleados con rol ADMIN" },
      { status: 403 },
    );
  }

  const existing = await prisma.employee.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "El username ya existe" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const employee = await prisma.employee.create({
    data: { username, passwordHash, name, role },
    select: SELECT,
  });

  return NextResponse.json(employee, { status: 201 });
}, { roles: ["ADMIN", "MANAGER"] });
