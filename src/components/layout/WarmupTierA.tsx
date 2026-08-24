"use client";

/**
 * WarmupTierA — pre-carga todas las queries de Tier A al montar la app autenticada.
 * Renders nothing. Mount una sola vez desde (app)/layout.tsx.
 *
 * Al montar, cada hook registra un suscriptor → React Query inicia el fetch si no hay
 * datos en caché. Con staleTime: Infinity, los datos viven toda la sesión sin refetch.
 * Las secciones (Órdenes, Inventario, Existencias) encuentran el caché caliente.
 */

import { useSuppliers } from "@/hooks/useSuppliers";
import { useCategories } from "@/hooks/useCategories";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useOdooLocations } from "@/hooks/useOdooLocations";
import { useColorAttributes } from "@/hooks/useColorAttributes";
import { useColorBaseOptions } from "@/hooks/useColorBaseOptions";
import { useSizeAttributes } from "@/hooks/useSizeAttributes";
import { useBrands } from "@/hooks/useBrands";
import { useAllAttributes } from "@/hooks/useAllAttributes";
import { useProductTypes } from "@/hooks/useProductTypes";
import { useCompradora } from "@/hooks/useCompradora";
import { useConfigVigente } from "@/hooks/useConfigVigente";
import { useCategoriasFlat } from "@/hooks/useCategoriasFlat";

export function WarmupTierA() {
  useSuppliers();
  useCategories();
  useWarehouses();
  useOdooLocations();
  useColorAttributes();
  useColorBaseOptions();
  useSizeAttributes();
  useBrands();
  useAllAttributes();
  useProductTypes();
  useCompradora();
  useConfigVigente();
  useCategoriasFlat();

  return null;
}
