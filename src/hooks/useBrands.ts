import { useQuery } from "@tanstack/react-query";

async function fetchBrands() {
  const res = await fetch("/api/brands");
  if (!res.ok) throw new Error("Error fetching brands");
  return res.json() as Promise<{ attributeId: number; brands: { id: number; name: string }[] }>;
}

export function useBrands() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: fetchBrands,
    staleTime: Infinity,
  });
}
