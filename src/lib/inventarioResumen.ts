import type { InventoryArticle } from "@/types";
import type { SummaryCategory } from "@/app/api/inventario/[id]/summary-data/route";

/** Umbrales de las advertencias previas a confirmar (no bloqueantes). */
export const UMBRAL_DIF_CATEGORIA = 10; // unidades netas
export const UMBRAL_DIF_VARIANTE = 0.1; // 10% del stock en Odoo

/** Ruta de la categoría en segmentos ("Hombres", "Remeras", "Remeras MC"). */
export function rutaCategoria(c: SummaryCategory): string[] {
  if (c.categoryCompleteName) return c.categoryCompleteName.split(" / ");
  return c.categoryParentName ? [c.categoryParentName, c.categoryName] : [c.categoryName];
}

/** Árbol de hasta 3 niveles: [nivel 1, nivel 2 (intermedios unidos), hoja]. Vacíos si la ruta es más corta. */
export function nivelesCategoria(c: SummaryCategory): { n1: string; n2: string } {
  const r = rutaCategoria(c);
  if (r.length <= 1) return { n1: "", n2: "" };
  if (r.length === 2) return { n1: r[0], n2: "" };
  return { n1: r[0], n2: r.slice(1, -1).join(" / ") };
}

function contados(articles: InventoryArticle[]): Map<number, number> {
  // Mismo criterio que el confirm: lo contado se identifica por variante, sin importar la categoría guardada.
  const m = new Map<number, number>();
  for (const a of articles) m.set(a.varianteId, (m.get(a.varianteId) ?? 0) + a.qty);
  return m;
}

/** Diferencia de una variante: contado - stock; no contada → -stock si se lleva a cero, si no 0. */
function diferencia(
  varianteId: number,
  qtyOnHand: number,
  cont: Map<number, number>,
  zeroUncounted: boolean,
): number | null {
  const q = cont.get(varianteId);
  if (q !== undefined) return q - qtyOnHand;
  return zeroUncounted ? -qtyOnHand : null;
}

export interface ImpactoCategoria {
  ruta: string;
  variantes: number;
  unidades: number;
}

/** Variantes no contadas con stock que pasarían a 0, por categoría. */
export function calcularImpactoLlevarACero(
  categorias: SummaryCategory[],
  articles: InventoryArticle[],
): ImpactoCategoria[] {
  const cont = contados(articles);
  const out: ImpactoCategoria[] = [];
  for (const c of categorias) {
    const afectadas = c.products.filter((p) => !cont.has(p.varianteId) && p.qtyOnHand > 0);
    if (afectadas.length === 0) continue;
    out.push({
      ruta: rutaCategoria(c).join(" / "),
      variantes: afectadas.length,
      unidades: afectadas.reduce((s, p) => s + p.qtyOnHand, 0),
    });
  }
  return out.sort((a, b) => a.ruta.localeCompare(b.ruta, "es"));
}

export interface AdvertenciaCategoria {
  ruta: string;
  diferencia: number;
}

export interface AdvertenciaVariante {
  ruta: string;
  nombre: string;
  stock: number;
  contado: number;
  diferencia: number;
}

export interface Advertencias {
  categorias: AdvertenciaCategoria[];
  variantes: AdvertenciaVariante[];
}

/**
 * Categorías con diferencia neta > 10 unidades y variantes con diferencia > 10% de su stock en Odoo.
 * Variantes con stock ≤ 0 no se evalúan; las no contadas entran solo si se lleva a cero.
 */
export function calcularAdvertencias(
  categorias: SummaryCategory[],
  articles: InventoryArticle[],
  zeroUncounted: boolean,
): Advertencias {
  const cont = contados(articles);
  const res: Advertencias = { categorias: [], variantes: [] };
  for (const c of categorias) {
    const ruta = rutaCategoria(c).join(" / ");
    let neta = 0;
    for (const p of c.products) {
      const d = diferencia(p.varianteId, p.qtyOnHand, cont, zeroUncounted);
      if (d === null) continue;
      neta += d;
      if (p.qtyOnHand > 0 && Math.abs(d) / p.qtyOnHand > UMBRAL_DIF_VARIANTE) {
        res.variantes.push({ ruta, nombre: p.name, stock: p.qtyOnHand, contado: p.qtyOnHand + d, diferencia: d });
      }
    }
    if (Math.abs(neta) > UMBRAL_DIF_CATEGORIA) res.categorias.push({ ruta, diferencia: neta });
  }
  return res;
}
