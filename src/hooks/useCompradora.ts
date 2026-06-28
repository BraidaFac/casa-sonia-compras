import { useQuery } from "@tanstack/react-query";

async function fetchCompradora() {
  const res = await fetch("/api/compradora");
  if (!res.ok) throw new Error("Error fetching compradoras");
  return res.json() as Promise<{ compradoras: { id: number; name: string }[] }>;
}

export function useCompradora() {
  return useQuery({
    queryKey: ["compradora"],
    queryFn: fetchCompradora,
    staleTime: Infinity,
  });
}
