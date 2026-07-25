import { NextRequest, NextResponse } from "next/server";
import { getRequestPayload } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const payload = await getRequestPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({
    employeeId: payload.employeeId,
    username: payload.username,
    name: payload.name,
    role: payload.role,
  });
}
