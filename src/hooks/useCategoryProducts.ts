import { useQuery } from "@tanstack/react-query";
import type { CategoryProduct } from "@/app/api/inventario/category-products/route";

async function fetchCategoryProducts(categoryId: number): Promise<CategoryProduct[]> {
  const res = await fetch(`/api/inventario/category-products?category_id=${categoryId}`);
  if (!res.ok) throw new Error("Error cargando productos de la categoría");
  return res.json();
}

export function useCategoryProducts(categoryId: number | null) {
  return useQuery({
    queryKey: ["categoryProducts", categoryId],
    queryFn: () => fetchCategoryProducts(categoryId!),
    enabled: categoryId !== null,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}
