import { useQuery } from "@tanstack/react-query";
import type { AttributesData } from "@/types";

async function fetchAttributes(): Promise<AttributesData> {
  const res = await fetch("/api/attributes");
  if (!res.ok) throw new Error("Error fetching attributes");
  return res.json();
}

export function useAttributes() {
  return useQuery({
    queryKey: ["attributes"],
    queryFn: fetchAttributes,
    staleTime: Infinity,
  });
}
