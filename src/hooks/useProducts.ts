import { useQuery } from "@tanstack/react-query";
import type { OdooProductLite } from "@/types";

async function fetchProducts(q: string): Promise<OdooProductLite[]> {
  const res = await fetch(`/api/products?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Error fetching products");
  return res.json();
}

export function useProducts(query: string) {
  return useQuery({
    queryKey: ["products", query],
    queryFn: () => fetchProducts(query),
    enabled: query.length > 1,
    staleTime: 30_000,
  });
}
