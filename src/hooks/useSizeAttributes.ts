import { useQuery } from "@tanstack/react-query";
import type { SizeAttribute } from "@/app/api/size-attributes/route";
import { queryKeys } from "@/lib/queryKeys";

async function fetchSizeAttributes(): Promise<SizeAttribute[]> {
  const res = await fetch("/api/size-attributes");
  if (!res.ok) throw new Error("Error fetching size attributes");
  return res.json();
}

export function useSizeAttributes() {
  return useQuery({
    queryKey: queryKeys.attributes.size(),
    queryFn: fetchSizeAttributes,
    staleTime: Infinity,
  });
}
