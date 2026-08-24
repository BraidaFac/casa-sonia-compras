import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export interface BarcodeLookupResult {
  variantId: number;
  templateId: number;
  colorAttributeValueId: number | null;
  sizeAttributeValueId: number | null;
}

async function fetchBarcode(code: string): Promise<BarcodeLookupResult> {
  const res = await fetch(`/api/existencias/barcode?barcode=${encodeURIComponent(code)}`);
  if (res.status === 404) throw new Error("NOT_FOUND");
  if (!res.ok) throw new Error("Error al consultar código");
  return res.json();
}

/**
 * Hook canónico para resolución barcode → templateId — Tier B lookup.
 * Key: queryKeys.barcode(code) = ["lookup", "barcode", code]
 *
 * staleTime: Infinity — un barcode siempre mapea al mismo templateId.
 * throwOnError: false — manejo de error por el consumidor (isError / error.message).
 *
 * Uso: enabled: !!code. Re-escanear el mismo código es instantáneo (caché).
 * El queryClient.setQueryData() del scan flow existente puede poblar esta key
 * para evitar el round-trip inicial también.
 */
export function useBarcodeLookup(code: string | null) {
  return useQuery<BarcodeLookupResult>({
    queryKey: queryKeys.barcode(code ?? ""),
    queryFn: () => fetchBarcode(code!),
    enabled: !!code,
    staleTime: Infinity,
    retry: false,
    throwOnError: false,
  });
}
