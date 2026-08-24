import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface Warehouse {
  id: number;
  name: string;
  code: string;
}

async function fetchWarehouses(): Promise<Warehouse[]> {
  const res = await fetch("/api/warehouses");
  if (!res.ok) throw new Error("Error fetching warehouses");
  return res.json();
}

export function useWarehouses() {
  return useQuery({
    queryKey: queryKeys.warehouses(),
    queryFn: fetchWarehouses,
    staleTime: Infinity,
  });
}
