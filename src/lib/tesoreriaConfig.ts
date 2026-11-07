import { prisma } from "@/lib/prisma";
import type { DiarioCfg, ValidacionCtx } from "@/lib/tesoreria";
import { hoyAR } from "@/lib/tesoreria";

export type CuentaCfg = { odooAccountId: number; codigo: string; nombre: string };

export type ConfigTesoreria = {
  diarios: DiarioCfg[]; // habilitados, en orden
  cuentas: { GASTO: CuentaCfg[]; INGRESO: CuentaCfg[]; SOCIO: CuentaCfg[] };
  fijos: {
    cuentaGananciaId: number | null;
    cuentaPerdidaId: number | null;
    cuentaPuenteId: number | null;
    diarioAjustesId: number | null;
    diarioComprasId: number | null; // con comprobantes (factura A)
    diarioComprasSinDocId: number | null; // sin comprobantes (factura B y C)
    diarioEfectivoDefaultId: number | null;
  };
};

export async function cargarConfig(): Promise<ConfigTesoreria> {
  const [diarios, cuentas, cfg] = await Promise.all([
    prisma.tesoreriaDiario.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    prisma.tesoreriaCuenta.findMany({ orderBy: { codigo: "asc" } }),
    prisma.tesoreriaConfig.findUnique({ where: { id: 1 } }),
  ]);
  const porUso = (uso: "GASTO" | "INGRESO" | "SOCIO") =>
    cuentas.filter((c) => c.uso === uso).map((c) => ({ odooAccountId: c.odooAccountId, codigo: c.codigo, nombre: c.nombre }));
  return {
    diarios: diarios.map((d) => ({ odooJournalId: d.odooJournalId, nombre: d.nombre, tipo: d.tipo })),
    cuentas: { GASTO: porUso("GASTO"), INGRESO: porUso("INGRESO"), SOCIO: porUso("SOCIO") },
    fijos: {
      cuentaGananciaId: cfg?.cuentaGananciaId ?? null,
      cuentaPerdidaId: cfg?.cuentaPerdidaId ?? null,
      cuentaPuenteId: cfg?.cuentaPuenteId ?? null,
      diarioAjustesId: cfg?.diarioAjustesId ?? null,
      diarioComprasId: cfg?.diarioComprasId ?? null,
      diarioComprasSinDocId: cfg?.diarioComprasSinDocId ?? null,
      diarioEfectivoDefaultId: cfg?.diarioEfectivoDefaultId ?? null,
    },
  };
}

export function contextoValidacion(c: ConfigTesoreria): ValidacionCtx {
  return {
    hoy: hoyAR(),
    diarios: c.diarios,
    cuentasGasto: c.cuentas.GASTO.map((x) => x.odooAccountId),
    cuentasIngreso: c.cuentas.INGRESO.map((x) => x.odooAccountId),
    cuentasSocio: c.cuentas.SOCIO.map((x) => x.odooAccountId),
  };
}
