import { NextRequest, NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    // Fetch the most recent supplier PDF (not ANULADO, not internal -INT)
    const attachments = await odoo.searchRead(
      "ir.attachment",
      [
        ["res_model", "=", "purchase.order"],
        ["res_id", "=", orderId],
        ["mimetype", "=", "application/pdf"],
        ["name", "not ilike", "ANULADO"],
        ["name", "not ilike", "-INT"],
      ],
      ["id", "name", "datas"],
      { order: "id desc", limit: 1 },
    );

    if (!attachments || attachments.length === 0) {
      return NextResponse.json({ error: "PDF no encontrado" }, { status: 404 });
    }

    const att = attachments[0];
    if (!att.datas) {
      return NextResponse.json({ error: "PDF sin contenido" }, { status: 404 });
    }

    const pdfBytes = Buffer.from(att.datas as string, "base64");
    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${att.name}"`,
        "Content-Length": String(pdfBytes.length),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error obteniendo PDF" },
      { status: 500 },
    );
  }
}
