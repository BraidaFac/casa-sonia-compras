import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import type { TokenPayload } from "@/lib/auth";

export const GET = withAuth(async (_req, payload: TokenPayload) => {
  return NextResponse.json({
    employeeId: payload.employeeId,
    username: payload.username,
    name: payload.name,
    role: payload.role,
  });
});
