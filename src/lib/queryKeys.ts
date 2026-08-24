/**
 * Query-key factory canónica — fuente única de verdad para todas las keys de React Query.
 *
 * Tier A — Referencia estática:  ["ref", ...]       staleTime: Infinity
 * Tier B — Entidad artículo:     ["entity", ...]    staleTime: Infinity, gcTime: 30min
 * Tier B — Lookup:               ["lookup", ...]    staleTime: Infinity
 * Tier C — Semi-volátil:         ["search", ...]    staleTime: corto
 * Tier D — Volátil:              ["stock", ...]     staleTime: 0
 */

export const queryKeys = {
  // ─── Tier A — Referencia estática ────────────────────────────────────────
  suppliers: () => ["ref", "suppliers"] as const,
  categories: () => ["ref", "categories"] as const,
  warehouses: () => ["ref", "warehouses"] as const,
  locations: () => ["ref", "locations"] as const,

  attributes: {
    color: () => ["ref", "attr", "color"] as const,
    colorBaseOptions: () => ["ref", "attr", "color-base-options"] as const,
    size: () => ["ref", "attr", "size"] as const,
    brand: () => ["ref", "attr", "brand"] as const,
    corte: () => ["ref", "attr", "corte"] as const,
    material: () => ["ref", "attr", "material"] as const,
    all: () => ["ref", "attr", "all"] as const,
    byId: (attrId: number) => ["ref", "attr", "values", attrId] as const,
  },

  productTypes: () => ["ref", "product-types"] as const,
  compradora: () => ["ref", "compradora"] as const,

  config: {
    vigente: () => ["ref", "config", "vigente"] as const,
    categorias: () => ["ref", "config", "categorias"] as const,
  },

  // ─── Tier B — Entidad artículo (keyed por templateId) ────────────────────
  product: (templateId: number) => ["entity", "product", templateId] as const,

  // ─── Tier B — Lookup barcode → templateId (estable, cacheable de sesión) ─
  barcode: (code: string) => ["lookup", "barcode", code] as const,

  // ─── Tier C — Semi-volátil ────────────────────────────────────────────────
  productSearch: (query: string) => ["search", "products", query] as const,
  existenciasFilter: (filters: object, page: number) =>
    ["search", "existencias", filters, page] as const,
  odooOrders: (params: object) => ["search", "odoo-orders", params] as const,

  // ─── Tier D — Volátil (siempre fresco) ───────────────────────────────────
  stock: (templateId: number) => ["stock", templateId] as const,
} as const;
