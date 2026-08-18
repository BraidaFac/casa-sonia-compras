import { useQuery } from "@tanstack/react-query";
import type { ExistenciasLocation } from "@/types";

async function fetchLocations(): Promise<ExistenciasLocation[]> {
  const res = await fetch("/api/existencias/stock?templateId=0");
  // Locations are returned bundled with the stock response.
  // This hook exists for pre-fetching or standalone use.
  if (!res.ok) return [];
  const data = await res.json();
  return data.locations ?? [];
}

// Note: locations are returned as part of useExistenciasStock.
// This hook exists for pre-fetching or standalone use.
export function useOdooLocations() {
  return useQuery<ExistenciasLocation[]>({
    queryKey: ["odooLocations"],
    queryFn: fetchLocations,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
