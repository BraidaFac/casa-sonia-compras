import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

async function fetchAttributeValues(attributeId: number) {
  const res = await fetch(`/api/attributes/values?attributeId=${attributeId}`);
  if (!res.ok) throw new Error("Error fetching attribute values");
  return res.json() as Promise<{ id: number; name: string }[]>;
}

export function useAttributeValues(attributeId: number | null) {
  return useQuery({
    queryKey: queryKeys.attributes.byId(attributeId!),
    queryFn: () => fetchAttributeValues(attributeId!),
    enabled: attributeId !== null && attributeId > 0,
    staleTime: Infinity,
  });
}
