import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

async function fetchColorBaseOptions(): Promise<string[]> {
  const res = await fetch("/api/color-base-options");
  if (!res.ok) return [];
  return res.json();
}

export function useColorBaseOptions() {
  return useQuery({
    queryKey: queryKeys.attributes.colorBaseOptions(),
    queryFn: fetchColorBaseOptions,
    staleTime: Infinity,
  });
}
