/**
 * Utilidades de cálculo de precios para promociones y descuentos especiales.
 * Todo cálculo es de presentación — nunca se escribe en Odoo.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CategoriaFlat {
  id: number;
  parentId: number | null;
}

export interface DescuentoVigente {
  id: number;
  medioPagoId: number;
  medioPago: { id: number; nombre: string };
  tipo: string; // "porcentaje" | "monto_fijo"
  valor: string | number; // Prisma Decimal serializa a string
  alcance: string; // "global" | "categoria"
  categoriaOdooId: number | null;
}

export interface PromoVigente {
  id: number;
  titulo: string;
  bancos: { id: number; nombre: string; icono: string | null }[];
  marcaTarjeta: string | null;
  tipoBeneficio: string; // "cuotas_sin_interes" | "cuotas_con_interes" | "reintegro" | "descuento_directo"
  cantidadCuotas: number | null;
  coeficienteInteres: string | number | null;
  valorPorcentaje: string | number | null;
  topeReintegro: string | number | null;
  diasAplicables: string | null; // JSON: '["lunes","martes"]' — null = todos
  vigenciaDesde: string;
  vigenciaHasta: string | null;
  orden: number | null;
}

export interface PrecioMedioPago {
  medioPagoId: number;
  medioPagoNombre: string;
  precio: number; // precio calculado, redondeado a la decena
}

export type PromoCalculo =
  | { tipo: "cuotas"; cuotas: number; cuotaMonto: number; total: number }
  | { tipo: "reintegro_descuento"; precioFinal: number; reintegro: number };

// ---------------------------------------------------------------------------
// Redondeo a la decena
// ---------------------------------------------------------------------------

/** 1553 → 1550, 1558 → 1560 */
export function redondearDecena(n: number): number {
  return Math.round(n / 10) * 10;
}

// ---------------------------------------------------------------------------
// Cadena de ancestros
// ---------------------------------------------------------------------------

/**
 * Construye el array de IDs de categorías desde la hoja hasta la raíz.
 * Ej.: categ "Zapatillas hombre" (id=5, parent=3 "Ropa hombre", parent=1 "Todo Ropa")
 *   → [5, 3, 1]
 */
export function buildAncestorChain(
  categId: number,
  categorias: CategoriaFlat[],
): number[] {
  const byId = new Map<number, CategoriaFlat>();
  for (const c of categorias) byId.set(c.id, c);

  const chain: number[] = [];
  let current: number | null = categId;
  const visited = new Set<number>();

  while (current !== null) {
    if (visited.has(current)) break; // protección contra ciclos
    visited.add(current);
    chain.push(current);
    const node = byId.get(current);
    current = node?.parentId ?? null;
  }

  return chain;
}

// ---------------------------------------------------------------------------
// Resolución de descuento por medio de pago
// ---------------------------------------------------------------------------

/**
 * Para un medioPagoId y un categId dados, devuelve el descuento vigente
 * más específico que aplica:
 * 1. Busca en la cadena de ancestros (hoja → raíz) el primer descuento de categoría.
 * 2. Si ninguno aplica, usa el descuento global del mismo medio de pago.
 * 3. Si no hay ninguno, retorna null.
 *
 * Los descuentos que llegan ya están filtrados por activo+fechas (vienen de /api/config/vigentes).
 */
export function resolveDescuento(
  medioPagoId: number,
  categId: number | null,
  descuentos: DescuentoVigente[],
  categorias: CategoriaFlat[],
): DescuentoVigente | null {
  const paraMedio = descuentos.filter((d) => d.medioPagoId === medioPagoId);

  // Intentar resolver por categoría si tenemos categId
  if (categId !== null) {
    const chain = buildAncestorChain(categId, categorias);
    const porCategoria = paraMedio.filter((d) => d.alcance === "categoria");

    for (const ancestorId of chain) {
      const match = porCategoria.find((d) => d.categoriaOdooId === ancestorId);
      if (match) return match;
    }
  }

  // Fallback: descuento global
  return paraMedio.find((d) => d.alcance === "global") ?? null;
}

/**
 * Resuelve un descuento por cada medio de pago presente en los descuentos vigentes.
 */
export function resolveDescuentosPorMedio(
  categId: number | null,
  descuentos: DescuentoVigente[],
  categorias: CategoriaFlat[],
): PrecioMedioPago[] {
  // Deduplicar medios de pago
  const mediosMap = new Map<number, { id: number; nombre: string }>();
  for (const d of descuentos) {
    if (!mediosMap.has(d.medioPagoId)) {
      mediosMap.set(d.medioPagoId, d.medioPago);
    }
  }

  return Array.from(mediosMap.values())
    .map((medio) => {
      const descuento = resolveDescuento(medio.id, categId, descuentos, categorias);
      return { medio, descuento };
    })
    .filter((r): r is { medio: { id: number; nombre: string }; descuento: DescuentoVigente } =>
      r.descuento !== null,
    )
    .map(({ medio }) => ({
      medioPagoId: medio.id,
      medioPagoNombre: medio.nombre,
      // precio se calcula aparte con calcularPrecioConDescuento
      precio: 0,
    }));
}

// ---------------------------------------------------------------------------
// Cálculo de precio con descuento
// ---------------------------------------------------------------------------

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "string" ? parseFloat(v) : v;
}

/**
 * Calcula el precio con descuento aplicado, redondeado a la decena.
 * Nunca negativo (clamp a 0).
 */
export function calcularPrecioConDescuento(
  listPrice: number,
  descuento: DescuentoVigente,
): number {
  const valor = toNumber(descuento.valor);
  let precioFinal: number;

  if (descuento.tipo === "porcentaje") {
    precioFinal = listPrice * (1 - valor / 100);
  } else {
    // monto_fijo
    precioFinal = listPrice - valor;
  }

  return redondearDecena(Math.max(0, precioFinal));
}

// ---------------------------------------------------------------------------
// Cálculo de promos bancarias
// ---------------------------------------------------------------------------

/**
 * Calcula el precio/cuota de una promo bancaria dado el precio de tarjeta.
 * Base siempre es listPrice (precio de tarjeta — pagos con tarjeta).
 */
export function calcularPreciosPromo(
  listPrice: number,
  promo: PromoVigente,
): PromoCalculo {
  switch (promo.tipoBeneficio) {
    case "cuotas_sin_interes": {
      const cuotas = promo.cantidadCuotas ?? 1;
      const cuotaMonto = redondearDecena(listPrice / cuotas);
      return { tipo: "cuotas", cuotas, cuotaMonto, total: listPrice };
    }

    case "cuotas_con_interes": {
      const cuotas = promo.cantidadCuotas ?? 1;
      const coef = toNumber(promo.coeficienteInteres) || 1;
      const total = redondearDecena(listPrice * coef);
      const cuotaMonto = redondearDecena(total / cuotas);
      return { tipo: "cuotas", cuotas, cuotaMonto, total };
    }

    case "reintegro":
    case "descuento_directo": {
      const pct = toNumber(promo.valorPorcentaje);
      const reintegroBruto = listPrice * (pct / 100);
      const tope = toNumber(promo.topeReintegro);
      const reintegro = tope > 0 ? Math.min(reintegroBruto, tope) : reintegroBruto;
      const precioFinal = redondearDecena(Math.max(0, listPrice - reintegro));
      return { tipo: "reintegro_descuento", precioFinal, reintegro: Math.round(reintegro) };
    }

    default:
      return { tipo: "reintegro_descuento", precioFinal: listPrice, reintegro: 0 };
  }
}
