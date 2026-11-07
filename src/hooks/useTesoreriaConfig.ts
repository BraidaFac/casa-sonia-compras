import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { ConfigTesoreria } from "@/lib/tesoreriaConfig";
import type { OdooCuenta, OdooDiario } from "@/lib/odooTesoreria";

export type ConfigResponse = {
  config: ConfigTesoreria;
  odoo?: { diarios: OdooDiario[]; cuentas: OdooCuenta[]; generales: { id: number; nombre: string; tipo: string }[] };
  sugeridas?: { gasto: number[]; ingreso: number[]; socio: number[] } | null;
  defaults?: Partial<ConfigTesoreria["fijos"]>;
  error?: string;
};

async function fetchConfig(conOdoo: boolean): Promise<ConfigResponse> {
  const r = await fetch(`/api/tesoreria/config${conOdoo ? "?odoo=1" : ""}`);
  const body = await r.json();
  if (!r.ok && !body.config) throw new Error(body.error ?? "Error al cargar la configuración");
  return body;
}

/** Configuración de Tesorería. `conOdoo` trae además los catálogos de Odoo (solo ADMIN). */
export function useTesoreriaConfig(conOdoo = false) {
  return useQuery({
    queryKey: queryKeys.tesoreria.config(conOdoo),
    queryFn: () => fetchConfig(conOdoo),
    staleTime: conOdoo ? 0 : 5 * 60_000,
  });
}
