import { useQuery } from "@tanstack/react-query";
import type { LocalInventorySummary } from "@/types";

interface InventoriesResponse {
  data: LocalInventorySummary[];
  total: number;
  limit: number;
  offset: number;
}

async function fetchInventories(params?: {
  status?: string;
  warehouseId?: number;
  limit?: number;
  offset?: number;
}): Promise<InventoriesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.warehouseId) searchParams.set("warehouse_id", String(params.warehouseId));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const res = await fetch(`/api/inventario?${searchParams}`);
  if (!res.ok) throw new Error("Error fetching inventories");
  return res.json();
}

export function useInventories(params?: {
  status?: string;
  warehouseId?: number;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["inventories", params],
    queryFn: () => fetchInventories(params),
    staleTime: 0,
  });
}
