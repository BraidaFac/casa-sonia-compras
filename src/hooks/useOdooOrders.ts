import { useQuery } from "@tanstack/react-query";

export interface OCSummary {
  id: number;
  name: string;
  partner_id: [number, string];
  state: string;
  date_order: string;
  amount_total: number;
}

export interface OdooOrdersParams {
  supplierId?: number;
  state?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

interface OdooOrdersResponse {
  orders: OCSummary[];
  total: number;
}

async function fetchOdooOrders(
  params: OdooOrdersParams,
): Promise<OdooOrdersResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params.supplierId !== undefined)
    searchParams.set("supplier_id", String(params.supplierId));
  if (params.state) searchParams.set("state", params.state);
  if (params.dateFrom) searchParams.set("date_from", params.dateFrom);
  if (params.dateTo) searchParams.set("date_to", params.dateTo);

  const res = await fetch(`/api/orders?${searchParams}`);
  if (!res.ok) throw new Error("Error fetching orders");
  return res.json();
}

export function useOdooOrders(params: OdooOrdersParams) {
  return useQuery({
    queryKey: ["odoo-orders", params],
    queryFn: () => fetchOdooOrders(params),
    staleTime: 60_000,
  });
}
