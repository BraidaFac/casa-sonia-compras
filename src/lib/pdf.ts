import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { odoo } from "./odoo";
import type { Article, PrintColumn, PrintValues, Warehouse } from "@/types";

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

// ─────────────────────────────────────────────────────────────────────────────
// Grid PDF — formato tabla por artículo (A4 landscape)
// ─────────────────────────────────────────────────────────────────────────────

interface GridOrderData {
  name: string;
  partner_id: [number, string] | number | string;
  date_order: string;
  amount_total?: number;
}

interface GridPdfData {
  order: GridOrderData;
  articles: Article[];
  printColumns: PrintColumn[];
  printValues: PrintValues;
  comment?: string;
  selectedWarehouses?: Warehouse[];
}

export async function generateGridPDF(data: GridPdfData): Promise<Uint8Array> {
  const { order, articles, printColumns, printValues, comment, selectedWarehouses = [] } = data;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const colorAccent = rgb(0.851, 0.467, 0.024);
  const colorBlack = rgb(0, 0, 0);
  const colorWhite = rgb(1, 1, 1);
  const colorMuted = rgb(0.4, 0.4, 0.4);
  const colorBorderCell = rgb(0.82, 0.81, 0.80);
  const colorRowEven = rgb(1, 1, 1);
  const colorRowOdd = rgb(0.97, 0.965, 0.96);
  const colorTotalRow = rgb(0.91, 0.895, 0.88);
  const colorArticleHeader = rgb(0.94, 0.925, 0.91);
  const colorEmptyCell = rgb(0.955, 0.948, 0.942);

  const PAGE_W = 841.89; // A4 landscape
  const PAGE_H = 595.28;
  const MARGIN = 30;
  const ROW_H = 16;
  const HEADER_ROW_H = 18;
  const PRINT_COL_W = 70;
  const COLOR_COL_W = 90;
  const COLOR_BASE_COL_W = 75;

  const LOGO_H = 28;
  const LOGO_W = 34;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // ── ORDER HEADER (first page only) ─────────────────────────────────────────

  // Logo — "CS" text block
  page.drawRectangle({
    x: MARGIN, y: y - LOGO_H, width: LOGO_W, height: LOGO_H,
    color: colorBlack,
  });
  const csW = fontBold.widthOfTextAtSize("CS", 16);
  page.drawText("CS", {
    x: MARGIN + (LOGO_W - csW) / 2,
    y: y - LOGO_H + 7,
    size: 16,
    font: fontBold,
    color: colorWhite,
  });

  page.drawText("ORDEN DE COMPRA", {
    x: MARGIN + LOGO_W + 10, y: y - 8, size: 16, font: fontBold, color: colorBlack,
  });

  const orderName = String(order.name);
  page.drawText(orderName, {
    x: MARGIN + LOGO_W + 10, y: y - 22, size: 10, font, color: colorMuted,
  });

  const supplierName = Array.isArray(order.partner_id)
    ? String(order.partner_id[1])
    : String(order.partner_id);

  page.drawText(`Proveedor: ${supplierName}`, {
    x: PAGE_W - MARGIN - 260, y: y - 8, size: 10, font: fontBold, color: colorBlack,
  });

  const dateStr = order.date_order
    ? new Date(order.date_order).toLocaleDateString("es-AR")
    : "-";
  page.drawText(`Fecha: ${dateStr}`, {
    x: PAGE_W - MARGIN - 260, y: y - 22, size: 10, font, color: colorMuted,
  });

  y -= 35;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1,
    color: colorAccent,
  });
  y -= 15;

  // ── PER-ARTICLE GRIDS ───────────────────────────────────────────────────────

  for (const article of articles) {
    const hasMeta = !!(article.referencia || article.price);
    const articleHeaderH = 20 + (hasMeta ? 14 : 0) + 4;
    const tableH = HEADER_ROW_H + article.rows.length * ROW_H + ROW_H; // +1 for total row
    const needed = articleHeaderH + tableH + 20;

    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }

    // ── Article header bar ────────────────────────────────────────────────────

    page.drawRectangle({
      x: MARGIN, y: y - 20, width: PAGE_W - MARGIN * 2, height: 20,
      color: colorArticleHeader,
    });

    const articleLabel = truncate(article.name.toUpperCase(), 55);
    page.drawText(articleLabel, {
      x: MARGIN + 6, y: y - 14, size: 10, font: fontBold, color: colorBlack,
    });

    const totalUnits = article.rows.reduce((sum, row) => {
      if (selectedWarehouses.length > 0) {
        return sum + Object.values(row.warehouseQuantities || {}).reduce(
          (s, v) => s + (parseInt(v || "0", 10) || 0), 0
        );
      }
      return sum + article.sizes.reduce(
        (s, sz) => s + (parseInt(row.quantities[sz.name] || "0", 10) || 0), 0
      );
    }, 0);
    const unitsLabel = `${totalUnits} u.`;
    const unitsW = fontBold.widthOfTextAtSize(unitsLabel, 10);
    page.drawText(unitsLabel, {
      x: PAGE_W - MARGIN - unitsW - 4, y: y - 14, size: 10, font: fontBold, color: colorAccent,
    });

    y -= 20;

    if (hasMeta) {
      const metaParts: string[] = [];
      if (article.referencia) metaParts.push(`Ref: ${article.referencia}`);
      if (article.price) metaParts.push(`Costo: $${parseFloat(article.price).toLocaleString("es-AR")}`);
      page.drawText(metaParts.join("  |  "), {
        x: MARGIN + 6, y: y - 10, size: 8, font, color: colorMuted,
      });
      y -= 14;
    }
    y -= 4;

    // ── Column widths ─────────────────────────────────────────────────────────

    const warehouseColW = selectedWarehouses.length > 0 ? 70 : 0;
    const available = PAGE_W - MARGIN * 2;
    const fixedW = printColumns.length * PRINT_COL_W + COLOR_COL_W + COLOR_BASE_COL_W + warehouseColW;
    const sizeColW = article.sizes.length > 0
      ? Math.min(50, Math.max(25, (available - fixedW) / article.sizes.length))
      : 40;

    // ── Table header row ──────────────────────────────────────────────────────

    let x = MARGIN;

    for (const col of printColumns) {
      page.drawRectangle({
        x, y: y - HEADER_ROW_H, width: PRINT_COL_W, height: HEADER_ROW_H,
        color: colorAccent, borderColor: colorBorderCell, borderWidth: 0.5,
      });
      const txt = truncate(col.header || "—", 11);
      const tw = fontBold.widthOfTextAtSize(txt, 8);
      page.drawText(txt, {
        x: x + (PRINT_COL_W - tw) / 2, y: y - HEADER_ROW_H + 5,
        size: 8, font: fontBold, color: colorWhite,
      });
      x += PRINT_COL_W;
    }

    page.drawRectangle({
      x, y: y - HEADER_ROW_H, width: COLOR_COL_W, height: HEADER_ROW_H,
      color: colorAccent, borderColor: colorBorderCell, borderWidth: 0.5,
    });
    page.drawText("COLOR PROVEEDOR", {
      x: x + 4, y: y - HEADER_ROW_H + 5, size: 7, font: fontBold, color: colorWhite,
    });
    x += COLOR_COL_W;

    page.drawRectangle({
      x, y: y - HEADER_ROW_H, width: COLOR_BASE_COL_W, height: HEADER_ROW_H,
      color: colorAccent, borderColor: colorBorderCell, borderWidth: 0.5,
    });
    page.drawText("COLOR BASE", {
      x: x + 4, y: y - HEADER_ROW_H + 5, size: 7, font: fontBold, color: colorWhite,
    });
    x += COLOR_BASE_COL_W;

    if (selectedWarehouses.length > 0) {
      page.drawRectangle({
        x, y: y - HEADER_ROW_H, width: warehouseColW, height: HEADER_ROW_H,
        color: colorAccent, borderColor: colorBorderCell, borderWidth: 0.5,
      });
      page.drawText("SUCURSAL", {
        x: x + 4, y: y - HEADER_ROW_H + 5, size: 8, font: fontBold, color: colorWhite,
      });
      x += warehouseColW;
    }

    for (const sz of article.sizes) {
      page.drawRectangle({
        x, y: y - HEADER_ROW_H, width: sizeColW, height: HEADER_ROW_H,
        color: colorAccent, borderColor: colorBorderCell, borderWidth: 0.5,
      });
      const szTxt = truncate(sz.name, 6);
      const szW = fontBold.widthOfTextAtSize(szTxt, 8);
      page.drawText(szTxt, {
        x: x + (sizeColW - szW) / 2, y: y - HEADER_ROW_H + 5,
        size: 8, font: fontBold, color: colorWhite,
      });
      x += sizeColW;
    }

    y -= HEADER_ROW_H;

    // ── Data rows ─────────────────────────────────────────────────────────────

    const totalsBySize: Record<string, number> = {};
    article.sizes.forEach((sz) => (totalsBySize[sz.name] = 0));

    article.rows.forEach((row, rowIdx) => {
      const rowBg = rowIdx % 2 === 0 ? colorRowEven : colorRowOdd;

      if (selectedWarehouses.length === 0) {
        // ── No warehouses — original single row ──────────────────────────────
        x = MARGIN;

        for (const col of printColumns) {
          const val = truncate(printValues[`${article.id}:${row.id}:${col.id}`] || "", 11);
          page.drawRectangle({
            x, y: y - ROW_H, width: PRINT_COL_W, height: ROW_H,
            color: rowBg, borderColor: colorBorderCell, borderWidth: 0.5,
          });
          if (val) {
            const vw = font.widthOfTextAtSize(val, 8);
            page.drawText(val, {
              x: x + (PRINT_COL_W - vw) / 2, y: y - ROW_H + 4,
              size: 8, font, color: colorBlack,
            });
          }
          x += PRINT_COL_W;
        }

        const colorName = truncate(row.color?.name || "—", 13);
        const xColorStart = x;
        page.drawRectangle({
          x, y: y - ROW_H, width: COLOR_COL_W, height: ROW_H,
          color: rowBg, borderColor: colorBorderCell, borderWidth: 0.5,
        });
        let colorTextX = xColorStart + 4;
        if (row.color?.hexColor) {
          const hex = row.color.hexColor;
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          page.drawCircle({
            x: xColorStart + 7,
            y: y - ROW_H / 2,
            size: 4,
            color: rgb(r, g, b),
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5,
          });
          colorTextX = xColorStart + 15;
        }
        page.drawText(colorName, {
          x: colorTextX, y: y - ROW_H + 4, size: 8, font, color: colorBlack,
        });
        x += COLOR_COL_W;

        // Color Base cell
        const colorBaseName = truncate(row.color?.colorBase || "—", 12);
        page.drawRectangle({
          x, y: y - ROW_H, width: COLOR_BASE_COL_W, height: ROW_H,
          color: rowBg, borderColor: colorBorderCell, borderWidth: 0.5,
        });
        page.drawText(colorBaseName, {
          x: x + 4, y: y - ROW_H + 4, size: 8, font, color: colorBlack,
        });
        x += COLOR_BASE_COL_W;

        for (const sz of article.sizes) {
          const qty = parseInt(row.quantities[sz.name] || "0", 10) || 0;
          totalsBySize[sz.name] = (totalsBySize[sz.name] || 0) + qty;

          page.drawRectangle({
            x, y: y - ROW_H, width: sizeColW, height: ROW_H,
            color: qty > 0 ? rowBg : colorEmptyCell,
            borderColor: colorBorderCell, borderWidth: 0.5,
          });
          if (qty > 0) {
            const qStr = String(qty);
            const qw = font.widthOfTextAtSize(qStr, 8);
            page.drawText(qStr, {
              x: x + (sizeColW - qw) / 2, y: y - ROW_H + 4,
              size: 8, font, color: colorBlack,
            });
          }
          x += sizeColW;
        }

        y -= ROW_H;
      } else {
        // ── With warehouses — N subrows per color ────────────────────────────
        const nSub = selectedWarehouses.length;
        const colorCellH = ROW_H * nSub;

        // Draw color cell spanning all subrows (simulated rowSpan)
        const xPrintStart = MARGIN + printColumns.length * PRINT_COL_W;
        for (let ci = 0; ci < printColumns.length; ci++) {
          const col = printColumns[ci];
          const val = truncate(printValues[`${article.id}:${row.id}:${col.id}`] || "", 11);
          const xP = MARGIN + ci * PRINT_COL_W;
          page.drawRectangle({
            x: xP, y: y - colorCellH, width: PRINT_COL_W, height: colorCellH,
            color: rowBg, borderColor: colorBorderCell, borderWidth: 0.5,
          });
          if (val) {
            const vw = font.widthOfTextAtSize(val, 8);
            page.drawText(val, {
              x: xP + (PRINT_COL_W - vw) / 2, y: y - colorCellH / 2 - 3,
              size: 8, font, color: colorBlack,
            });
          }
        }

        const colorName = truncate(row.color?.name || "—", 13);
        page.drawRectangle({
          x: xPrintStart, y: y - colorCellH, width: COLOR_COL_W, height: colorCellH,
          color: rowBg, borderColor: colorBorderCell, borderWidth: 0.5,
        });
        let wColorTextX = xPrintStart + 4;
        if (row.color?.hexColor) {
          const hex = row.color.hexColor;
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          page.drawCircle({
            x: xPrintStart + 7,
            y: y - colorCellH / 2,
            size: 4,
            color: rgb(r, g, b),
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5,
          });
          wColorTextX = xPrintStart + 15;
        }
        page.drawText(colorName, {
          x: wColorTextX, y: y - colorCellH / 2 - 3,
          size: 8, font, color: colorBlack,
        });

        // Color Base cell spanning all subrows
        const xColorBase = xPrintStart + COLOR_COL_W;
        const colorBaseName = truncate(row.color?.colorBase || "—", 11);
        page.drawRectangle({
          x: xColorBase, y: y - colorCellH, width: COLOR_BASE_COL_W, height: colorCellH,
          color: rowBg, borderColor: colorBorderCell, borderWidth: 0.5,
        });
        page.drawText(colorBaseName, {
          x: xColorBase + 4, y: y - colorCellH / 2 - 3,
          size: 8, font, color: colorBlack,
        });

        // Draw each warehouse subrow
        selectedWarehouses.forEach((warehouse) => {
          const xW = xPrintStart + COLOR_COL_W + COLOR_BASE_COL_W;

          page.drawRectangle({
            x: xW, y: y - ROW_H, width: warehouseColW, height: ROW_H,
            color: rowBg, borderColor: colorBorderCell, borderWidth: 0.5,
          });
          page.drawText(truncate(warehouse.name, 10), {
            x: xW + 4, y: y - ROW_H + 4, size: 7, font, color: colorBlack,
          });

          let xS = xW + warehouseColW;
          for (const sz of article.sizes) {
            const qty = parseInt(
              row.warehouseQuantities?.[`${warehouse.id}:${sz.name}`] || "0", 10,
            ) || 0;
            totalsBySize[sz.name] = (totalsBySize[sz.name] || 0) + qty;

            page.drawRectangle({
              x: xS, y: y - ROW_H, width: sizeColW, height: ROW_H,
              color: qty > 0 ? rowBg : colorEmptyCell,
              borderColor: colorBorderCell, borderWidth: 0.5,
            });
            if (qty > 0) {
              const qStr = String(qty);
              const qw = font.widthOfTextAtSize(qStr, 8);
              page.drawText(qStr, {
                x: xS + (sizeColW - qw) / 2, y: y - ROW_H + 4,
                size: 8, font, color: colorBlack,
              });
            }
            xS += sizeColW;
          }

          y -= ROW_H;
        });
      }
    });

    // ── Total row ─────────────────────────────────────────────────────────────

    x = MARGIN;

    for (const _col of printColumns) {
      page.drawRectangle({
        x, y: y - ROW_H, width: PRINT_COL_W, height: ROW_H,
        color: colorTotalRow, borderColor: colorBorderCell, borderWidth: 0.5,
      });
      x += PRINT_COL_W;
    }

    page.drawRectangle({
      x, y: y - ROW_H, width: COLOR_COL_W, height: ROW_H,
      color: colorTotalRow, borderColor: colorBorderCell, borderWidth: 0.5,
    });
    page.drawText("TOTAL", {
      x: x + 5, y: y - ROW_H + 4, size: 8, font: fontBold, color: colorBlack,
    });
    x += COLOR_COL_W;

    page.drawRectangle({
      x, y: y - ROW_H, width: COLOR_BASE_COL_W, height: ROW_H,
      color: colorTotalRow, borderColor: colorBorderCell, borderWidth: 0.5,
    });
    x += COLOR_BASE_COL_W;

    if (selectedWarehouses.length > 0) {
      page.drawRectangle({
        x, y: y - ROW_H, width: warehouseColW, height: ROW_H,
        color: colorTotalRow, borderColor: colorBorderCell, borderWidth: 0.5,
      });
      x += warehouseColW;
    }

    for (const sz of article.sizes) {
      const total = totalsBySize[sz.name] || 0;
      page.drawRectangle({
        x, y: y - ROW_H, width: sizeColW, height: ROW_H,
        color: colorTotalRow, borderColor: colorBorderCell, borderWidth: 0.5,
      });
      if (total > 0) {
        const tStr = String(total);
        const tw = fontBold.widthOfTextAtSize(tStr, 8);
        page.drawText(tStr, {
          x: x + (sizeColW - tw) / 2, y: y - ROW_H + 4,
          size: 8, font: fontBold, color: colorAccent,
        });
      }
      x += sizeColW;
    }

    y -= ROW_H + 20;
  }

  // Total valorizado
  const warehouseMode = selectedWarehouses.length > 0;

  const grandTotal = articles.reduce((sum, article) =>
    sum + article.rows.reduce((s2, row) => {
      if (warehouseMode) {
        return s2 + Object.entries(row.warehouseQuantities || {}).reduce((s3, [key, val]) => {
          const qty = parseInt(val || "0", 10) || 0;
          if (qty <= 0) return s3;
          const sizeName = key.split(":").slice(1).join(":");
          const price = article.priceGranular
            ? parseFloat(row.prices?.[sizeName] || article.price) || 0
            : parseFloat(article.price) || 0;
          return s3 + qty * price;
        }, 0);
      }
      return s2 + article.sizes.reduce((s3, sz) => {
        const qty = parseInt(row.quantities[sz.name] || "0", 10) || 0;
        if (qty <= 0) return s3;
        const price = article.priceGranular
          ? parseFloat(row.prices?.[sz.name] || article.price) || 0
          : parseFloat(article.price) || 0;
        return s3 + qty * price;
      }, 0);
    }, 0), 0);

  const grandUnits = articles.reduce((sum, article) =>
    sum + article.rows.reduce((s2, row) => {
      if (warehouseMode) {
        return s2 + Object.values(row.warehouseQuantities || {}).reduce(
          (s, v) => s + (parseInt(v || "0", 10) || 0), 0
        );
      }
      return s2 + article.sizes.reduce((s3, sz) =>
        s3 + (parseInt(row.quantities[sz.name] || "0", 10) || 0), 0);
    }, 0), 0);

  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: colorAccent });
  y -= 14;
  page.drawText(`Total unidades: ${grandUnits}`, { x: MARGIN, y, size: 9, font, color: colorBlack });
  const totalStr = `TOTAL: $${grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const totalW = fontBold.widthOfTextAtSize(totalStr, 11);
  page.drawText(totalStr, { x: PAGE_W - MARGIN - totalW, y, size: 11, font: fontBold, color: colorAccent });
  y -= 20;

  // Comment
  if (comment && comment.trim()) {
    page.drawText("Comentario:", { x: MARGIN, y, size: 8, font: fontBold, color: colorBlack });
    y -= 12;
    const paragraphs = comment.trim().split(/\r?\n/);
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === "") {
        y -= 11;
        continue;
      }
      const words = paragraph.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, 8) > PAGE_W - MARGIN * 2 - 10) {
          page.drawText(line, { x: MARGIN + 6, y, size: 8, font, color: colorMuted });
          y -= 11;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        page.drawText(line, { x: MARGIN + 6, y, size: 8, font, color: colorMuted });
        y -= 11;
      }
    }
    y -= 3;
  }

  // Footer on last page
  page.drawText(`Generado el ${new Date().toLocaleString("es-AR")} — Casa Sonia`, {
    x: MARGIN, y: MARGIN - 10, size: 7, font, color: rgb(0.6, 0.6, 0.6),
  });

  return pdfDoc.save();
}
