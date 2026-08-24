import { useState, useCallback, useEffect } from "react";
import type { FilterState, FilterHistoryEntry } from "@/types";

const STORAGE_KEY = "existencias-filter-history";
const MAX_ENTRIES = 5;

function hashFilters(filters: FilterState): string {
  return JSON.stringify({
    c: [...filters.categoryIds].sort(),
    co: [...filters.colorBases].sort(),
    e: [...filters.equivalencias].sort(),
    b: [...filters.brandValueIds].sort(),
    k: [...filters.corteValueIds].sort(),
    m: [...filters.materialValueIds].sort(),
  });
}

function readHistory(): FilterHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FilterHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: FilterHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function buildFilterLabel(
  filters: FilterState,
  options: {
    categories: { id: number; name: string }[];
    colors: { colorBase: string; name: string }[];
    talles: { equivalencia: string }[];
    brands: { id: number; name: string }[];
    cortes: { id: number; name: string }[];
    materials: { id: number; name: string }[];
  },
): string {
  const parts: string[] = [];

  if (filters.categoryIds.length > 0) {
    const names = filters.categoryIds
      .map((id) => options.categories.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length > 0) parts.push(names.join(", "));
  }

  if (filters.equivalencias.length > 0) {
    parts.push(`Talle ${filters.equivalencias.join(", ")}`);
  }

  if (filters.colorBases.length > 0) {
    const names = filters.colorBases
      .map((base) => options.colors.find((c) => c.colorBase === base)?.name)
      .filter(Boolean) as string[];
    if (names.length > 0) parts.push(names.join(", "));
  }

  if (filters.brandValueIds.length > 0) {
    const names = filters.brandValueIds
      .map((id) => options.brands.find((b) => b.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length > 0) parts.push(names.join(", "));
  }

  if (filters.corteValueIds.length > 0) {
    const names = filters.corteValueIds
      .map((id) => options.cortes.find((c) => c.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length > 0) parts.push(names.join(", "));
  }

  if (filters.materialValueIds.length > 0) {
    const names = filters.materialValueIds
      .map((id) => options.materials.find((m) => m.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length > 0) parts.push(names.join(", "));
  }

  return parts.join(" · ") || "Búsqueda sin etiqueta";
}

export function useFilterHistory() {
  const [history, setHistory] = useState<FilterHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const addEntry = useCallback(
    (filters: FilterState, label: string) => {
      const id = hashFilters(filters);
      setHistory((prev) => {
        // Remove existing entry with same hash (move-to-front dedup)
        const without = prev.filter((e) => e.id !== id);
        const updated = [
          { id, label, filters, appliedAt: Date.now() },
          ...without,
        ].slice(0, MAX_ENTRIES);
        writeHistory(updated);
        return updated;
      });
    },
    [],
  );

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      writeHistory(updated);
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
    writeHistory([]);
  }, []);

  return { history, addEntry, removeEntry, clearAll };
}
