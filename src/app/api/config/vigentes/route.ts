import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { odoo } from "@/lib/odoo";
import { getTodayBuenosAires, isPromoVigenteHoy, PROMO_SELECT } from "@/lib/vigentesHelpers";

function isPromoProxima(
  promo: { activa: boolean; vigenciaDesde: Date },
  todayStr: string,
): boolean {
  return promo.activa && promo.vigenciaDesde.toISOString().split("T")[0] > todayStr;
}

function isPromoOtroDia(
  promo: { activa: boolean; vigenciaDesde: Date; vigenciaHasta: Date | null; diasAplicables: string | null },
  todayStr: string,
  todayName: string,
): boolean {
  if (!promo.activa) return false;
  if (promo.vigenciaDesde.toISOString().split("T")[0] > todayStr) return false;
  if (promo.vigenciaHasta && promo.vigenciaHasta.toISOString().split("T")[0] < todayStr) return false;
  if (!promo.diasAplicables) return false;
  const dias: string[] = JSON.parse(promo.diasAplicables);
  return dias.length > 0 && !dias.includes(todayName);
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

  // Fetch category names for categoria-scoped descuentos
  const categIds = [...new Set(
    descuentosVigentes.filter((d) => d.alcance === "categoria" && d.categoriaOdooId).map((d) => d.categoriaOdooId as number)
  )];
  const categNombres = new Map<number, string>();
  if (categIds.length > 0) {
    const cats = await odoo.read<{ id: number; complete_name: string }>("product.category", categIds, ["id", "complete_name"]);
    for (const c of cats) categNombres.set(c.id, c.complete_name);
  }

  const descuentosConNombre = descuentosVigentes.map((d) => ({
    ...d,
    categoriaNombre: d.categoriaOdooId ? (categNombres.get(d.categoriaOdooId) ?? null) : null,
  }));

  const promosHoy       = todasPromos.filter((p) => isPromoVigenteHoy(p, todayStr, todayName));
  const promosOtrosDias = todasPromos.filter((p) => isPromoOtroDia(p, todayStr, todayName));
  const promosProximas  = todasPromos.filter((p) => isPromoProxima(p, todayStr));

  return NextResponse.json({
    descuentos: descuentosConNombre,
    promos: {
      hoy: promosHoy,
      otrosDias: promosOtrosDias,
      proximas: promosProximas,
    },
  });
});
