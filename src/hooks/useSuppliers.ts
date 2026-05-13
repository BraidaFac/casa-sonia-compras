import { useQuery } from "@tanstack/react-query";
import type { Supplier } from "@/types";

async function fetchSuppliers(q: string): Promise<Supplier[]> {
  const res = await fetch(`/api/suppliers?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Error fetching suppliers");
  return res.json();
}

export function useSuppliers(query: string) {
  return useQuery({
    queryKey: ["suppliers", query],
    queryFn: () => fetchSuppliers(query),
    enabled: query.length > 1,
    staleTime: 30_000,
  });
}
