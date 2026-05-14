import { useQuery } from "@tanstack/react-query";
import type { Supplier } from "@/types";

async function fetchSuppliers(): Promise<Supplier[]> {
  const res = await fetch("/api/suppliers");
  if (!res.ok) throw new Error("Error fetching suppliers");
  return res.json();
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
    staleTime: Infinity,
  });
}
