import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { searchProductTemplates } from "@/lib/odooExistencias";

export const GET = withAuth(async (req: NextRequest) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const results = await searchProductTemplates(q);
  return NextResponse.json(results);
});
