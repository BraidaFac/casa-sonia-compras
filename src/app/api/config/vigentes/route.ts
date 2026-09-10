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
    if (d.vigenciaDesde && d.vigenciaDesde.toISOString().split("T")[0] > todayStr) return false;
    if (d.vigenciaHasta && d.vigenciaHasta.toISOString().split("T")[0] < todayStr) return false;
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
