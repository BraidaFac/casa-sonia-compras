import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { clearAttrCache } from "@/lib/productCache";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  clearAttrCache();
  return NextResponse.json({ ok: true });
}
