"use client";
import { Button, Group, MultiSelect, Select, TextInput } from "@mantine/core";
import { Search, X } from "lucide-react";
import { round2, TIPO_LABEL, TIPOS } from "@/lib/tesoreria";
import type { Fila } from "@/lib/tesoreriaVista";

export type Filtros = { texto: string; tipos: string[]; estado: string | null };
export const SIN_FILTROS: Filtros = { texto: "", tipos: [], estado: null };

const ESTADOS = [
  { value: "pendientes", label: "Pendientes (borradores y con atención)" },
  { value: "COMPLETADA", label: "Confirmadas" },
  { value: "PENDIENTE_DEBITO", label: "Pendientes de débito" },
  { value: "ANULADA", label: "Anuladas" },
  { value: "EXTERNO", label: "Cargadas en Odoo" },
];

export const hayFiltros = (f: Filtros) => !!(f.texto.trim() || f.tipos.length || f.estado);

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function pasa(f: Fila, x: Filtros): boolean {
  if (x.tipos.length && !(f.clase === "EXTERNO" ? x.tipos.includes("EXTERNO") : f.tipo && x.tipos.includes(f.tipo))) return false;
  if (x.estado === "pendientes" ? !["BORRADOR", "REQUIERE_ATENCION"].includes(f.estado ?? "") : x.estado && f.estado !== x.estado) return false;
  const q = norm(x.texto.trim());
  if (q && !norm(`${f.concepto} ${f.contacto} ${f.cuenta} ${f.operacionId ? `TES-${f.operacionId}` : ""}`).includes(q)) return false;
  return true;
}

const sumar = (fs: Fila[], k: "mov" | "pend") => {
  const t: Record<number, number> = {};
  for (const f of fs) for (const [d, v] of Object.entries(f[k])) t[Number(d)] = round2((t[Number(d)] ?? 0) + v);
  return t;
};

/** Filtra las filas (en mes/año, las operaciones dentro de cada cuenta) y recalcula el TOTAL. */
export function aplicarFiltros(filas: Fila[], x: Filtros): { filas: Fila[]; total: Record<number, number> } {
  const out = filas.flatMap((f) => {
    if (f.clase !== "CUENTA") return pasa(f, x) ? [f] : [];
    const hijos = (f.hijos ?? []).filter((h) => pasa(h, x));
    return hijos.length ? [{ ...f, hijos, mov: sumar(hijos, "mov"), pend: sumar(hijos, "pend") }] : [];
  });
  return { filas: out, total: sumar(out.filter((f) => f.suma), "mov") };
}

export function BarraFiltros({ value, onChange }: { value: Filtros; onChange: (f: Filtros) => void }) {
  return (
    <Group gap={8} wrap="wrap" align="flex-end">
      <TextInput size="xs" leftSection={<Search size={13} />} placeholder="Buscar concepto, contacto, cuenta o TES-…" aria-label="Buscar"
        value={value.texto} onChange={(e) => onChange({ ...value, texto: e.currentTarget.value })} style={{ minWidth: 260, flex: "1 1 260px", maxWidth: 380 }} />
      <MultiSelect size="xs" placeholder={value.tipos.length ? undefined : "Tipo de operación"} aria-label="Tipo de operación" clearable
        data={[...TIPOS.map((t) => ({ value: t, label: TIPO_LABEL[t] })), { value: "EXTERNO", label: "Cargado en Odoo" }]}
        value={value.tipos} onChange={(tipos) => onChange({ ...value, tipos })} style={{ minWidth: 220, maxWidth: 420 }} />
      <Select size="xs" placeholder="Estado" aria-label="Estado" clearable data={ESTADOS}
        value={value.estado} onChange={(estado) => onChange({ ...value, estado })} style={{ minWidth: 200 }} />
      {hayFiltros(value) && (
        <Button size="xs" variant="subtle" color="gray" leftSection={<X size={13} />} onClick={() => onChange(SIN_FILTROS)}>Limpiar filtros</Button>
      )}
    </Group>
  );
}
