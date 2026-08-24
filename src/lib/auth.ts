import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type TokenPayload = {
  employeeId: number;
  username: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "EMPLEADO" | "EMPLEADO_BASICO";
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EMPLEADO: "Encargado",
  EMPLEADO_BASICO: "Empleado",
};

export async function verifyToken(token: string): Promise<TokenPayload> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as TokenPayload;
}

export async function getRequestPayload(
  request: NextRequest,
): Promise<TokenPayload | null> {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function authenticateRequest(request: NextRequest): Promise<boolean> {
  return (await getRequestPayload(request)) !== null;
}

/**
 * Returns a 403 NextResponse if payload.role is not in roles, otherwise null.
 * Usage: const denied = requireRole(payload, ["ADMIN", "MANAGER"]); if (denied) return denied;
 */
export function requireRole(
  payload: TokenPayload,
  roles: Array<"ADMIN" | "MANAGER" | "EMPLEADO" | "EMPLEADO_BASICO">,
): NextResponse | null {
  if (!roles.includes(payload.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  return null;
}
