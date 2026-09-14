// src/lib/pdfPromociones.ts
import { PDFDocument, PDFPage, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { getBankIcon } from "@/lib/bankIcons";
import { PROMO_TOKENS_PDF as PROMO_TOKENS } from "@/lib/promoTokens";
import type { PromoVigente } from "@/lib/configPricing";

// ── Layout ────────────────────────────────────────────────────────────────────

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;

const HEADER_H = 90;
const SECTION_GAP = 18;
const SECTION_H = 16;
const SECTION_AFTER = 10;
const CARD_H = 70;
const CARD_GAP = 6;

// ── Paleta (derivada de PROMO_TOKENS) ─────────────────────────────────────────

function h(hex: string): ReturnType<typeof rgb> {
  const s = hex.replace("#", "");
  return rgb(
    parseInt(s.slice(0, 2), 16) / 255,
    parseInt(s.slice(2, 4), 16) / 255,
    parseInt(s.slice(4, 6), 16) / 255,
  );
}

const C = {
  accent:      h(PROMO_TOKENS.accent),      // #B5563C — terracota, único acento
  pageBg:      h(PROMO_TOKENS.pageBg),      // #F7F7F8
  headerBg:    h(PROMO_TOKENS.headerBg),    // #0D0D0D
  cardBg:      h(PROMO_TOKENS.cardBg),      // #FFFFFF
  cardBorder:  h(PROMO_TOKENS.cardBorder),  // #E5E7EB
  text1:       h(PROMO_TOKENS.text1),       // #111827
  text2:       h(PROMO_TOKENS.text2),       // #6B7280
  text3:       h(PROMO_TOKENS.text3),       // #9CA3AF
  sectionLine: h(PROMO_TOKENS.sectionLine), // #D1D5DB
  white:       rgb(1, 1, 1),
};

// ── Etiquetas por tipo (solo texto — ya no por color) ─────────────────────────

const TIPO_LABEL: Record<string, string> = {
  cuotas_sin_interes:   "Sin interés",
  cuotas_con_interes:   "Con interés",
  reintegro:            "Reintegro",
  descuento_directo:    "Descuento",
  cuotas_con_descuento: "Cuotas + desc.",
  cuotas_con_reintegro: "Cuotas + reintegro",
};

// ── Helpers texto ─────────────────────────────────────────────────────────────

function getMain(promo: PromoVigente): string {
  switch (promo.tipoBeneficio) {
    case "cuotas_sin_interes":
    case "cuotas_con_interes":
    case "cuotas_con_descuento":
    case "cuotas_con_reintegro":
      return promo.cantidadCuotas ? `${promo.cantidadCuotas}` : "-";
    case "reintegro":
    case "descuento_directo":
      return promo.valorPorcentaje ? `${Number(promo.valorPorcentaje)}%` : "-";
    default: return "-";
  }
}

function getMainUnit(promo: PromoVigente): string {
  switch (promo.tipoBeneficio) {
    case "cuotas_sin_interes":
    case "cuotas_con_interes":
    case "cuotas_con_descuento":
    case "cuotas_con_reintegro":
      return "cuotas";
    default: return "";
  }
}

function getSub(promo: PromoVigente): string {
  switch (promo.tipoBeneficio) {
    case "cuotas_sin_interes":    return "sin interés";
    case "cuotas_con_interes":    return `coef. ${Number(promo.coeficienteInteres).toFixed(2)}`;
    case "reintegro":             return "de reintegro";
    case "descuento_directo":     return "de descuento";
    case "cuotas_con_descuento":  return `+ ${Number(promo.valorPorcentaje)}% desc.`;
    case "cuotas_con_reintegro":  return `+ ${Number(promo.valorPorcentaje)}% reintegro`;
    default: return "";
  }
}

// ── Agrupación por días ───────────────────────────────────────────────────────

function parseDias(j: string | null): string[] {
  if (!j) return [];
  try { return JSON.parse(j); } catch { return []; }
}

const DIA_ES: Record<string, string> = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miércoles",
  jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};
const DIAS_ORDER = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

function groupLabel(diasJson: string | null): string {
  const dias = parseDias(diasJson);
  if (dias.length === 0) return "TODOS LOS DÍAS";
  return dias.map((d) => DIA_ES[d] ?? d).join(" · ").toUpperCase();
}

interface Group { key: string; label: string; promos: PromoVigente[]; sortKey: number }

function groupByDias(promos: PromoVigente[]): Group[] {
  const map = new Map<string, PromoVigente[]>();
  for (const p of promos) {
    const k = p.diasAplicables ?? "null";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  }
  return [...map.entries()]
    .map(([key, promos]) => {
      const dias = parseDias(key === "null" ? null : key);
      const sortKey = key === "null" ? -1 : DIAS_ORDER.indexOf(dias[0] ?? "");
      return { key, label: groupLabel(key === "null" ? null : key), promos, sortKey };
    })
    .sort((a, b) => a.sortKey - b.sortKey);
}

// ── Fuentes ───────────────────────────────────────────────────────────────────

async function embedFonts(pdfDoc: PDFDocument) {
  pdfDoc.registerFontkit(fontkit);
  const base = path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files");
  const regular = await pdfDoc.embedFont(
    new Uint8Array(fs.readFileSync(path.join(base, "noto-sans-latin-400-normal.woff"))),
  );
  const bold = await pdfDoc.embedFont(
    new Uint8Array(fs.readFileSync(path.join(base, "noto-sans-latin-700-normal.woff"))),
  );
  return { regular, bold };
}

// ── Logos de banco ────────────────────────────────────────────────────────────

async function drawBankLogo(
  page: PDFPage,
  pdfDoc: PDFDocument,
  icono: string | null,
  cx: number,
  cy: number,
  size: number,
): Promise<void> {
  if (!icono) return;
  const entry = getBankIcon(icono);
  if (!entry) return;
  const x = cx - size / 2;
  const y = cy - size / 2;

  try {
    if (entry.svgPath) {
      const vbParts = (entry.viewBox ?? "0 0 24 24").split(" ").map(Number);
      const vw = vbParts[2] ?? 24;
      const vh = vbParts[3] ?? 24;
      const scale = size / Math.max(vw, vh);
      page.drawSvgPath(entry.svgPath, { x, y: y + size, scale, color: h(entry.color) });
    } else if (entry.svgSrc) {
      const filePath = path.join(process.cwd(), "public", entry.svgSrc);
      const buf = fs.readFileSync(filePath);
      if (entry.svgSrc.endsWith(".png")) {
        const img = await pdfDoc.embedPng(new Uint8Array(buf));
        page.drawImage(img, { x, y, width: size, height: size });
      } else {
        const svg = buf.toString("utf-8");
        const matches = [...svg.matchAll(/\sd="([^"]{20,})"/g)];
        const d = matches.sort((a, b) => b[1].length - a[1].length)[0]?.[1];
        const vbMatch = svg.match(/viewBox="([^"]+)"/);
        if (d) {
          const vbParts = (vbMatch ? vbMatch[1] : "0 0 24 24").split(" ").map(Number);
          const vw = vbParts[2] ?? 24;
          const vh = vbParts[3] ?? 24;
          const scale = size / Math.max(vw, vh);
          page.drawSvgPath(d, { x, y: y + size, scale, color: h(entry.color) });
        }
      }
    }
  } catch (err) {
    console.error(`[pdfPromociones] Logo "${icono}" falló:`, err);
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

async function drawHeader(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  todayStr: string,
) {
  // Fondo oscuro
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: C.headerBg });
  // Franja inferior — acento terracota
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: 4, color: C.accent });
  // Decoración derecha (más oscura, semi-transparente)
  page.drawRectangle({
    x: PAGE_W - 90, y: PAGE_H - HEADER_H,
    width: 90, height: HEADER_H,
    color: rgb(0, 0, 0), opacity: 0.3,
  });

  // Fondo de página
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H - HEADER_H, color: C.pageBg });

  // Logo empresa
  const logoSize = 54;
  const logoX = MARGIN;
  const logoY = PAGE_H - HEADER_H + (HEADER_H - logoSize) / 2;
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "CS.png"));
    const img = await pdfDoc.embedPng(new Uint8Array(buf));
    page.drawImage(img, { x: logoX, y: logoY, width: logoSize, height: logoSize });
  } catch (err) {
    console.error("[pdfPromociones] Logo CS.png falló:", err);
  }

  // Separador vertical entre logo y texto
  page.drawLine({
    start: { x: MARGIN + logoSize + 12, y: PAGE_H - HEADER_H + 16 },
    end:   { x: MARGIN + logoSize + 12, y: PAGE_H - 16 },
    thickness: 1,
    color: C.white,
    opacity: 0.15,
  });

  const textX = MARGIN + logoSize + 24;
  const titleY = PAGE_H - HEADER_H + (HEADER_H / 2) + 6;

  page.drawText("PROMOCIONES BANCARIAS", {
    x: textX, y: titleY,
    size: 20, font: fonts.bold, color: C.white,
  });

  const [yyyy, mm, dd] = todayStr.split("-");
  page.drawText(`Vigente hoy  ·  ${dd}/${mm}/${yyyy}`, {
    x: textX, y: titleY - 22,
    size: 10, font: fonts.regular, color: C.white, opacity: 0.42,
  });
}

// ── Label de sección ──────────────────────────────────────────────────────────

function drawSectionLabel(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  label: string,
  y: number,
  count: number,
) {
  const labelSize = 8;
  const textW = fonts.bold.widthOfTextAtSize(label, labelSize);

  // Texto del grupo
  page.drawText(label, {
    x: MARGIN, y: y + 3,
    size: labelSize, font: fonts.bold, color: C.text2,
  });

  // Línea horizontal
  const lineY = y + labelSize / 2 + 1;
  const countPillW = fonts.bold.widthOfTextAtSize(`${count}`, 7) + 10;
  page.drawLine({
    start: { x: MARGIN + textW + 8, y: lineY },
    end:   { x: PAGE_W - MARGIN - countPillW - 8, y: lineY },
    thickness: 0.75, color: C.sectionLine,
  });

  // Badge de conteo con acento
  const pillX = PAGE_W - MARGIN - countPillW;
  page.drawRectangle({
    x: pillX, y: y - 1,
    width: countPillW, height: 13,
    color: C.accent,
  });
  page.drawText(`${count}`, {
    x: pillX + 5, y: y + 3,
    size: 7, font: fonts.bold, color: C.white,
  });
}

// ── Card ──────────────────────────────────────────────────────────────────────

async function drawCard(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  promo: PromoVigente,
  topY: number,
) {
  const bottomY = topY - CARD_H;
  const tipoLabel = TIPO_LABEL[promo.tipoBeneficio] ?? promo.tipoBeneficio;

  // Sombra
  page.drawRectangle({
    x: MARGIN + 2, y: bottomY - 2,
    width: CONTENT_W, height: CARD_H,
    color: C.text3, opacity: 0.18,
  });

  // Fondo blanco
  page.drawRectangle({ x: MARGIN, y: bottomY, width: CONTENT_W, height: CARD_H, color: C.cardBg });

  // Franja izquierda — acento único
  page.drawRectangle({ x: MARGIN, y: bottomY, width: 5, height: CARD_H, color: C.accent });

  // Tinte de acento en el fondo
  page.drawRectangle({
    x: MARGIN + 5, y: bottomY,
    width: CONTENT_W - 5, height: CARD_H,
    color: C.accent, opacity: 0.03,
  });

  // ── Logos ────────────────────────────────────────────────────────────────
  const LOGO_SIZE = 32;
  const LOGO_OVERLAP = 10;
  const logoAreaX = MARGIN + 5 + 14;
  const logoCY = bottomY + CARD_H / 2 + 6;
  const visibles = promo.bancos.slice(0, 2);

  for (let i = 0; i < visibles.length; i++) {
    const cx = logoAreaX + LOGO_SIZE / 2 + i * (LOGO_SIZE - LOGO_OVERLAP);
    // Círculo blanco con borde sutil
    page.drawCircle({ x: cx, y: logoCY, size: LOGO_SIZE / 2 + 2, color: C.pageBg });
    page.drawCircle({ x: cx, y: logoCY, size: LOGO_SIZE / 2 + 2, color: C.cardBorder, opacity: 0.6 });
    await drawBankLogo(page, pdfDoc, visibles[i].icono, cx, logoCY, LOGO_SIZE);
  }

  // Nombre del banco bajo logos
  const bancoNames = promo.bancos.slice(0, 2).map((b) => b.nombre).join(" · ");
  const usedLogoW = visibles.length * (LOGO_SIZE - LOGO_OVERLAP) + LOGO_OVERLAP;
  if (bancoNames) {
    let txt = bancoNames;
    const maxW = usedLogoW + LOGO_SIZE;
    while (txt.length > 3 && fonts.regular.widthOfTextAtSize(txt, 7) > maxW) {
      txt = txt.slice(0, -3) + "…";
    }
    page.drawText(txt, {
      x: logoAreaX, y: bottomY + 7,
      size: 7, font: fonts.regular, color: C.text2,
    });
  }

  const contentX = logoAreaX + usedLogoW + 12;

  // ── Número principal ──────────────────────────────────────────────────────
  const mainNum  = getMain(promo);
  const mainUnit = getMainUnit(promo);
  const sub      = getSub(promo);

  const numSize = 28;
  const numW = fonts.bold.widthOfTextAtSize(mainNum, numSize);
  const numY = bottomY + CARD_H - 30;

  page.drawText(mainNum, {
    x: contentX, y: numY,
    size: numSize, font: fonts.bold, color: C.accent,
  });

  if (mainUnit) {
    page.drawText(mainUnit, {
      x: contentX + numW + 5, y: numY + 8,
      size: 9, font: fonts.bold, color: C.text1,
    });
  }

  if (sub) {
    page.drawText(sub, {
      x: contentX + numW + 5, y: numY - 4,
      size: 8, font: fonts.regular, color: C.text2,
    });
  }

  // Línea 2: tarjeta + tope
  const line2Parts: string[] = [];
  if (promo.marcaTarjeta) line2Parts.push(promo.marcaTarjeta);
  if (promo.topeReintegro) line2Parts.push(`Tope $${Number(promo.topeReintegro).toLocaleString("es-AR")}`);
  if (line2Parts.length > 0) {
    page.drawText(line2Parts.join("  ·  "), {
      x: contentX, y: numY - 19,
      size: 9, font: fonts.regular, color: C.text2,
    });
  }

  // Línea 3: descripción
  if (promo.descripcion) {
    const maxW = PAGE_W - MARGIN - contentX - 90;
    let desc = promo.descripcion;
    while (desc.length > 4 && fonts.regular.widthOfTextAtSize(desc, 8) > maxW) {
      desc = desc.slice(0, -4) + "...";
    }
    page.drawText(desc, {
      x: contentX, y: numY - 34,
      size: 8, font: fonts.regular, color: C.text2,
    });
  }

  // Badge tipo — mismo acento para todos
  const bLabel = tipoLabel;
  const bSize = 7;
  const bPadX = 5;
  const bPadY = 3;
  const bTextW = fonts.bold.widthOfTextAtSize(bLabel, bSize);
  const bW = bTextW + bPadX * 2;
  const bH = bSize + bPadY * 2;
  const bX = MARGIN + CONTENT_W - bW - 8;
  const bY = bottomY + CARD_H - bH - 6;

  page.drawRectangle({ x: bX, y: bY, width: bW, height: bH, color: C.accent });
  page.drawText(bLabel, {
    x: bX + bPadX, y: bY + bPadY,
    size: bSize, font: fonts.bold, color: C.white,
  });
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function generatePromosPDF(
  promos: PromoVigente[],
  todayStr: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts  = await embedFonts(pdfDoc);
  const groups = groupByDias(promos);

  let page    = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let cursorY = PAGE_H - HEADER_H - 16;

  await drawHeader(page, pdfDoc, fonts, todayStr);

  for (const group of groups) {
    const needed = SECTION_GAP + SECTION_H + SECTION_AFTER + CARD_H;
    if (cursorY - needed < MARGIN) {
      page    = pdfDoc.addPage([PAGE_W, PAGE_H]);
      page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: C.pageBg });
      cursorY = PAGE_H - MARGIN;
    }

    cursorY -= SECTION_GAP;
    drawSectionLabel(page, fonts, group.label, cursorY, group.promos.length);
    cursorY -= SECTION_H + SECTION_AFTER;

    for (const promo of group.promos) {
      if (cursorY - CARD_H < MARGIN) {
        page    = pdfDoc.addPage([PAGE_W, PAGE_H]);
        page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: C.pageBg });
        cursorY = PAGE_H - MARGIN;
      }
      await drawCard(page, pdfDoc, fonts, promo, cursorY);
      cursorY -= CARD_H + CARD_GAP;
    }
  }

  return pdfDoc.save();
}
