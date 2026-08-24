import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useCategories } from "@/hooks/useCategories";
import { useBrands } from "@/hooks/useBrands";
import { useSizeAttributes } from "@/hooks/useSizeAttributes";
import { useColorAttributes } from "@/hooks/useColorAttributes";
import type { ProductCategory } from "@/app/api/categories/route";
import type { SizeAttribute } from "@/app/api/size-attributes/route";
import type { AttributeByName } from "@/app/api/attributes/by-name/route";

// ---- fetchers (solo para atributos sin hook dedicado aún) -------------------

async function fetchByName(name: string): Promise<AttributeByName> {
  const res = await fetch(`/api/attributes/by-name?name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Error al cargar atributo "${name}"`);
  return res.json();
}

// ---- derived types ----------------------------------------------------------

export interface ColorOption {
  /** x_studio_color_base value — used as the filter key */
  colorBase: string;
  /** Human-readable label (same as colorBase, capitalized) */
  name: string;
  /** Representative hex from the first color value in this base group */
  hexColor: string;
}

export interface TalleOption {
  /** Normalized value used for filtering (x_studio_equivalencias) */
  equivalencia: string;
}

export interface FilterOptions {
  categories: ProductCategory[];
  /** Unique color bases (x_studio_color_base), each with a representative hex */
  colors: ColorOption[];
  talles: TalleOption[];       // unique equivalencias, sorted
  brands: { id: number; name: string }[];
  cortes: { id: number; name: string }[];
  materials: { id: number; name: string }[];
  isLoading: boolean;
  isError: boolean;
}

// ---- hook -------------------------------------------------------------------

export function useFilterOptions(): FilterOptions {
  const categoriesQ = useCategories();
  const colorAttrsQ = useColorAttributes();
  const sizeAttrsQ = useSizeAttributes();
  const brandsQ = useBrands();

  const corteQ = useQuery({
    queryKey: queryKeys.attributes.corte(),
    queryFn: () => fetchByName("Corte"),
    staleTime: Infinity,
  });

  const materialQ = useQuery({
    queryKey: queryKeys.attributes.material(),
    queryFn: () => fetchByName("Material principal"),
    staleTime: Infinity,
  });

  // Derive unique, sorted equivalencias from all size attribute values
  const talles: TalleOption[] = (() => {
    const sizeAttrs: SizeAttribute[] = sizeAttrsQ.data ?? [];
    const seen = new Set<string>();
    for (const attr of sizeAttrs) {
      for (const v of attr.values) {
        if (v.equivalencia) seen.add(v.equivalencia);
      }
    }
    return [...seen]
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
      .map((eq) => ({ equivalencia: eq }));
  })();

  const isLoading =
    categoriesQ.isLoading ||
    colorAttrsQ.isLoading ||
    sizeAttrsQ.isLoading ||
    brandsQ.isLoading ||
    corteQ.isLoading ||
    materialQ.isLoading;

  const isError =
    categoriesQ.isError ||
    colorAttrsQ.isError ||
    sizeAttrsQ.isError ||
    brandsQ.isError ||
    corteQ.isError ||
    materialQ.isError;

  // Derive unique color bases with representative hex
  const colors: ColorOption[] = (() => {
    const raw = colorAttrsQ.data?.colors ?? [];
    const seen = new Map<string, string>(); // colorBase → first hexColor
    for (const c of raw) {
      if (c.colorBase && !seen.has(c.colorBase)) {
        seen.set(c.colorBase, c.hexColor ?? "");
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([colorBase, hexColor]) => ({
        colorBase,
        name: colorBase.charAt(0).toUpperCase() + colorBase.slice(1),
        hexColor,
      }));
  })();

  return {
    categories: categoriesQ.data ?? [],
    colors,
    talles,
    brands: brandsQ.data?.brands ?? [],
    cortes: corteQ.data?.values ?? [],
    materials: materialQ.data?.values ?? [],
    isLoading,
    isError,
  };
}
