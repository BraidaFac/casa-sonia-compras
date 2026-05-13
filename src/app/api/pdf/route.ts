import { NextRequest, NextResponse } from "next/server";
import { generateOrderPDF } from "@/lib/pdf";

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
