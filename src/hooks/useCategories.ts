import { useQuery } from "@tanstack/react-query";
import type { ProductCategory } from "@/app/api/categories/route";

async function fetchCategories(): Promise<ProductCategory[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Error fetching categories");
  return res.json();
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: Infinity,
  });
}
