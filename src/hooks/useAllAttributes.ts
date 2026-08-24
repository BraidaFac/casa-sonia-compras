import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

async function fetchAllAttributes() {
  const res = await fetch("/api/attributes/all");
  if (!res.ok) throw new Error("Error fetching attributes");
  return res.json() as Promise<{ id: number; name: string }[]>;
}

export function useAllAttributes() {
  return useQuery({
    queryKey: queryKeys.attributes.all(),
    queryFn: fetchAllAttributes,
    staleTime: Infinity,
  });
}
