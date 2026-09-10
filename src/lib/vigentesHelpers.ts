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
