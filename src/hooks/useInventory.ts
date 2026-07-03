import { useQuery } from "@tanstack/react-query";
import type { LocalInventory } from "@/types";

async function fetchInventory(id: number): Promise<LocalInventory> {
  const res = await fetch(`/api/inventario/${id}`);
  if (!res.ok) throw new Error("Error fetching inventory");
  return res.json();
}

export function useInventory(id: number | null) {
  return useQuery({
    queryKey: ["inventory", id],
    queryFn: () => fetchInventory(id!),
    enabled: id !== null,
    staleTime: 0,
  });
}
