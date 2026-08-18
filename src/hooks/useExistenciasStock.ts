import { useQuery } from "@tanstack/react-query";
import type { ExistenciasLocation, ExistenciasStockCell } from "@/types";

interface StockResponse {
  stock: ExistenciasStockCell[];
  locations: ExistenciasLocation[];
}

async function fetchStock(templateId: number): Promise<StockResponse> {
  const res = await fetch(`/api/existencias/stock?templateId=${templateId}`);
  if (!res.ok) throw new Error("Error al cargar stock");
  return res.json();
}

export function useExistenciasStock(templateId: number | null) {
  return useQuery<StockResponse>({
    queryKey: ["existenciasStock", templateId],
    queryFn: () => fetchStock(templateId!),
    enabled: templateId !== null,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
