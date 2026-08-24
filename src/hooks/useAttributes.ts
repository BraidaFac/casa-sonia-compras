import { useQuery } from "@tanstack/react-query";
import type { AttributesData } from "@/types";
import { queryKeys } from "@/lib/queryKeys";

async function fetchAttributes(): Promise<AttributesData> {
  const res = await fetch("/api/attributes");
  if (!res.ok) throw new Error("Error fetching attributes");
  return res.json();
}

export function useAttributes() {
  return useQuery({
    queryKey: queryKeys.attributes.color(),
    queryFn: fetchAttributes,
    staleTime: Infinity,
  });
}
