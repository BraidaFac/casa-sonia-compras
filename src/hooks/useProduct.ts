import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { ExistenciasProduct } from "@/types";

async function fetchProduct(templateId: number): Promise<ExistenciasProduct> {
  const res = await fetch(`/api/existencias/product?templateId=${templateId}`);
  if (!res.ok) throw new Error("Error al cargar producto");
  return res.json();
}

/**
 * Hook canónico para entidad artículo — Tier B.
 * Key: queryKeys.product(templateId) = ["entity", "product", templateId]
 *
 * staleTime: Infinity — datos descriptivos del template no cambian en sesión.
 * gcTime: 30min — sobrevive navegación entre secciones.
 *
 * Reemplaza useExistenciasProduct. El warmup de Inventario (Paso 7) inyecta
 * datos en esta misma key vía queryClient.setQueryData.
 */
export function useProduct(templateId: number | null) {
  return useQuery<ExistenciasProduct>({
    queryKey: queryKeys.product(templateId!),
    queryFn: () => fetchProduct(templateId!),
    enabled: templateId !== null,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutos
  });
}
