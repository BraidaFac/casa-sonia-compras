import { useQuery } from "@tanstack/react-query";

async function fetchColorBaseOptions(): Promise<string[]> {
  const res = await fetch("/api/color-base-options");
  if (!res.ok) return [];
  return res.json();
}

export function useColorBaseOptions() {
  return useQuery({
    queryKey: ["color-base-options"],
    queryFn: fetchColorBaseOptions,
    staleTime: Infinity,
  });
}
