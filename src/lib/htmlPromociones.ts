// src/lib/htmlPromociones.ts
import fs from "fs";
import path from "path";
import { getBankIcon } from "@/lib/bankIcons";

// ── Input types ───────────────────────────────────────────────────────────────

export interface PromoInput {
  kind: "promo";
  id: number;
  titulo: string;
  bancos: { id: number; nombre: string; icono: string | null }[];
  marcaTarjeta: string | null;
  tipoBeneficio: string;
  cantidadCuotas: number | null;
  coeficienteInteres: string | null;
  valorPorcentaje: string | null;
  topeReintegro: string | null;
  descripcion: string | null;
  diasAplicables: string | null;
}

export interface DescuentoInput {
  kind: "descuento";
  id: number;
  nombre: string | null;
  medioPago: { id: number; nombre: string };
  tipo: string;
  valor: string;
  alcance: string;
  categoriaOdooId: number | null;
  categoriaNombre: string | null;
}

export type PdfItemInput = PromoInput | DescuentoInput;

// ── Day label ─────────────────────────────────────────────────────────────────

const DIA_ES: Record<string, string> = {
  lunes: "lunes", martes: "martes", miercoles: "miércoles",
  jueves: "jueves", viernes: "viernes", sabado: "sábado", domingo: "domingo",
};
const DIAS_ORDER = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

function parseDias(j: string | null): string[] {
  if (!j) return [];
  try { return JSON.parse(j); } catch { return []; }
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function getDayLabel(diasJson: string | null): string {
  const dias = parseDias(diasJson);
  if (dias.length === 0 || dias.length === 7) return "Todos los días";
  if (dias.length === 1) return `Todos los ${DIA_ES[dias[0]] ?? dias[0]}s`;
  const indices = dias.map((d) => DIAS_ORDER.indexOf(d)).sort((a, b) => a - b);
  const consecutive = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
  if (consecutive) {
    const first = DIA_ES[DIAS_ORDER[indices[0]]] ?? DIAS_ORDER[indices[0]];
    const last  = DIA_ES[DIAS_ORDER[indices.at(-1)!]] ?? DIAS_ORDER[indices.at(-1)!];
    return `${cap(first)} a ${last}`;
  }
  if (dias.length === 2) {
    const [a, b] = dias.map((d) => DIA_ES[d] ?? d);
    return `${cap(a)} y ${b}`;
  }
  return dias.map((d) => cap(DIA_ES[d] ?? d)).join(" · ");
}

// ── Stat helpers ──────────────────────────────────────────────────────────────

function getPromoStat(p: PromoInput): string {
  switch (p.tipoBeneficio) {
    case "cuotas_sin_interes":
    case "cuotas_con_interes":
    case "cuotas_con_descuento":
    case "cuotas_con_reintegro":
      return p.cantidadCuotas ? `${p.cantidadCuotas}` : "-";
    case "reintegro":
    case "descuento_directo":
      return p.valorPorcentaje ? `${Number(p.valorPorcentaje)}%` : "-";
    default: return "-";
  }
}

function getPromoStatNote(p: PromoInput): string {
  switch (p.tipoBeneficio) {
    case "cuotas_sin_interes":   return "cuotas sin interés";
    case "cuotas_con_interes":   return `cuotas (coef. ${Number(p.coeficienteInteres).toFixed(2)})`;
    case "reintegro":            return "de reintegro";
    case "descuento_directo":    return "de descuento";
    case "cuotas_con_descuento": return `cuotas + ${Number(p.valorPorcentaje)}% desc.`;
    case "cuotas_con_reintegro": return `cuotas + ${Number(p.valorPorcentaje)}% reintegro`;
    default: return "";
  }
}

// ── Logo ──────────────────────────────────────────────────────────────────────

function getLogoDataUri(svgSrc: string): string | null {
  try {
    const absPath = path.join(process.cwd(), "public", svgSrc.replace(/^\//, ""));
    const data = fs.readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = ext === ".svg" ? "image/svg+xml" : ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(val: string | null): string {
  if (!val) return "";
  const n = Number(val);
  if (isNaN(n)) return val;
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Row data ──────────────────────────────────────────────────────────────────

interface RowData {
  dayLabel: string;
  bank: string;
  logoDataUri: string | null;
  logoHeight: number;
  stat: string;
  statNote: string;
  card: string;
  chips: string[];
  categoryTag: string | null;
}

function buildRowData(item: PdfItemInput): RowData {
  if (item.kind === "promo") {
    const p = item as PromoInput;
    const bankNames = p.bancos.map((b) => b.nombre).join(" · ");

    let logoDataUri: string | null = null;
    let logoHeight = 44;

    if (p.bancos.length === 1 && p.bancos[0].icono) {
      const icon = getBankIcon(p.bancos[0].icono);
      if (icon?.svgSrc) {
        logoDataUri = getLogoDataUri(icon.svgSrc);
        if (icon.scale && icon.scale > 1) logoHeight = Math.min(Math.round(44 * icon.scale), 68);
      }
    }

    const chips: string[] = [];
    if (p.topeReintegro) chips.push(`Tope $${formatCurrency(p.topeReintegro)}`);
    if (p.descripcion)   chips.push(p.descripcion);

    return {
      dayLabel: getDayLabel(p.diasAplicables),
      bank: bankNames,
      logoDataUri,
      logoHeight,
      stat: getPromoStat(p),
      statNote: getPromoStatNote(p),
      card: p.marcaTarjeta || "Todas",
      chips,
      categoryTag: null,
    };
  } else {
    const d = item as DescuentoInput;
    const stat = d.tipo === "porcentaje"
      ? `${Number(d.valor)}%`
      : `$${formatCurrency(d.valor)}`;
    const statNote = d.tipo === "porcentaje" ? "de descuento" : "descuento fijo";
    const categoryTag = d.alcance === "categoria" && d.categoriaNombre
      ? d.categoriaNombre.split(" / ").at(-1)!
      : null;
    return {
      dayLabel: "Todos los días",
      bank: d.medioPago.nombre,
      logoDataUri: null,
      logoHeight: 44,
      stat,
      statNote,
      card: d.alcance === "global" ? "Todas" : "Categoría",
      chips: [],
      categoryTag,
    };
  }
}

// ── Row HTML ──────────────────────────────────────────────────────────────────

function renderRow(row: RowData): string {
  const logoHtml = row.logoDataUri
    ? `<img src="${row.logoDataUri}" alt="${esc(row.bank)}" height="${row.logoHeight}" style="width:auto; max-width:148px; display:block; object-fit:contain; object-position:center; flex-shrink:0">`
    : `<span style="font-family:var(--font-body); font-weight:700; font-size:15px; line-height:1.2; letter-spacing:0; color:var(--color-accent-700); text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%">${esc(row.bank)}</span>`;

  // Tag de categoría: orejita superior amber, solo para descuentos por categoría
  const categoryTagHtml = row.categoryTag
    ? `<div style="position:absolute; top:-14px; right:var(--space-4); display:flex; z-index:2">
        <span style="display:inline-flex; align-items:center; gap:6px; padding:3px 11px 4px; border-radius:6px 6px 0 0; background:var(--color-accent-500); font-family:var(--font-body); font-weight:700; font-size:12px; letter-spacing:0.04em; color:var(--color-neutral-100); white-space:nowrap; box-shadow:var(--shadow-sm)">
          <span style="width:5px; height:5px; border-radius:999px; background:var(--color-neutral-100); opacity:0.7; flex:0 0 auto"></span>${esc(row.categoryTag)}
        </span>
      </div>`
    : "";

  // Orejitas: chips posicionados absolutamente colgando del borde inferior del card
  const chipsHtml = row.chips.length > 0
    ? `<div style="position:absolute; bottom:-15px; left:calc(162px + var(--space-8)); display:flex; flex-wrap:wrap; gap:var(--space-2); z-index:2">
        ${row.chips.map((chip) => `
          <span style="display:inline-flex; align-items:center; gap:7px; padding:4px 13px 5px; border-radius:999px; background:var(--color-accent-2-100); border:1px solid var(--color-accent-2-300); font-family:var(--font-body); font-weight:700; font-size:14px; letter-spacing:0.01em; color:var(--color-accent-2-800); white-space:nowrap; box-shadow:var(--shadow-sm)">
            <span style="width:6px; height:6px; border-radius:999px; background:var(--color-accent-2-600); flex:0 0 auto"></span>${esc(chip)}
          </span>`).join("")}
      </div>`
    : "";

  return `
  <div class="promo-row" style="display:flex; align-items:center; padding-left:var(--space-1)">

    <span style="display:flex; align-items:center; flex:0 0 152px; min-height:62px; margin-right:-26px; padding:10px 34px 11px 18px; border-radius:var(--radius-md); background:var(--color-accent-2-700); color:var(--color-neutral-100); box-shadow:var(--shadow-md); font-family:var(--font-body); font-weight:700; font-size:14px; line-height:1.2; letter-spacing:0.06em; text-transform:uppercase">${esc(row.dayLabel)}</span>

    <div style="position:relative; z-index:1; flex:1 1 auto; min-width:0; display:grid; grid-template-columns:162px minmax(0,1fr); align-items:center; gap:var(--space-3) var(--space-4); padding:var(--space-3) var(--space-4); background:var(--color-neutral-100); border-radius:var(--radius-lg); box-shadow:var(--shadow-md)">

      <span style="grid-row:1 / -1; display:flex; align-items:center; justify-content:center; min-height:56px; min-width:0">
        ${logoHtml}
      </span>

      <span style="display:flex; align-items:baseline; gap:var(--space-2); flex-wrap:wrap; min-width:0">
        <span style="font-family:var(--font-heading); font-size:36px; line-height:0.95; color:var(--color-accent-700); letter-spacing:-0.02em">${esc(row.stat)}</span>
        <span style="font-family:var(--font-body); font-weight:700; font-size:17px; line-height:1.2; color:var(--color-neutral-900)">${esc(row.statNote)}</span>
      </span>

      <!-- chip tipo tarjeta deshabilitado temporalmente -->

      ${categoryTagHtml}
      ${chipsHtml}
    </div>

  </div>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generatePromosHTML(items: PdfItemInput[], todayStr: string): string {
  const rows = items.map(buildRowData);
  const [yyyy, mm, dd] = todayStr.split("-");
  const dateShort = `${dd}/${mm}/${yyyy}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=794, initial-scale=1">
<title>Promociones bancarias — ${dateShort}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Figtree:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --color-bg: #f5ead8;
    --color-surface: #ebddc5;
    --color-text: #201e1d;
    --color-accent: #c67139;
    --color-accent-2: #7a8a5e;
    --color-divider: color-mix(in srgb, #201e1d 16%, transparent);
    --color-neutral-100: #f9f4ed;
    --color-neutral-200: #eee7db;
    --color-neutral-300: #dcd3c4;
    --color-neutral-400: #c0b6a5;
    --color-neutral-500: #a19786;
    --color-neutral-600: #82796a;
    --color-neutral-700: #645c50;
    --color-neutral-800: #474238;
    --color-neutral-900: #2e2b25;
    --color-accent-100: #fff2eb;
    --color-accent-200: #ffe1d0;
    --color-accent-300: #ffc6a5;
    --color-accent-400: #f6a06b;
    --color-accent-500: #d67f48;
    --color-accent-600: #b2622d;
    --color-accent-700: #8c491a;
    --color-accent-800: #643312;
    --color-accent-900: #402310;
    --color-accent-2-100: #f0fae1;
    --color-accent-2-200: #e1eecc;
    --color-accent-2-300: #ccdbb2;
    --color-accent-2-400: #aebf92;
    --color-accent-2-500: #8fa073;
    --color-accent-2-600: #728157;
    --color-accent-2-700: #56633f;
    --color-accent-2-800: #3d472b;
    --color-accent-2-900: #272e1b;
    --font-heading: "Caprasimo", system-ui, sans-serif;
    --font-heading-weight: 400;
    --font-body: "Figtree", system-ui, sans-serif;
    --space-1: 4.4px;
    --space-2: 8.8px;
    --space-3: 13.2px;
    --space-4: 17.6px;
    --space-6: 26.4px;
    --space-8: 35.2px;
    --radius-sm: 8px;
    --radius-md: 16px;
    --radius-lg: 28px;
    --shadow-sm: 0 1px 2px color-mix(in srgb, #2e2b25 14%, transparent);
    --shadow-md: 0 3px 10px color-mix(in srgb, #2e2b25 16%, transparent);
    --shadow-lg: 0 12px 32px color-mix(in srgb, #2e2b25 22%, transparent);
  }

  *, *::before, *::after {
    box-sizing: border-box;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  body {
    margin: 0;
    background: #e8ddd0;
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.55;
    color: var(--color-text);
  }

  .page {
    max-width: 794px;
    min-height: 1123px;
    margin: 32px auto;
    padding: 57.6px;
    background: var(--color-bg);
    box-shadow: 0 4px 32px rgba(0,0,0,0.18);
  }

  h1 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 52px;
    margin: 0;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  .promo-row { break-inside: avoid; }

  .print-btn {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 22px;
    border-radius: 999px;
    background: var(--color-accent-700);
    color: var(--color-neutral-100);
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.04em;
    border: none;
    cursor: pointer;
    box-shadow: var(--shadow-lg);
    transition: background 0.15s;
  }
  .print-btn:hover { background: var(--color-accent-800); }

  @page { size: A4; margin: 0; }
  @media print {
    html, body {
      width: 100%;
      margin: 0;
      padding: 0;
      background: var(--color-bg);
    }
    .page {
      width: 100%;
      max-width: none;
      min-height: auto;
      margin: 0;
      padding: 0.6in;
      box-shadow: none;
      background: var(--color-bg);
    }
    .print-btn { display: none; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div style="display:flex; align-items:flex-end; gap:var(--space-6); padding-top:var(--space-2); margin:0 0 var(--space-6)">
    <div style="flex:1 1 auto; min-width:0">
      <div style="font-family:var(--font-body); font-weight:700; font-size:15px; letter-spacing:0.14em; text-transform:uppercase; color:var(--color-accent-700); margin-bottom:var(--space-2)">Beneficios vigentes</div>
      <h1>Promociones<br>bancarias</h1>
    </div>
    <div style="flex:0 0 auto; display:flex; flex-direction:column; align-items:center; justify-content:center; width:112px; height:112px; border-radius:999px; background:var(--color-accent-700); color:var(--color-neutral-100); text-align:center">
      <div style="font-family:var(--font-heading); font-size:38px; line-height:1">${items.length}</div>
      <div style="font-family:var(--font-body); font-weight:700; font-size:14px; letter-spacing:0.1em; text-transform:uppercase">promos</div>
    </div>
  </div>

  <!-- Rows -->
  <div style="display:flex; flex-direction:column; gap:var(--space-6); margin:0 0 var(--space-6)">
    ${rows.map(renderRow).join("\n")}
  </div>

  <!-- Disclaimer box -->
  <div style="display:flex; gap:6px; align-items:center; padding:4px 8px; border-radius:6px; border:1px solid var(--color-neutral-300)">
    <span style="flex:0 0 auto; width:5px; height:5px; border-radius:999px; background:var(--color-accent-2-500)"></span>
    <p style="margin:0; font-size:8px; line-height:1; color:var(--color-neutral-600); white-space:nowrap">Los topes de reintegro y los montos mínimos son por operación y por tarjeta, salvo que se indique lo contrario. Consultá la vigencia de cada promoción antes de pagar.</p>
  </div>


</div>

<button class="print-btn" onclick="window.print()">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
  Imprimir PDF
</button>
</body>
</html>`;
}
