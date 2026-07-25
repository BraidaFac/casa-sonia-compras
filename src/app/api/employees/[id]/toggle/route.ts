import { NextRequest, NextResponse } from "next/server";
import { getRequestPayload, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const payload = await getRequestPayload(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireRole(payload, ["ADMIN", "MANAGER"]);
  if (denied) return denied;

  const { id } = await params;
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
}
