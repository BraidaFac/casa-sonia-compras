import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SearchHistoryEntry } from "@/types";

async function fetchHistory(): Promise<SearchHistoryEntry[]> {
  const res = await fetch("/api/search-history");
  if (!res.ok) throw new Error("Error al cargar historial");
  return res.json();
}

async function addHistoryEntry(entry: {
  productTemplateId: number;
  productName: string;
  productRef?: string | null;
  thumbUrl?: string | null;
}): Promise<void> {
  const res = await fetch("/api/search-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error("Error al guardar historial");
}

export function useSearchHistory() {
  const queryClient = useQueryClient();

  const query = useQuery<SearchHistoryEntry[]>({
    queryKey: ["searchHistory"],
    queryFn: fetchHistory,
    staleTime: 30 * 1000, // 30 seconds
  });

  const mutation = useMutation({
    mutationFn: addHistoryEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["searchHistory"] });
    },
  });

  return { ...query, addEntry: mutation.mutate };
}
