# PDF Promociones Bancarias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar botón "Generar PDF" a la pantalla de Promociones Bancarias que descarga un PDF A4 con las promos vigentes hoy, generado server-side con pdf-lib.

**Architecture:** Nuevo endpoint `GET /api/pdf-promociones` lee promos vigentes de la DB (reutilizando helpers extraídos de vigentes/route.ts), llama a `generatePromosPDF()` en `src/lib/pdfPromociones.ts`, y devuelve el binario. El cliente descarga el blob via URL.createObjectURL.

**Tech Stack:** pdf-lib + @pdf-lib/fontkit (ya instalados), Prisma, Next.js App Router route handlers, React useState.

**Spec:** `docs/superpowers/specs/2026-09-04-pdf-promociones-bancarias-design.md`

## Global Constraints

- Sin dependencias nuevas — pdf-lib y @pdf-lib/fontkit ya instalados
- Sin test framework — verificación manual descrita en cada tarea
- Font: Noto Sans desde `node_modules/@fontsource/noto-sans/files/` (igual que `src/lib/pdf.ts`)
- Logo empresa: `public/CS.png` vía `pdfDoc.embedPng()`
- Filename descargado: `promos-bancarias-DD-MM-YYYY.pdf` (timezone Buenos Aires)
- Auth: `withAuth` sin restricción de rol — cualquier empleado autenticado puede generar
- No hacer commit hasta que el usuario lo pida explícitamente

---

### Task 1: Extraer helpers de vigencia compartidos

Extraer `getTodayBuenosAires`, `isPromoVigenteHoy`, y `PROMO_SELECT` de `vigentes/route.ts` a un archivo compartido. El endpoint de PDF y el de vigentes los importarán desde ahí.

**Files:**
- Create: `src/lib/vigentesHelpers.ts`
- Modify: `src/app/api/config/vigentes/route.ts` (reemplazar definiciones locales por imports)

**Interfaces:**
- Produces:
  - `getTodayBuenosAires(): { todayStr: string; dayName: string }`
  - `isPromoVigenteHoy(promo: { activa: boolean; vigenciaDesde: Date; vigenciaHasta: Date | null; diasAplicables: string | null }, todayStr: string, todayName: string): boolean`
  - `PROMO_SELECT` — objeto Prisma select exportado como `const`

- [ ] **Step 1: Crear `src/lib/vigentesHelpers.ts`**

```typescript
// src/lib/vigentesHelpers.ts

export function getTodayBuenosAires(): { todayStr: string; dayName: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  const todayStr = `${y}-${m}-${d}`;
  const dayNames = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const dayName = dayNames[new Date(`${todayStr}T12:00:00Z`).getUTCDay()];
  return { todayStr, dayName };
}

function dateToStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function isPromoVigenteHoy(
  promo: {
    activa: boolean;
    vigenciaDesde: Date;
    vigenciaHasta: Date | null;
    diasAplicables: string | null;
  },
  todayStr: string,
  todayName: string,
): boolean {
  if (!promo.activa) return false;
  if (dateToStr(promo.vigenciaDesde) > todayStr) return false;
  if (promo.vigenciaHasta && dateToStr(promo.vigenciaHasta) < todayStr) return false;
  if (promo.diasAplicables) {
    const dias: string[] = JSON.parse(promo.diasAplicables);
    if (dias.length > 0 && !dias.includes(todayName)) return false;
  }
  return true;
}

export const PROMO_SELECT = {
  id: true,
  titulo: true,
  bancos: { select: { id: true, nombre: true, icono: true } },
  marcaTarjeta: true,
  tipoBeneficio: true,
  cantidadCuotas: true,
  coeficienteInteres: true,
  valorPorcentaje: true,
  topeReintegro: true,
  descripcion: true,
  diasAplicables: true,
  vigenciaDesde: true,
  vigenciaHasta: true,
  activa: true,
  orden: true,
} as const;
```

- [ ] **Step 2: Actualizar `src/app/api/config/vigentes/route.ts`**

Reemplazar las definiciones locales de `getTodayBuenosAires`, `dateToStr` (la función interna), `isPromoVigenteHoy`, `isPromoProxima`, y `PROMO_SELECT` con imports desde vigentesHelpers. La función `isPromoProxima` no se necesita en vigentesHelpers porque solo la usa vigentes/route.ts — dejarla inline ahí.

El archivo debe quedar así al inicio:

```typescript
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { getTodayBuenosAires, isPromoVigenteHoy, PROMO_SELECT } from "@/lib/vigentesHelpers";

function isPromoProxima(
  promo: { activa: boolean; vigenciaDesde: Date },
  todayStr: string,
): boolean {
  return promo.activa && promo.vigenciaDesde.toISOString().split("T")[0] > todayStr;
}

export const GET = withAuth(async () => {
  const { todayStr, dayName: todayName } = getTodayBuenosAires();
  // ... resto igual
```

- [ ] **Step 3: Verificar que el endpoint `/api/config/vigentes` sigue funcionando**

Arrancar `pnpm dev` y navegar a `/promociones-vigentes`. Las promos deben cargar correctamente. Si hay error de TypeScript, ejecutar `pnpm lint` para ver el detalle.

---

### Task 2: Función de generación del PDF

Crear `src/lib/pdfPromociones.ts` con la función `generatePromosPDF(promos, todayStr)` que produce el PDF A4 con el diseño especificado.

**Files:**
- Create: `src/lib/pdfPromociones.ts`

**Interfaces:**
- Consumes: `PromoVigente` de `@/lib/configPricing`, `getBankIcon` de `@/lib/bankIcons`
- Produces: `generatePromosPDF(promos: PromoVigente[], todayStr: string): Promise<Uint8Array>`

- [ ] **Step 1: Crear `src/lib/pdfPromociones.ts`**

```typescript
// src/lib/pdfPromociones.ts
import { PDFDocument, PDFPage, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { getBankIcon } from "@/lib/bankIcons";
import type { PromoVigente } from "@/lib/configPricing";

// ── Constantes de layout ──────────────────────────────────────────────────────

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;

const TOP_BAR_H = 8;
const HEADER_H = 72;          // alto del área de header (sin barra)
const SECTION_GAP = 20;       // espacio antes de cada sección
const SECTION_LABEL_H = 18;   // alto del label de sección
const SECTION_AFTER = 10;     // espacio tras el label antes de cards
const CARD_H = 60;
const CARD_GAP = 8;

// ── Paleta ────────────────────────────────────────────────────────────────────

const C = {
  indigo:    rgb(0.388, 0.4,   0.945),  // #6366F1
  indigoBg:  rgb(0.878, 0.886, 1.0),    // #E0E7FF
  black:     rgb(0.067, 0.094, 0.153),  // #111827
  gray:      rgb(0.42,  0.447, 0.502),  // #6B7280
  white:     rgb(1,     1,     1),
  cardBg:    rgb(0.992, 0.992, 0.992),  // #FDFDFD
  cardBorder:rgb(0.9,   0.9,   0.9),
};

const BADGE_COLORS: Record<string, ReturnType<typeof rgb>> = {
  cuotas_sin_interes:   rgb(0.022, 0.584, 0.412),  // #059669
  reintegro:            rgb(0.145, 0.392, 0.922),  // #2563EB
  descuento_directo:    rgb(0.486, 0.231, 0.929),  // #7C3AED
  cuotas_con_interes:   rgb(0.851, 0.604, 0.024),  // #D97706
  cuotas_con_descuento: rgb(0.859, 0.153, 0.467),  // #DB2777
  cuotas_con_reintegro: rgb(0.035, 0.569, 0.698),  // #0891B2
};

const BADGE_LABELS: Record<string, string> = {
  cuotas_sin_interes:   "Sin interés",
  reintegro:            "Reintegro",
  descuento_directo:    "Descuento",
  cuotas_con_interes:   "Con interés",
  cuotas_con_descuento: "Cuotas + desc.",
  cuotas_con_reintegro: "Cuotas + reintegro",
};

// ── Helpers de texto ──────────────────────────────────────────────────────────

function getBeneficioMain(promo: PromoVigente): string {
  switch (promo.tipoBeneficio) {
    case "cuotas_sin_interes":
    case "cuotas_con_interes":
    case "cuotas_con_descuento":
    case "cuotas_con_reintegro":
      return promo.cantidadCuotas ? `${promo.cantidadCuotas} cuotas` : "-";
    case "reintegro":
    case "descuento_directo":
      return promo.valorPorcentaje ? `${Number(promo.valorPorcentaje)}%` : "-";
    default:
      return "-";
  }
}

function getBeneficioSub(promo: PromoVigente): string {
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

// ── Helpers de agrupación por días ────────────────────────────────────────────

function parseDias(diasJson: string | null): string[] {
  if (!diasJson) return [];
  try { return JSON.parse(diasJson); } catch { return []; }
}

const DIA_LABEL: Record<string, string> = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miércoles",
  jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
};

const DIAS_ORDER = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

function diasGroupLabel(diasJson: string | null): string {
  const dias = parseDias(diasJson);
  if (dias.length === 0) return "TODOS LOS DÍAS";
  return dias.map((d) => DIA_LABEL[d] ?? d).join(" · ").toUpperCase();
}

interface PromoGroup {
  key: string;
  label: string;
  promos: PromoVigente[];
}

function groupByDias(promos: PromoVigente[]): PromoGroup[] {
  const map = new Map<string, PromoVigente[]>();
  for (const p of promos) {
    const key = p.diasAplicables ?? "null";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }

  const groups: (PromoGroup & { sortKey: number })[] = [...map.entries()].map(([key, promos]) => {
    const dias = parseDias(key === "null" ? null : key);
    const sortKey = key === "null" ? -1 : DIAS_ORDER.indexOf(dias[0] ?? "");
    return { key, label: diasGroupLabel(key === "null" ? null : key), promos, sortKey };
  });

  groups.sort((a, b) => a.sortKey - b.sortKey);
  return groups;
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

// ── Logo de banco ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

async function drawBankLogo(
  page: PDFPage,
  pdfDoc: PDFDocument,
  icono: string | null,
  x: number,
  y: number,      // y = bottom-left en coordenadas pdf-lib
  size: number,
): Promise<void> {
  if (!icono) return;
  const entry = getBankIcon(icono);
  if (!entry) return;

  try {
    if (entry.svgPath) {
      // Inline SVG path — drawSvgPath espera (x, y) como top-left del bounding box
      const viewBox = entry.viewBox ?? "0 0 24 24";
      const parts = viewBox.split(" ").map(Number);
      const vw = parts[2] ?? 24;
      const vh = parts[3] ?? 24;
      const scale = size / Math.max(vw, vh);
      page.drawSvgPath(entry.svgPath, {
        x,
        y: y + size, // pdf-lib: y es el top del path en coord PDF (bottom-left origin)
        scale,
        color: hexToRgb(entry.color),
      });
    } else if (entry.svgSrc) {
      const filePath = path.join(process.cwd(), "public", entry.svgSrc);
      const fileBuffer = fs.readFileSync(filePath);

      if (entry.svgSrc.endsWith(".png")) {
        const image = await pdfDoc.embedPng(new Uint8Array(fileBuffer));
        page.drawImage(image, { x, y, width: size, height: size });
      } else {
        // SVG externo — extraer el primer path d=""
        const svgContent = fileBuffer.toString("utf-8");
        const dMatch = svgContent.match(/\sd="([^"]+)"/);
        const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
        if (dMatch) {
          const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 24 24";
          const parts = viewBox.split(" ").map(Number);
          const vw = parts[2] ?? 24;
          const vh = parts[3] ?? 24;
          const scale = size / Math.max(vw, vh);
          page.drawSvgPath(dMatch[1], {
            x,
            y: y + size,
            scale,
            color: hexToRgb(entry.color),
          });
        }
      }
    }
  } catch (err) {
    // ponytail: fallback de logo decidido durante desarrollo — loguear y continuar
    console.error(`[pdfPromociones] Logo render failed for "${icono}":`, err);
  }
}

// ── Dibujo del header ─────────────────────────────────────────────────────────

function drawHeader(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  logoImage: Awaited<ReturnType<PDFDocument["embedPng"]>>,
  todayStr: string,
) {
  // Barra indigo top
  page.drawRectangle({
    x: 0,
    y: PAGE_H - TOP_BAR_H,
    width: PAGE_W,
    height: TOP_BAR_H,
    color: C.indigo,
  });

  // Logo empresa
  const logoSize = 44;
  const logoY = PAGE_H - TOP_BAR_H - MARGIN / 2 - logoSize;
  page.drawImage(logoImage, {
    x: MARGIN,
    y: logoY,
    width: logoSize,
    height: logoSize,
  });

  // Título y fecha
  const textX = MARGIN + logoSize + 14;
  const titleY = logoY + logoSize - 18;

  page.drawText("PROMOCIONES BANCARIAS", {
    x: textX,
    y: titleY,
    size: 18,
    font: fonts.bold,
    color: C.black,
  });

  const [yyyy, mm, dd] = todayStr.split("-");
  page.drawText(`Vigente: ${dd}/${mm}/${yyyy}`, {
    x: textX,
    y: titleY - 20,
    size: 10,
    font: fonts.regular,
    color: C.gray,
  });
}

// ── Dibujo de label de sección ────────────────────────────────────────────────

function drawSectionLabel(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  label: string,
  y: number,
) {
  page.drawText(label, {
    x: MARGIN,
    y,
    size: 9,
    font: fonts.bold,
    color: C.indigo,
  });

  const textWidth = fonts.bold.widthOfTextAtSize(label, 9);
  page.drawLine({
    start: { x: MARGIN + textWidth + 8, y: y + 4 },
    end:   { x: PAGE_W - MARGIN,         y: y + 4 },
    thickness: 0.5,
    color: C.indigoBg,
  });
}

// ── Dibujo de card de promoción ───────────────────────────────────────────────

async function drawPromoCard(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  promo: PromoVigente,
  cardTopY: number,   // y del borde superior de la card (coordenada PDF)
) {
  const cardBottomY = cardTopY - CARD_H;
  const badgeColor = BADGE_COLORS[promo.tipoBeneficio] ?? C.gray;

  // Fondo de card
  page.drawRectangle({
    x: MARGIN,
    y: cardBottomY,
    width: CONTENT_W,
    height: CARD_H,
    color: C.cardBg,
    borderColor: C.cardBorder,
    borderWidth: 0.5,
  });

  // Borde izquierdo coloreado
  page.drawRectangle({
    x: MARGIN,
    y: cardBottomY,
    width: 4,
    height: CARD_H,
    color: badgeColor,
  });

  // Logos de bancos (hasta 2)
  const LOGO_SIZE = 28;
  const LOGO_OVERLAP = 8;
  const logoStartX = MARGIN + 4 + 10;
  const logoY = cardBottomY + (CARD_H - LOGO_SIZE) / 2;

  const visibleBancos = promo.bancos.slice(0, 2);
  for (let i = 0; i < visibleBancos.length; i++) {
    await drawBankLogo(
      page,
      pdfDoc,
      visibleBancos[i].icono,
      logoStartX + i * (LOGO_SIZE - LOGO_OVERLAP),
      logoY,
      LOGO_SIZE,
    );
  }

  // Área de texto
  const contentX = logoStartX + visibleBancos.length * (LOGO_SIZE - LOGO_OVERLAP) + 14;
  const line1Y = cardBottomY + CARD_H - 18;
  const line2Y = line1Y - 16;
  const line3Y = line2Y - 13;

  // Línea 1: beneficio principal + sub
  const mainText = getBeneficioMain(promo);
  const subText  = getBeneficioSub(promo);

  page.drawText(mainText, {
    x: contentX,
    y: line1Y,
    size: 12,
    font: fonts.bold,
    color: C.black,
  });

  if (subText) {
    const mainW = fonts.bold.widthOfTextAtSize(mainText, 12);
    page.drawText(`  ${subText}`, {
      x: contentX + mainW,
      y: line1Y,
      size: 9,
      font: fonts.regular,
      color: C.gray,
    });
  }

  // Badge tipo (esquina superior derecha de la card)
  const badgeLabel = BADGE_LABELS[promo.tipoBeneficio] ?? promo.tipoBeneficio;
  const badgeFontSize = 7;
  const badgePadX = 5;
  const badgePadY = 3;
  const badgeTextW = fonts.bold.widthOfTextAtSize(badgeLabel, badgeFontSize);
  const badgeW = badgeTextW + badgePadX * 2;
  const badgeH = badgeFontSize + badgePadY * 2;
  const badgeX = MARGIN + CONTENT_W - badgeW - 6;
  const badgeY = cardBottomY + CARD_H - badgeH - 5;

  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeW,
    height: badgeH,
    color: badgeColor,
    borderRadius: 2,
  });
  page.drawText(badgeLabel, {
    x: badgeX + badgePadX,
    y: badgeY + badgePadY,
    size: badgeFontSize,
    font: fonts.bold,
    color: C.white,
  });

  // Línea 2: marcaTarjeta · tope (solo si existen)
  const line2Parts: string[] = [];
  if (promo.marcaTarjeta) line2Parts.push(promo.marcaTarjeta);
  if (promo.topeReintegro) {
    line2Parts.push(`Tope $${Number(promo.topeReintegro).toLocaleString("es-AR")}`);
  }
  if (line2Parts.length > 0) {
    page.drawText(line2Parts.join(" · "), {
      x: contentX,
      y: line2Y,
      size: 9,
      font: fonts.regular,
      color: C.gray,
    });
  }

  // Línea 3: descripcion truncada
  if (promo.descripcion) {
    const maxW = MARGIN + CONTENT_W - contentX - badgeW - 12;
    let desc = promo.descripcion;
    while (desc.length > 4 && fonts.regular.widthOfTextAtSize(desc, 8) > maxW) {
      desc = desc.slice(0, -4) + "...";
    }
    page.drawText(desc, {
      x: contentX,
      y: line3Y,
      size: 8,
      font: fonts.regular,
      color: C.gray,
    });
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function generatePromosPDF(
  promos: PromoVigente[],
  todayStr: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts  = await embedFonts(pdfDoc);

  const logoBuffer = fs.readFileSync(path.join(process.cwd(), "public", "CS.png"));
  const logoImage  = await pdfDoc.embedPng(new Uint8Array(logoBuffer));

  const groups = groupByDias(promos);

  let page    = pdfDoc.addPage([PAGE_W, PAGE_H]);
  // Cursor y: empieza debajo del header en la primera página
  let cursorY = PAGE_H - TOP_BAR_H - MARGIN / 2 - HEADER_H - 8;

  drawHeader(page, fonts, logoImage, todayStr);

  for (const group of groups) {
    // Espacio para sección label + al menos una card
    const neededForSection = SECTION_GAP + SECTION_LABEL_H + SECTION_AFTER + CARD_H;
    if (cursorY - neededForSection < MARGIN) {
      page    = pdfDoc.addPage([PAGE_W, PAGE_H]);
      cursorY = PAGE_H - MARGIN;
    }

    cursorY -= SECTION_GAP;
    drawSectionLabel(page, fonts, group.label, cursorY);
    cursorY -= SECTION_LABEL_H + SECTION_AFTER;

    for (const promo of group.promos) {
      if (cursorY - CARD_H < MARGIN) {
        page    = pdfDoc.addPage([PAGE_W, PAGE_H]);
        cursorY = PAGE_H - MARGIN;
      }
      await drawPromoCard(page, pdfDoc, fonts, promo, cursorY);
      cursorY -= CARD_H + CARD_GAP;
    }
  }

  return pdfDoc.save();
}
```

- [ ] **Step 2: Verificar que no hay errores de TypeScript**

```bash
cd casa-sonia-compras && pnpm lint
```

Esperado: sin errores en `src/lib/pdfPromociones.ts`.

---

### Task 3: Endpoint GET /api/pdf-promociones

Crear el route handler que consulta las promos vigentes y llama a `generatePromosPDF`.

**Files:**
- Create: `src/app/api/pdf-promociones/route.ts`

**Interfaces:**
- Consumes: `getTodayBuenosAires`, `isPromoVigenteHoy`, `PROMO_SELECT` de `@/lib/vigentesHelpers`
- Consumes: `generatePromosPDF` de `@/lib/pdfPromociones`
- Produces: `GET /api/pdf-promociones` → 200 `application/pdf` | 400 `{ error: "sin_promos" }` | 500 `{ error: "generation_failed" }`

- [ ] **Step 1: Crear el directorio y el route handler**

```typescript
// src/app/api/pdf-promociones/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { getTodayBuenosAires, isPromoVigenteHoy, PROMO_SELECT } from "@/lib/vigentesHelpers";
import { generatePromosPDF } from "@/lib/pdfPromociones";

export const GET = withAuth(async () => {
  try {
    const { todayStr, dayName } = getTodayBuenosAires();

    const todasPromos = await prisma.promocionBancaria.findMany({
      select: PROMO_SELECT,
      orderBy: [{ orden: "asc" }, { vigenciaDesde: "asc" }],
    });

    const promosHoy = todasPromos.filter((p) => isPromoVigenteHoy(p, todayStr, dayName));

    if (promosHoy.length === 0) {
      return NextResponse.json({ error: "sin_promos" }, { status: 400 });
    }

    // Serializar Decimal → string/number y Date → ISO string (igual que vigentes/route.ts)
    const promos = promosHoy.map((p) => ({
      ...p,
      vigenciaDesde:       p.vigenciaDesde.toISOString(),
      vigenciaHasta:       p.vigenciaHasta?.toISOString() ?? null,
      coeficienteInteres:  p.coeficienteInteres?.toString() ?? null,
      valorPorcentaje:     p.valorPorcentaje?.toString()    ?? null,
      topeReintegro:       p.topeReintegro?.toString()      ?? null,
    }));

    const pdfBytes = await generatePromosPDF(promos, todayStr);

    // Filename: promos-bancarias-DD-MM-YYYY.pdf
    const [yyyy, mm, dd] = todayStr.split("-");
    const filename = `promos-bancarias-${dd}-${mm}-${yyyy}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[pdf-promociones] Error al generar PDF:", new Date().toISOString(), err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
});
```

- [ ] **Step 2: Probar el endpoint directamente**

Con `pnpm dev` corriendo, abrir el browser autenticado como cualquier empleado y navegar a:

```
http://localhost:3000/api/pdf-promociones
```

Esperado: el browser descarga `promos-bancarias-DD-MM-YYYY.pdf`. Abrirlo y verificar que:
- El header tiene barra indigo + logo + título + fecha
- Las secciones de días aparecen correctamente
- Los logos de bancos se renderizan (o aparece el log de error en consola si alguno falla)
- Las cards muestran beneficio, badge, marcaTarjeta/tope/descripción donde corresponde

Si hay error 500, revisar la consola del servidor para el detalle.

---

### Task 4: Botón "Generar PDF" en la pantalla de Promociones

Agregar el botón al header de la página `/promociones-vigentes` con estados de loading y error.

**Files:**
- Modify: `src/app/(app)/promociones-vigentes/page.tsx`

**Interfaces:**
- Consumes: `GET /api/pdf-promociones` (endpoint creado en Task 3)
- El botón se deshabilita cuando `config.promos.hoy.length === 0`

- [ ] **Step 1: Agregar imports al inicio del archivo**

Agregar al bloque de imports existente en `page.tsx`:

```typescript
import { FileDown, Loader2 } from "lucide-react";
import { notifications } from "@mantine/notifications";
```

- [ ] **Step 2: Agregar estado y función de descarga en el componente `PromocionesVigentesPage`**

Dentro del cuerpo de `PromocionesVigentesPage`, después de la línea `const [selectedDay, setSelectedDay] = useState<string>(today);`:

```typescript
const [pdfLoading, setPdfLoading] = useState(false);

async function handleGenerarPDF() {
  if (pdfLoading) return;
  setPdfLoading(true);
  try {
    const res = await fetch("/api/pdf-promociones");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.error === "sin_promos") {
        notifications.show({
          color: "yellow",
          message: "No hay promociones vigentes hoy.",
        });
      } else {
        notifications.show({
          color: "red",
          message: "Error al generar el PDF. Intentá de nuevo.",
        });
      }
      return;
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const cd   = res.headers.get("Content-Disposition") ?? "";
    const fnMatch = cd.match(/filename="([^"]+)"/);
    a.href     = url;
    a.download = fnMatch?.[1] ?? "promos-bancarias.pdf";
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    notifications.show({
      color: "red",
      message: "Error al generar el PDF. Intentá de nuevo.",
    });
  } finally {
    setPdfLoading(false);
  }
}
```

- [ ] **Step 3: Agregar el botón al JSX**

Reemplazar el `<p>` del título de la página para agregar el botón al lado. Buscar este bloque en el JSX:

```tsx
      <p
        style={{
          margin: 0,
          marginBottom: 24,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "var(--font-display)",
          color: "var(--text1)",
        }}
      >
        Promociones bancarias
      </p>
```

Reemplazarlo por:

```tsx
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            color: "var(--text1)",
          }}
        >
          Promociones bancarias
        </p>

        <button
          onClick={handleGenerarPDF}
          disabled={pdfLoading || !config || config.promos.hoy.length === 0}
          title={
            !config || config.promos.hoy.length === 0
              ? "No hay promociones vigentes hoy"
              : "Generar PDF para imprimir"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #6366F1",
            background: pdfLoading || !config || config.promos.hoy.length === 0
              ? "transparent"
              : "#6366F1",
            color: pdfLoading || !config || config.promos.hoy.length === 0
              ? "#6B7280"
              : "#ffffff",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "var(--font-sans)",
            cursor: pdfLoading || !config || config.promos.hoy.length === 0
              ? "not-allowed"
              : "pointer",
            opacity: !config || config.promos.hoy.length === 0 ? 0.5 : 1,
            transition: "opacity 0.15s, background 0.15s",
          }}
        >
          {pdfLoading
            ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
            : <FileDown size={15} />}
          {pdfLoading ? "Generando..." : "Generar PDF"}
        </button>
      </div>
```

- [ ] **Step 4: Verificar en browser**

1. Navegar a `/promociones-vigentes` con `pnpm dev` corriendo.
2. Si hay promos vigentes hoy: el botón debe estar activo en indigo. Hacer click. Debe aparecer spinner "Generando..." y luego descargar el PDF.
3. Abrir el PDF descargado: verificar diseño, logos, cards.
4. Si no hay promos vigentes: el botón debe estar gris/deshabilitado.
5. Verificar que el nombre del archivo es `promos-bancarias-DD-MM-YYYY.pdf` con fecha de hoy.

- [ ] **Step 5: Ajustes de logos si es necesario**

Si algún logo de banco no se renderiza bien en el PDF (posición incorrecta, escala mal, color equivocado), ajustar los parámetros en `drawBankLogo()` en `pdfPromociones.ts`. Los casos más probables:

- **SVG path con viewBox distinto a "0 0 24 24"** (macro, naranjax, bbva tienen viewBox grandes) — la escala se calcula sobre `Math.max(vw, vh)` que debería ser correcto, pero el offset `y: y + size` puede necesitar ajuste si el path tiene coordenadas que no empiezan en 0,0.
- **SVG files externos** (santander, provincia, nacion, mercadopago, credicoop) — el regex extrae solo el primer `<path>`. Si el SVG usa múltiples paths o un `<g>` wrapper, el logo puede verse incompleto. En ese caso, probar con el segundo match o ajustar el regex a `/<path[^>]*\sd="([^"]{20,})"/g` para obtener el path más largo.
- **PNG files** (santafe, bica) — estos deberían funcionar correctamente sin ajustes.
