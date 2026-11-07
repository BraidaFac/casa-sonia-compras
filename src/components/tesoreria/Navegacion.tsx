"use client";
// Navegación compartida de Vista General y Vista Extracto: período en la URL, controles de período y pestañas.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Group, SegmentedControl, TextInput } from "@mantine/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hoyAR, sumarDias } from "@/lib/tesoreria";
import type { Periodo } from "@/lib/tesoreriaVista";
import { FechaInput } from "@/components/tesoreria/comunes";

export type ParamsTesoreria = { periodo?: string; fecha?: string; diario?: string; desde?: string; hasta?: string };

export function mover(periodo: Periodo, fecha: string, d: -1 | 1): string {
  if (periodo === "dia") return sumarDias(fecha, d);
  const [y, m] = fecha.split("-").map(Number);
  if (periodo === "mes") {
    const nm = m + d;
    const yy = y + Math.floor((nm - 1) / 12);
    const mm = ((nm - 1) % 12 + 12) % 12 + 1;
    return `${yy}-${String(mm).padStart(2, "0")}-01`;
  }
  return `${y + d}-01-01`;
}

export function tituloPeriodo(periodo: Periodo, fecha: string) {
  const [y, m, dd] = fecha.split("-").map(Number);
  if (periodo === "anio") return String(y);
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return periodo === "mes" ? `${meses[m - 1]} ${y}` : `${String(dd).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Período, fecha y diario leídos de la URL; `ir` cambia uno o varios a la vez (sin futuros). */
export function useParamsTesoreria(params: ParamsTesoreria) {
  const router = useRouter();
  const pathname = usePathname();
  const hoy = hoyAR();
  const periodo: Periodo = params.periodo === "mes" || params.periodo === "anio" ? params.periodo : "dia";
  const fecha = params.fecha && /^\d{4}-\d{2}-\d{2}$/.test(params.fecha) && params.fecha <= hoy ? params.fecha : hoy;
  const diario = Number(params.diario) || undefined;
  const ir = (c: { periodo?: Periodo; fecha?: string; diario?: number }) => {
    const q = new URLSearchParams({ periodo: c.periodo ?? periodo, fecha: c.fecha ?? fecha });
    const d = c.diario ?? diario;
    if (d) q.set("diario", String(d));
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  return { hoy, periodo, fecha, diario, ir };
}

export function NavPeriodo({ periodo, fecha, hoy, ir }: { periodo: Periodo; fecha: string; hoy: string; ir: (c: { periodo?: Periodo; fecha?: string }) => void }) {
  return (
    <>
      <Group gap={2}>
        <Button variant="default" size="xs" px={6} aria-label="Anterior" onClick={() => ir({ fecha: mover(periodo, fecha, -1) })}><ChevronLeft size={14} /></Button>
        {periodo === "dia" ? (
          <FechaInput ariaLabel="Fecha contable" value={fecha} max={hoy} w={140} onChange={(v) => v && v <= hoy && ir({ fecha: v })} />
        ) : (
          <TextInput size="xs" aria-label="Período" value={tituloPeriodo(periodo, fecha)} readOnly styles={{ input: { width: 140, textAlign: "center" } }} />
        )}
        <Button variant="default" size="xs" px={6} aria-label="Siguiente" disabled={mover(periodo, fecha, 1) > hoy} onClick={() => ir({ fecha: mover(periodo, fecha, 1) })}><ChevronRight size={14} /></Button>
      </Group>
      <SegmentedControl size="xs" value={periodo} onChange={(v) => ir({ periodo: v as Periodo })} data={[{ value: "dia", label: "Día" }, { value: "mes", label: "Mes" }, { value: "anio", label: "Año" }]} />
    </>
  );
}

/** Título fijo "Tesorería" y pestañas Vista General / Extracto / Resumen PN; conservan período y fecha. */
export function PestanasTesoreria({ periodo, fecha }: { periodo: Periodo; fecha: string }) {
  const pathname = usePathname();
  const q = `?periodo=${periodo}&fecha=${fecha}`;
  const tabs = [{ href: "/tesoreria", label: "Vista General" }, { href: "/tesoreria/extracto", label: "Extracto" }, { href: "/tesoreria/resumen", label: "Resumen PN" }];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text)" }}>Tesorería</h1>
    <Group gap={4} style={{ borderBottom: "1px solid var(--border)" }}>
      {tabs.map((t) => {
        const activa = pathname === t.href;
        return (
          <Link key={t.href} href={`${t.href}${q}`} style={{ padding: "6px 12px", fontSize: 13, fontWeight: activa ? 600 : 400, color: activa ? "var(--text)" : "var(--text2)", borderBottom: `2px solid ${activa ? "var(--accent)" : "transparent"}`, marginBottom: -1, textDecoration: "none" }}>
            {t.label}
          </Link>
        );
      })}
    </Group>
    </div>
  );
}
