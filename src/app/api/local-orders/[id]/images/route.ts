import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveTempImage } from "@/lib/imageStorage";
import { randomUUID } from "crypto";
import { extname } from "path";

async function authenticate(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }
  if (order.status === "CONFIRMED") {
    return NextResponse.json({ error: "Orden confirmada" }, { status: 409 });
  }

  const formData = await request.formData();
  const results: { imageId: string; tempPath: string }[] = [];

  for (const [, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    const ext = extname(value.name) || ".jpg";
    const filename = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await value.arrayBuffer());
    const tempPath = await saveTempImage(orderId, filename, buffer);
    results.push({ imageId: randomUUID(), tempPath });
  }

  return NextResponse.json({ results }, { status: 201 });
}
