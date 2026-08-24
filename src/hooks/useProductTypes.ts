import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface ProductType {
  id: number;
  name: string;
  coeficiente: number;
}

async function fetchProductTypes() {
  const res = await fetch("/api/product-types");
  if (!res.ok) throw new Error("Error fetching product types");
  return res.json() as Promise<ProductType[]>;
}

export function useProductTypes() {
  return useQuery({
    queryKey: queryKeys.productTypes(),
    queryFn: fetchProductTypes,
    staleTime: Infinity,
  });
}
