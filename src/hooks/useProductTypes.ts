import { useQuery } from "@tanstack/react-query";

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
    queryKey: ["product-types"],
    queryFn: fetchProductTypes,
    staleTime: Infinity,
  });
}
