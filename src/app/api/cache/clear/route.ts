import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { clearAttrCache } from "@/lib/productCache";

export const POST = withAuth(async () => {
  clearAttrCache();
  return NextResponse.json({ ok: true });
}, { roles: ["ADMIN"] });
