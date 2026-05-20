import { useQuery } from "@tanstack/react-query";
import type { SizeAttribute } from "@/app/api/size-attributes/route";

async function fetchSizeAttributes(): Promise<SizeAttribute[]> {
  const res = await fetch("/api/size-attributes");
  if (!res.ok) throw new Error("Error fetching size attributes");
  return res.json();
}

export function useSizeAttributes() {
  return useQuery({
    queryKey: ["size-attributes"],
    queryFn: fetchSizeAttributes,
    staleTime: Infinity,
  });
}
