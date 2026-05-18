import { NextRequest, NextResponse } from "next/server";
import { generateOrderPDF, generateGridPDF } from "@/lib/pdf";
import { odoo } from "@/lib/odoo";

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "orderId requerido" }, { status: 400 });
  }

  try {
    const pdfBytes = await generateOrderPDF(parseInt(orderId, 10));
    const buffer = Buffer.from(pdfBytes);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="orden-${orderId}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error generating PDF" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, printColumns, printValues, articles } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId requerido" }, { status: 400 });
    }

    const orders = await odoo.searchRead(
      "purchase.order",
      [["id", "=", orderId]],
      ["name", "partner_id", "date_order", "amount_total"],
    );

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const pdfBytes = await generateGridPDF({
      order: orders[0],
      articles: articles || [],
      printColumns: printColumns || [],
      printValues: printValues || {},
    });

    const buffer = Buffer.from(pdfBytes);
    const partnerName = Array.isArray(orders[0].partner_id)
      ? String(orders[0].partner_id[1])
      : String(orders[0].partner_id);
    const dateOrder = String(orders[0].date_order).split(" ")[0];

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${partnerName}-${dateOrder}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error generating PDF" },
      { status: 500 },
    );
  }
}
