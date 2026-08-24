import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { DescuentoVigente, PromoVigente } from "@/lib/configPricing";

interface ConfigVigenteResponse {
  descuentos: DescuentoVigente[];
  promos: {
    hoy: PromoVigente[];
    proximas: PromoVigente[];
  };
}

async function fetchConfigVigente(): Promise<ConfigVigenteResponse> {
  const r = await fetch("/api/config/vigentes");
  if (!r.ok) throw new Error("Error al cargar configuración vigente");
  return r.json();
}

export function useConfigVigente() {
  return useQuery<ConfigVigenteResponse>({
    queryKey: queryKeys.config.vigente(),
    queryFn: fetchConfigVigente,
    staleTime: 5 * 60 * 1000, // Tier C: 5 min — invalidar explícitamente al guardar descuentos/promos
  });
}
