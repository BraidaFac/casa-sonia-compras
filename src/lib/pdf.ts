import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { odoo } from "./odoo";

interface OrderLine {
  productName: string;
  variantAttrs: string;
  qty: number;
  priceUnit: number;
}

interface PurchaseOrderData {
  name: string;
  dateOrder: string;
  partnerName: string;
  lines: OrderLine[];
}

async function fetchOrderData(orderId: number): Promise<PurchaseOrderData> {
  const orders = await odoo.searchRead(
    "purchase.order",
    [["id", "=", orderId]],
    ["name", "date_order", "partner_id", "order_line"],
  );

  if (!orders || orders.length === 0) {
    throw new Error(`Order ${orderId} not found`);
  }

  const order = orders[0];
  const partnerName = Array.isArray(order.partner_id)
    ? order.partner_id[1]
    : String(order.partner_id || "Unknown");

  const lineIds: number[] = Array.isArray(order.order_line) ? order.order_line : [];

  if (lineIds.length === 0) {
    return { name: order.name, dateOrder: order.date_order, partnerName, lines: [] };
  }

  const rawLines = await odoo.read("purchase.order.line", lineIds, [
    "product_id",
    "name",
    "product_qty",
    "price_unit",
  ]);

  const variantIds: number[] = rawLines
    .map((l: Record<string, unknown>) =>
      Array.isArray(l.product_id) ? (l.product_id[0] as number) : (l.product_id as number),
    )
    .filter((id: number) => id > 0);

  const uniqueVariantIds = [...new Set(variantIds)];

  const variantDisplayMap: Record<number, string> = {};
  if (uniqueVariantIds.length > 0) {
    const variants = await odoo.read("product.product", uniqueVariantIds, ["id", "display_name"]);
    for (const v of variants) {
      variantDisplayMap[v.id as number] = v.display_name as string;
    }
  }

  const lines: OrderLine[] = rawLines.map((l: Record<string, unknown>) => {
    const variantId = Array.isArray(l.product_id)
      ? (l.product_id[0] as number)
      : (l.product_id as number);

    const displayName = variantDisplayMap[variantId] || (l.name as string) || "Unknown";

    // display_name includes variant attrs (e.g. "Remera (Rojo, M)")
    // Split on first " (" to separate product name from variant attrs
    const parenIdx = displayName.indexOf(" (");
    const productName = parenIdx > -1 ? displayName.slice(0, parenIdx) : displayName;
    const variantAttrs = parenIdx > -1 ? displayName.slice(parenIdx + 2, -1) : "";

    return {
      productName,
      variantAttrs,
      qty: Number(l.product_qty) || 0,
      priceUnit: Number(l.price_unit) || 0,
    };
  });

  return {
    name: order.name as string,
    dateOrder: order.date_order as string,
    partnerName,
    lines,
  };
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

export async function generateOrderPDF(orderId: number): Promise<Uint8Array> {
  const data = await fetchOrderData(orderId);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - margin;

  const amber = rgb(0.85, 0.47, 0.02);
  const dark = rgb(0.1, 0.09, 0.09);
  const light = rgb(0.96, 0.94, 0.92);
  const muted = rgb(0.42, 0.37, 0.32);
  const rowAlt = rgb(0.96, 0.96, 0.96);

  // Header bar
  page.drawRectangle({
    x: 0,
    y: height - 60,
    width,
    height: 60,
    color: dark,
  });

  page.drawText("ORDEN DE COMPRA", {
    x: margin,
    y: height - 38,
    size: 18,
    font: fontBold,
    color: amber,
  });

  page.drawText("Casa Sonia", {
    x: width - margin - 80,
    y: height - 38,
    size: 12,
    font: fontBold,
    color: light,
  });

  y = height - 80;

  // Order metadata
  const meta = [
    `Número: ${data.name}`,
    `Proveedor: ${data.partnerName}`,
    `Fecha: ${data.dateOrder ? new Date(data.dateOrder).toLocaleDateString("es-AR") : "-"}`,
  ];

  for (const line of meta) {
    page.drawText(line, { x: margin, y, size: 11, font: fontRegular, color: dark });
    y -= 18;
  }

  y -= 16;

  // Table header
  const cols = [margin, margin + 200, margin + 290, margin + 360, margin + 430];

  page.drawRectangle({
    x: margin,
    y: y - 4,
    width: width - margin * 2,
    height: 22,
    color: amber,
  });

  const headers = ["Producto", "Variante", "Cant.", "Precio unit.", "Subtotal"];
  for (let i = 0; i < headers.length; i++) {
    page.drawText(headers[i], {
      x: cols[i] + 4,
      y: y + 4,
      size: 9,
      font: fontBold,
      color: light,
    });
  }

  y -= 4;

  let totalQty = 0;
  let totalAmount = 0;
  let currentPage = page;

  for (let idx = 0; idx < data.lines.length; idx++) {
    const line = data.lines[idx];

    if (y < margin + 60) {
      currentPage = pdfDoc.addPage([595, 842]);
      y = height - margin;
      currentPage.drawText("(continuación)", {
        x: margin, y, size: 9, font: fontRegular, color: muted,
      });
      y -= 20;
    }

    const subtotal = line.qty * line.priceUnit;
    totalQty += line.qty;
    totalAmount += subtotal;

    if (idx % 2 === 0) {
      currentPage.drawRectangle({
        x: margin, y: y - 16, width: width - margin * 2, height: 20, color: rowAlt,
      });
    }

    currentPage.drawText(truncate(line.productName, 32), {
      x: cols[0] + 4, y: y - 10, size: 9, font: fontRegular, color: dark,
    });
    currentPage.drawText(truncate(line.variantAttrs, 14), {
      x: cols[1] + 4, y: y - 10, size: 9, font: fontRegular, color: dark,
    });
    currentPage.drawText(String(line.qty), {
      x: cols[2] + 4, y: y - 10, size: 9, font: fontRegular, color: dark,
    });
    currentPage.drawText(`$${line.priceUnit.toFixed(2)}`, {
      x: cols[3] + 4, y: y - 10, size: 9, font: fontRegular, color: dark,
    });
    currentPage.drawText(`$${subtotal.toFixed(2)}`, {
      x: cols[4] + 4, y: y - 10, size: 9, font: fontBold, color: dark,
    });

    y -= 20;
  }

  // Total row
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: amber,
  });
  y -= 16;

  page.drawText("TOTAL", { x: cols[0] + 4, y, size: 10, font: fontBold, color: dark });
  page.drawText(String(totalQty), { x: cols[2] + 4, y, size: 10, font: fontBold, color: dark });
  page.drawText(`$${totalAmount.toFixed(2)}`, {
    x: cols[4] + 4, y, size: 10, font: fontBold, color: amber,
  });

  // Footer
  page.drawText(
    `Generado el ${new Date().toLocaleString("es-AR")}`,
    { x: margin, y: margin + 10, size: 8, font: fontRegular, color: muted },
  );

  return pdfDoc.save();
}
