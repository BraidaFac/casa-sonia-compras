import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

function getTodayBuenosAires(): { todayStr: string; dayName: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  const todayStr = `${y}-${m}-${d}`; // YYYY-MM-DD
  // getUTCDay at noon UTC always lands on the same date as todayStr
  const dayNames = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const dayName = dayNames[new Date(`${todayStr}T12:00:00Z`).getUTCDay()];
  return { todayStr, dayName };
}

function dateToStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function isPromoVigenteHoy(
  promo: { activa: boolean; vigenciaDesde: Date; vigenciaHasta: Date | null; diasAplicables: string | null },
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

function isPromoProxima(
  promo: { activa: boolean; vigenciaDesde: Date },
  todayStr: string,
): boolean {
  return promo.activa && dateToStr(promo.vigenciaDesde) > todayStr;
}

const PROMO_SELECT = {
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

export const GET = withAuth(async () => {
  const { todayStr, dayName: todayName } = getTodayBuenosAires();

  const [descuentos, todasPromos] = await Promise.all([
    prisma.descuentoEspecial.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        medioPagoId: true,
        medioPago: { select: { id: true, nombre: true } },
        tipo: true,
        valor: true,
        alcance: true,
        categoriaOdooId: true,
        vigenciaDesde: true,
        vigenciaHasta: true,
      },
      orderBy: [{ medioPagoId: "asc" }, { alcance: "asc" }],
    }),
    prisma.promocionBancaria.findMany({
      select: PROMO_SELECT,
      orderBy: [{ orden: "asc" }, { vigenciaDesde: "asc" }],
    }),
  ]);

  const descuentosVigentes = descuentos.filter((d) => {
    if (d.vigenciaDesde && dateToStr(d.vigenciaDesde) > todayStr) return false;
    if (d.vigenciaHasta && dateToStr(d.vigenciaHasta) < todayStr) return false;
    return true;
  });

  const promosHoy = todasPromos.filter((p) => isPromoVigenteHoy(p, todayStr, todayName));
  const promosProximas = todasPromos.filter((p) => isPromoProxima(p, todayStr));

  return NextResponse.json({
    descuentos: descuentosVigentes,
    promos: {
      hoy: promosHoy,
      proximas: promosProximas,
    },
  });
});
