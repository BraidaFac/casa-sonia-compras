import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";

export async function verifyToken(token: string) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return payload;
}

export async function authenticateRequest(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return false;
  try {
    return !!(await verifyToken(token));
  } catch {
    return false;
  }
}
