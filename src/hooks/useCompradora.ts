import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

async function fetchCompradora() {
  const res = await fetch("/api/compradora");
  if (!res.ok) throw new Error("Error fetching compradoras");
  return res.json() as Promise<{ compradoras: { id: number; name: string }[] }>;
}

export function useCompradora() {
  return useQuery({
    queryKey: queryKeys.compradora(),
    queryFn: fetchCompradora,
    staleTime: Infinity,
  });
}
