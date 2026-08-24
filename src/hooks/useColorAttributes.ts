import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { AttributesData } from "@/types";

async function fetchColorAttributes(): Promise<AttributesData> {
  const res = await fetch("/api/attributes");
  if (!res.ok) throw new Error("Error al cargar atributos de color");
  return res.json();
}

/**
 * Hook canónico para atributos de color — Tier A.
 * Reemplaza useAttributes() (parte color) y la query inline de colores en useFilterOptions.
 * Key: queryKeys.attributes.color() = ["ref", "attr", "color"]
 *
 * Retorna todos los campos de useQuery más:
 *   colorBases — lista ordenada de valores únicos de x_studio_color_base
 */
export function useColorAttributes() {
  const query = useQuery<AttributesData>({
    queryKey: queryKeys.attributes.color(),
    queryFn: fetchColorAttributes,
    staleTime: Infinity,
  });

  const colorBases: string[] = (() => {
    const seen = new Set<string>();
    for (const c of query.data?.colors ?? []) {
      if (c.colorBase) seen.add(c.colorBase);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, "es"));
  })();

  return { ...query, colorBases };
}
