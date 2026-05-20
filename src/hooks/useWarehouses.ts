import { useQuery } from "@tanstack/react-query";

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
    queryKey: ["warehouses"],
    queryFn: fetchWarehouses,
    staleTime: Infinity,
  });
}
