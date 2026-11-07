import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { Vista, Periodo } from "@/lib/tesoreriaVista";
import type { Extracto } from "@/lib/tesoreriaExtracto";
import type { Resumen } from "@/lib/tesoreriaResumen";
import type { ConfigTesoreria } from "@/lib/tesoreriaConfig";
import type { ChequeCartera, ChequeEmitido, Datos, Estado, FacturaPendiente, Tipo, TipoComprobante } from "@/lib/tesoreria";

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? "Error de red");
  return body as T;
}

export function useTesoreriaMovimientos(periodo: Periodo, fecha: string) {
  return useQuery({
    queryKey: queryKeys.tesoreria.movimientos(periodo, fecha),
    queryFn: () => get<Vista>(`/api/tesoreria/movimientos?periodo=${periodo}&fecha=${fecha}`),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useTesoreriaExtracto(diario: number | undefined, desde: string, hasta: string) {
  return useQuery({
    queryKey: queryKeys.tesoreria.extracto(diario ?? 0, desde, hasta),
    queryFn: () => get<Extracto>(`/api/tesoreria/extracto?diario=${diario}&desde=${desde}&hasta=${hasta}`),
    enabled: !!diario,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useTesoreriaResumen(periodo: Periodo, fecha: string) {
  return useQuery({
    queryKey: queryKeys.tesoreria.resumen(periodo, fecha),
    queryFn: () => get<Resumen>(`/api/tesoreria/resumen?periodo=${periodo}&fecha=${fecha}`),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export type Catalogos = ConfigTesoreria & {
  bancos: { id: number; nombre: string }[];
  responsabilidades: { id: number; nombre: string }[];
  tiposComprobante: TipoComprobante[];
  odooDisponible: boolean;
};

export function useTesoreriaCatalogos() {
  return useQuery({ queryKey: queryKeys.tesoreria.catalogos(), queryFn: () => get<Catalogos>("/api/tesoreria/catalogos"), staleTime: 5 * 60_000 });
}

export type PasoView = {
  fase: "EJECUCION" | "ANULACION";
  orden: number;
  descripcion: string;
  estado: "PENDIENTE" | "EN_CURSO" | "OK" | "ERROR";
  referencia: string;
  odooModelo: string | null;
  odooId: number | null;
  error: string | null;
  intentos: number;
};

export type OperacionView = {
  id: number;
  tipo: Tipo;
  estado: Estado;
  fechaContable: string;
  contactoId: number | null;
  contactoNombre: string | null;
  observacion: string | null;
  datos: Datos;
  total: number;
  error: string | null;
  creadoPor: string;
  creadoEn: string;
  confirmadoPor: string | null;
  confirmadoEn: string | null;
  anuladoPor: string | null;
  anuladoEn: string | null;
  pasos: PasoView[];
  eventos: { tipo: string; empleado: string; detalle: string | null; creadoEn: string }[];
};

/** Detalle de una operación. `seguir` consulta cada segundo (progreso mientras se ejecuta). */
export function useTesoreriaOperacion(id: number | null, seguir = false) {
  return useQuery({
    queryKey: queryKeys.tesoreria.operacion(id ?? 0),
    queryFn: () => get<OperacionView>(`/api/tesoreria/operaciones/${id}`),
    enabled: !!id,
    staleTime: 0,
    refetchInterval: seguir ? 1000 : false,
  });
}

export type AdjuntoView = { id: number; nombre: string; mimetype: string; tamano: number | null; diarioId: number | null; origen: "odoo" | "app" };

/** Adjuntos de una operación: los de Odoo (fuente de verdad) y los del borrador pendientes de subir. */
export function useTesoreriaAdjuntos(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.tesoreria.adjuntos(id ?? 0),
    queryFn: () => get<{ adjuntos: AdjuntoView[]; odooError: string | null }>(`/api/tesoreria/operaciones/${id}/adjuntos`),
    enabled: !!id,
  });
}

export type ContactoView = { id: number; nombre: string; cuit: string };

export function useTesoreriaContactos(q: string) {
  return useQuery({
    queryKey: queryKeys.tesoreria.contactos(q),
    queryFn: () => get<ContactoView[]>(`/api/tesoreria/contactos?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useTesoreriaCartera(diarioId: number | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tesoreria.cartera(),
    queryFn: () => get<ChequeCartera[]>(`/api/tesoreria/cheques?vista=cartera&diarioId=${diarioId}`),
    enabled: enabled && !!diarioId,
    staleTime: 0,
  });
}

export function useTesoreriaChequesPropios(diarioId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.tesoreria.chequesPropios(diarioId ?? 0),
    queryFn: () => get<ChequeEmitido[]>(`/api/tesoreria/cheques?vista=propios&diarioId=${diarioId}`),
    enabled: !!diarioId,
    staleTime: 0,
  });
}

/** Facturas con saldo del contacto: solo se consulta con el diálogo de imputación abierto. */
export function useTesoreriaFacturasPendientes(contactoId: number | null, tipo: "PAGO" | "COBRO", enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tesoreria.facturasPendientes(contactoId ?? 0, tipo),
    queryFn: () => get<FacturaPendiente[]>(`/api/tesoreria/facturas-pendientes?contactoId=${contactoId}&tipo=${tipo}`),
    enabled: enabled && !!contactoId,
    staleTime: 0,
  });
}

export type PendienteView ={ id: number; tipo: Tipo; estado: "BORRADOR" | "REQUIERE_ATENCION"; fechaContable: string; contactoNombre: string | null; observacion: string | null; total: number };

/** Borradores y operaciones que requieren atención, de cualquier fecha. */
export function useTesoreriaPendientes() {
  return useQuery({ queryKey: queryKeys.tesoreria.pendientes(), queryFn: () => get<PendienteView[]>("/api/tesoreria/operaciones"), staleTime: 0 });
}
