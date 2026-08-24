import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { FilterState, FilteredExistenciasResult } from "@/types";

async function fetchFilteredExistencias(
  filters: FilterState,
  page: number,
  limit: number,
): Promise<FilteredExistenciasResult> {
  const params = new URLSearchParams();

  if (filters.categoryIds.length > 0)
    params.set("categoryIds", filters.categoryIds.join(","));
  if (filters.colorBases.length > 0)
    params.set("colorBases", filters.colorBases.join(","));
  if (filters.equivalencias.length > 0)
    params.set("equivalencias", filters.equivalencias.join(","));
  if (filters.brandValueIds.length > 0)
    params.set("brandValueIds", filters.brandValueIds.join(","));
  if (filters.corteValueIds.length > 0)
    params.set("corteValueIds", filters.corteValueIds.join(","));
  if (filters.materialValueIds.length > 0)
    params.set("materialValueIds", filters.materialValueIds.join(","));

  params.set("page", String(page));
  params.set("limit", String(limit));

  const res = await fetch(`/api/existencias/filter?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Error al filtrar productos");
  }
  return res.json();
}

function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.categoryIds.length > 0 ||
    filters.colorBases.length > 0 ||
    filters.equivalencias.length > 0 ||
    filters.brandValueIds.length > 0 ||
    filters.corteValueIds.length > 0 ||
    filters.materialValueIds.length > 0
  );
}

export const FILTER_PAGE_LIMIT = 24;

export function useFilteredExistencias(
  filters: FilterState,
  page: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["existencias", "filter", filters, page],
    queryFn: () => fetchFilteredExistencias(filters, page, FILTER_PAGE_LIMIT),
    enabled: enabled && hasActiveFilters(filters),
    staleTime: 30_000, // 30s — results can change between searches
    placeholderData: keepPreviousData,
  });
}
