import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async (req: NextRequest) => {
  const code = req.nextUrl.searchParams.get("code") || "";
  if (!code.trim()) {
    return NextResponse.json({ exists: false });
  }

  try {
    const results = await odoo.searchRead(
      "product.template",
      [["default_code", "=", code.trim()]],
      ["id"],
      { limit: 1 },
    );
    return NextResponse.json({ exists: results.length > 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error checking code" },
      { status: 500 },
    );
  }
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
