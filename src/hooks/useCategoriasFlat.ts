import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { CategoriaFlat } from "@/lib/configPricing";

async function fetchCategoriasFlat(): Promise<CategoriaFlat[]> {
  const r = await fetch("/api/config/categorias");
  if (!r.ok) throw new Error("Error al cargar categorías");
  return r.json();
}

export function useCategoriasFlat() {
  return useQuery<CategoriaFlat[]>({
    queryKey: queryKeys.config.categorias(),
    queryFn: fetchCategoriasFlat,
    staleTime: 5 * 60 * 1000, // Tier C: 5 min — invalidar explícitamente al guardar config
  });
}
