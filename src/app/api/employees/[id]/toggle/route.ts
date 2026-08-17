import { NextRequest, NextResponse } from "next/server";
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

export const PATCH = withAuth(async (_request: NextRequest, payload, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const empId = parseInt(id, 10);
  if (isNaN(empId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const target = await prisma.employee.findUnique({ where: { id: empId } });
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (payload.role === "MANAGER" && target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Sin permisos para modificar empleados ADMIN" },
      { status: 403 },
    );
  }

  if (empId === payload.employeeId) {
    return NextResponse.json(
      { error: "No podés desactivar tu propia cuenta" },
      { status: 400 },
    );
  }

  const updated = await prisma.employee.update({
    where: { id: empId },
    data: { active: !target.active },
    select: SELECT,
  });

  return NextResponse.json(updated);
}, { roles: ["ADMIN", "MANAGER"] });
