// Listado imprimible de cheques propios a debitar (Pago de cheques propios).
// Mismo diseño que los PDF de órdenes (src/lib/pdf.ts): bloque "CS", línea ámbar, tabla con encabezado ámbar.
import { fmt, totalesCheques, type ChequeEmitido } from "@/lib/tesoreria";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fechaAR = (f: string) => (f ? f.split("-").reverse().join("/") : "");

export function htmlChequesPropios({ banco, hoy, filtros, cheques }: {
  banco: string;
  hoy: string;
  filtros: string[];
  cheques: ChequeEmitido[];
}): string {
  const t = totalesCheques(cheques, hoy);
  const total = (label: string, v: number, cls = "") =>
    `<tr class="total ${cls}"><td colspan="3">${label}</td><td class="n">$ ${fmt(v)}</td></tr>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Cheques propios a debitar — ${esc(banco)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap">
<style>
  @page { size: A4 portrait; margin: 30pt; }
  * { box-sizing: border-box; }
  body { font: 9pt/1.3 "Noto Sans", Arial, sans-serif; color: #000; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; align-items: flex-start; gap: 10pt; padding-bottom: 7pt; border-bottom: 1pt solid #d97706; margin-bottom: 15pt; }
  .logo { width: 34pt; height: 28pt; background: #000; color: #fff; font-weight: 700; font-size: 16pt; display: flex; align-items: center; justify-content: center; flex: none; }
  h1 { font-size: 16pt; margin: 0; line-height: 1.1; }
  .muted { color: #666; font-size: 10pt; }
  .info { margin-left: auto; width: 260pt; }
  .info b { font-size: 10pt; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #d97706; color: #fff; font-size: 7pt; text-transform: uppercase; text-align: left; padding: 4pt; border: 0.5pt solid #d1cfcc; }
  td { padding: 2.5pt 4pt; border: 0.5pt solid #d1cfcc; }
  tbody tr:nth-child(even) td { background: #f7f6f5; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .total td { background: #e8e4e0; font-weight: 700; }
  .total.sub td { background: #fff; font-weight: 400; color: #666; }
  thead { display: table-header-group; }
  footer { margin-top: 10pt; font-size: 7pt; color: #999; }
</style></head>
<body>
<header>
  <div class="logo">CS</div>
  <div><h1>CHEQUES PROPIOS A DEBITAR</h1><div class="muted">${esc(banco)}</div></div>
  <div class="info"><b>Fecha contable: ${fechaAR(hoy)}</b>${filtros.length ? `<div class="muted">${filtros.map(esc).join(" · ")}</div>` : ""}</div>
</header>
<table>
  <thead><tr><th>Número</th><th>Proveedor</th><th>Fecha de pago</th><th class="n">Importe</th></tr></thead>
  <tbody>${cheques.map((c) => `<tr><td>${esc(c.numero)}</td><td>${esc(c.contacto)}</td><td>${fechaAR(c.fechaPago)}</td><td class="n">${fmt(c.importe)}</td></tr>`).join("")}</tbody>
  <tfoot>
    ${total(`TOTAL (${t.cantidad} cheques)`, t.total)}
    ${total(`Vencidos (al ${fechaAR(hoy)})`, t.vencidos, "sub")}
    ${total("Por vencer", t.porVencer, "sub")}
  </tfoot>
</table>
<footer>Generado el ${new Date().toLocaleString("es-AR")} — Casa Sonia</footer>
<script>document.fonts.ready.then(() => print());</script>
</body></html>`;
}
