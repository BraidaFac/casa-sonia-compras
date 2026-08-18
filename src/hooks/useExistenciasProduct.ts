import { useQuery } from "@tanstack/react-query";
import type { ExistenciasProduct } from "@/types";

async function fetchProduct(templateId: number): Promise<ExistenciasProduct> {
  const res = await fetch(`/api/existencias/product?templateId=${templateId}`);
  if (!res.ok) throw new Error("Error al cargar producto");
  return res.json();
}

export function useExistenciasProduct(templateId: number | null) {
  return useQuery<ExistenciasProduct>({
    queryKey: ["existenciasProduct", templateId],
    queryFn: () => fetchProduct(templateId!),
    enabled: templateId !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
