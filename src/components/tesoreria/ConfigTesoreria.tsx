"use client";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Checkbox, Group, MultiSelect, Select, Text } from "@mantine/core";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useTesoreriaConfig, type ConfigResponse } from "@/hooks/useTesoreriaConfig";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Fijos = Record<string, number | null>;

const SECTION = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 } as const;
const H2 = { fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: "var(--text)" } as const;

/** Configuración de Tesorería (solo ADMIN). Se muestra como pestaña de Configuración. */
export function ConfigTesoreria() {
  const { data, isLoading, error } = useTesoreriaConfig(true);
  if (isLoading) return <LoadingSpinner size={20} label="Cargando configuración…" />;
  if (error || !data?.odoo) {
    return <Alert color="red">{data?.error ?? (error as Error)?.message ?? "No se pudo cargar la configuración"}</Alert>;
  }
  return <ConfigForm data={data as ConfigResponse & { odoo: NonNullable<ConfigResponse["odoo"]> }} />;
}

function ConfigForm({ data }: { data: ConfigResponse & { odoo: NonNullable<ConfigResponse["odoo"]> } }) {
  const qc = useQueryClient();
  const c = data.config;
  const toStr = (xs: number[]) => xs.map(String);

  // Estado inicial: lo guardado o, si está vacío, lo sugerido a partir de Odoo
  const [diarios, setDiarios] = useState<number[]>(() => c.diarios.map((d) => d.odooJournalId));
  const [cuentas, setCuentas] = useState(() => ({
    GASTO: toStr(c.cuentas.GASTO.length ? c.cuentas.GASTO.map((x) => x.odooAccountId) : data.sugeridas?.gasto ?? []),
    INGRESO: toStr(c.cuentas.INGRESO.length ? c.cuentas.INGRESO.map((x) => x.odooAccountId) : data.sugeridas?.ingreso ?? []),
    SOCIO: toStr(c.cuentas.SOCIO.length ? c.cuentas.SOCIO.map((x) => x.odooAccountId) : data.sugeridas?.socio ?? []),
  }));
  const [fijos, setFijos] = useState<Fijos>(() => {
    const f: Fijos = { ...c.fijos };
    for (const [k, v] of Object.entries(data.defaults ?? {})) if (f[k] == null) f[k] = v ?? null;
    return f;
  });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const odoo = data.odoo;
  const cuentaOpts = useMemo(() => odoo.cuentas.map((x) => ({ value: String(x.id), label: `${x.codigo} ${x.nombre}` })), [odoo]);
  const diarioOdoo = useMemo(() => new Map(odoo.diarios.map((d) => [d.id, d])), [odoo]);
  const invalidos = c.diarios.filter((d) => !diarioOdoo.has(d.odooJournalId));
  const disponibles = odoo.diarios.filter((d) => !diarios.includes(d.id));

  const mover = (i: number, d: -1 | 1) =>
    setDiarios((xs) => {
      const ys = [...xs];
      const j = i + d;
      if (j < 0 || j >= ys.length) return xs;
      [ys[i], ys[j]] = [ys[j], ys[i]];
      return ys;
    });

  async function guardar() {
    setGuardando(true);
    setMsg(null);
    const r = await fetch("/api/tesoreria/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diarios,
        cuentas: { GASTO: cuentas.GASTO.map(Number), INGRESO: cuentas.INGRESO.map(Number), SOCIO: cuentas.SOCIO.map(Number) },
        fijos,
      }),
    });
    const body = await r.json().catch(() => ({}));
    setGuardando(false);
    if (!r.ok) return setMsg({ ok: false, text: body.error ?? "No se pudo guardar" });
    setMsg({ ok: true, text: "Configuración guardada" });
    qc.invalidateQueries({ queryKey: ["tesoreria"] });
  }

  const cuentaSelect = (k: string, label: string) => (
    <Select
      label={label}
      data={cuentaOpts}
      value={fijos[k] != null ? String(fijos[k]) : null}
      onChange={(v) => setFijos((f) => ({ ...f, [k]: v ? Number(v) : null }))}
      searchable
      clearable
      placeholder="Elegir cuenta…"
    />
  );
  const diarioSelect = (k: string, label: string, opts: { id: number; nombre: string }[]) => (
    <Select
      label={label}
      data={opts.map((d) => ({ value: String(d.id), label: d.nombre }))}
      value={fijos[k] != null ? String(fijos[k]) : null}
      onChange={(v) => setFijos((f) => ({ ...f, [k]: v ? Number(v) : null }))}
      clearable
      placeholder="Elegir diario…"
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Diarios y cuentas de Odoo que usa Tesorería.</Text>
        <Button onClick={guardar} loading={guardando}>Guardar</Button>
      </Group>

      {msg && <Alert color={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      {invalidos.length > 0 && (
        <Alert color="yellow">
          Diarios que ya no están disponibles en Odoo (se dejan de ofrecer): {invalidos.map((d) => d.nombre).join(", ")}
        </Alert>
      )}

      <section style={SECTION}>
        <h2 style={H2}>Diarios habilitados</h2>
        <Text size="xs" c="dimmed" mb={12}>Son las columnas de la Vista General, en este orden, y los únicos que se ofrecen en las operaciones. Solo diarios en pesos.</Text>
        {diarios.length === 0 && <Text size="sm" c="dimmed" mb={8}>Ningún diario habilitado.</Text>}
        {diarios.map((id, i) => (
          <Group key={id} justify="space-between" py={4} style={{ borderBottom: "1px solid var(--border)" }}>
            <Checkbox checked label={`${diarioOdoo.get(id)?.nombre ?? `Diario ${id} (no disponible)`}`} onChange={() => setDiarios((xs) => xs.filter((x) => x !== id))} />
            <Group gap={2}>
              <Button variant="subtle" color="gray" size="compact-xs" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp size={14} /></Button>
              <Button variant="subtle" color="gray" size="compact-xs" onClick={() => mover(i, 1)} disabled={i === diarios.length - 1} aria-label="Bajar"><ArrowDown size={14} /></Button>
            </Group>
          </Group>
        ))}
        {disponibles.length > 0 && (
          <>
            <Text size="xs" c="dimmed" mt={12} mb={4}>Disponibles en Odoo</Text>
            {disponibles.map((d) => (
              <Checkbox key={d.id} py={3} checked={false} label={d.nombre} onChange={() => setDiarios((xs) => [...xs, d.id])} />
            ))}
          </>
        )}
      </section>

      <section style={SECTION}>
        <h2 style={H2}>Cuentas por operación</h2>
        <Text size="xs" c="dimmed" mb={12}>
          {data.sugeridas ? "Precargadas con las cuentas usadas en los diarios de tesorería. Revisalas y guardá." : "Cuentas que se ofrecen en cada operación."}
        </Text>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(["GASTO", "INGRESO", "SOCIO"] as const).map((u) => (
            <MultiSelect
              key={u}
              label={{ GASTO: "Gasto", INGRESO: "Ingreso", SOCIO: "Retiro / Depósito de socios" }[u]}
              data={cuentaOpts}
              value={cuentas[u]}
              onChange={(v) => setCuentas((c) => ({ ...c, [u]: v }))}
              searchable
              placeholder="Agregar cuenta…"
            />
          ))}
        </div>
      </section>

      <section style={SECTION}>
        <h2 style={H2}>Cuentas y diarios fijos</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 8 }}>
          {cuentaSelect("cuentaGananciaId", "Ganancia del cambio de cheques")}
          {cuentaSelect("cuentaPerdidaId", "Pérdida / interés del cambio de cheques")}
          {cuentaSelect("cuentaPuenteId", "Cuenta puente de movimientos")}
          {diarioSelect("diarioAjustesId", "Diario de ajustes", odoo.generales.filter((g) => g.tipo === "general"))}
          {diarioSelect("diarioComprasId", "Diario de compras con comprobantes (factura A)", odoo.generales.filter((g) => g.tipo === "purchase"))}
          {diarioSelect("diarioComprasSinDocId", "Diario de compras sin comprobantes (factura B y C)", odoo.generales.filter((g) => g.tipo === "purchase"))}
          {diarioSelect("diarioEfectivoDefaultId", "Diario de efectivo por defecto", odoo.diarios.filter((d) => d.tipo === "EFECTIVO"))}
        </div>
      </section>
    </div>
  );
}
