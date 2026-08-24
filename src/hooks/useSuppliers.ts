import { useQuery } from "@tanstack/react-query";
import type { Supplier } from "@/types";
import { queryKeys } from "@/lib/queryKeys";

async function fetchSuppliers(): Promise<Supplier[]> {
  const res = await fetch("/api/suppliers");
  if (!res.ok) throw new Error("Error fetching suppliers");
  return res.json();
}

export function useSuppliers() {
  return useQuery({
    queryKey: queryKeys.suppliers(),
    queryFn: fetchSuppliers,
    staleTime: Infinity,
  });
}
