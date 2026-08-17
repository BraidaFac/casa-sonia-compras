import { NextRequest, NextResponse } from "next/server";
import { getRequestPayload } from "@/lib/auth";
import type { TokenPayload } from "@/lib/auth";

type Role = "ADMIN" | "MANAGER" | "EMPLEADO" | "EMPLEADO_BASICO";

interface WithAuthOptions {
  /** If provided, request is rejected with 403 if payload.role is not in this list */
  roles?: Role[];
}

/**
 * Wraps a Next.js route handler with authentication and optional role enforcement.
 *
 * Usage — any authenticated user:
 *   export const GET = withAuth(async (req, payload) => { ... });
 *
 * Usage — role-restricted:
 *   export const POST = withAuth(
 *     async (req, payload) => { ... },
 *     { roles: ["ADMIN", "MANAGER"] }
 *   );
 *
 * Usage — dynamic routes (e.g. /api/employees/[id]):
 *   export const GET = withAuth(async (req, payload, ctx) => {
 *     const { id } = (ctx as { params: { id: string } }).params;
 *   });
 */
export function withAuth(
  handler: (req: NextRequest, payload: TokenPayload, context: object) => Promise<Response>,
  options: WithAuthOptions = {},
): (req: NextRequest, context?: object) => Promise<Response> {
  return async (req: NextRequest, context: object = {}) => {
    const payload = await getRequestPayload(req);
    if (!payload) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (options.roles && !(options.roles as string[]).includes(payload.role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }
    return handler(req, payload, context);
  };
}
