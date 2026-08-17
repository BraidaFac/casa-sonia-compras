import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { saveTempImage, deleteTempImage } from "@/lib/imageStorage";
import { randomUUID } from "crypto";
import { extname } from "path";

export const POST = withAuth(async (
  request: NextRequest,
  _payload,
  ctx,
) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
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
  const articleId = formData.get("articleId")?.toString() ?? "unknown";
  const colorName = formData.get("colorName")?.toString() ?? "unknown";
  const results: { imageId: string; tempPath: string }[] = [];

  for (const [key, value] of formData.entries()) {
    if (key !== "file" || !(value instanceof File)) continue;
    const ext = extname(value.name) || ".jpg";
    const filename = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await value.arrayBuffer());
    const tempPath = await saveTempImage(orderId, articleId, colorName, filename, buffer);
    results.push({ imageId: randomUUID(), tempPath });
  }

  return NextResponse.json({ results }, { status: 201 });
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });

export const DELETE = withAuth(async (
  request: NextRequest,
  _payload,
  ctx,
) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const { tempPath } = (await request.json()) as { tempPath: string };
  if (!tempPath) {
    return NextResponse.json({ error: "tempPath requerido" }, { status: 400 });
  }

  await deleteTempImage(tempPath);
  return new NextResponse(null, { status: 204 });
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
