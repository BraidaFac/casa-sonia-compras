"use client";
import { use } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Group, Text } from "@mantine/core";
import { useTesoreriaResumen } from "@/hooks/useTesoreria";
import { fmt } from "@/lib/tesoreria";
import type { Saldos } from "@/lib/tesoreriaResumen";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { MONO } from "@/components/tesoreria/comunes";
import { NavPeriodo, PestanasTesoreria, useParamsTesoreria, type ParamsTesoreria } from "@/components/tesoreria/Navegacion";

const TH: React.CSSProperties = { padding: "8px", fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text3)", textAlign: "right", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap", background: "var(--surface)" };
const TD: React.CSSProperties = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" };
// Nombre fijo al hacer scroll horizontal (celular)
const NOMBRE: React.CSSProperties = { textAlign: "left", position: "sticky", left: 0, zIndex: 1, background: "var(--bg)" };
const PIE: React.CSSProperties = { fontWeight: 700, background: "var(--surface)", borderTop: "1px solid var(--border2)" };

/** Importe con signo: rojo negativo, verde positivo; el 0 se muestra como 0,00. */
const Importe = ({ v }: { v: number }) => (
  <span style={{ ...MONO, color: v < 0 ? "var(--red)" : v > 0 ? "var(--green)" : "var(--text2)" }}>{fmt(v || 0)}</span>
);
const Celdas = ({ s, estilo }: { s: Saldos; estilo?: React.CSSProperties }) => (
  <>
    <td style={{ ...TD, ...estilo }}><Importe v={s.inicio} /></td>
    <td style={{ ...TD, ...estilo }}><Importe v={s.movimientos} /></td>
    <td style={{ ...TD, ...estilo }}><Importe v={s.final} /></td>
  </>
);

export default function ResumenPage({ searchParams }: { searchParams: Promise<ParamsTesoreria> }) {
  const qc = useQueryClient();
  const { hoy, periodo, fecha, ir } = useParamsTesoreria(use(searchParams));
  const { data: res, isLoading, isPlaceholderData, error } = useTesoreriaResumen(periodo, fecha);
  const odooOk = res?.odooDisponible !== false;

  return (
    <div className="page-pad" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <PestanasTesoreria periodo={periodo} fecha={fecha} />
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Resumen PN</h2>
        <Text size="xs" c="dimmed">Posición neta: saldo de cada diario menos los cheques propios sin debitar.</Text>
      </div>

      {!odooOk && (
        <Alert color="red" p={8}>
          <Group justify="space-between" gap={8}>
            <Text size="sm">Odoo no está disponible. No se pueden ver los saldos.</Text>
            <Button size="xs" variant="default" onClick={() => qc.invalidateQueries({ queryKey: ["tesoreria"] })}>Reintentar</Button>
          </Group>
        </Alert>
      )}
      {error && <Alert color="red" p={8}>{(error as Error).message}</Alert>}

      <Group gap={8} wrap="wrap"><NavPeriodo periodo={periodo} fecha={fecha} hoy={hoy} ir={ir} /></Group>

      {isLoading || isPlaceholderData ? <LoadingSpinner size={20} label="Cargando saldos…" /> : res && odooOk && (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 520 }}>
            <thead>
              <tr>
                <th style={{ ...TH, ...NOMBRE, zIndex: 2, background: "var(--surface)" }}>Diario</th>
                <th style={TH}>Saldo al inicio</th>
                <th style={TH}>Movimientos</th>
                <th style={TH}>Saldo al final</th>
              </tr>
            </thead>
            <tbody>
              {!res.filas.length && (
                <tr><td colSpan={4} style={{ ...TD, textAlign: "center", color: "var(--text3)", padding: 32 }}>Tesorería no tiene diarios habilitados.</td></tr>
              )}
              {res.filas.map((f) => (
                <tr key={f.diarioId}>
                  <td style={{ ...TD, ...NOMBRE }}>
                    <Link href={`/tesoreria/extracto?diario=${f.diarioId}&periodo=${periodo}&fecha=${fecha}`} title="Ver extracto" style={{ color: "var(--text)", textDecoration: "none" }}>{f.nombre}</Link>
                  </td>
                  <Celdas s={f} />
                </tr>
              ))}
              <tr>
                <td style={{ ...TD, ...NOMBRE, color: "var(--text2)" }} title="Cheques propios entregados y todavía no debitados">Cheques Propios</td>
                <Celdas s={res.cheques} />
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...TD, ...NOMBRE, ...PIE }}>Total</td>
                <Celdas s={res.total} estilo={PIE} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <Text size="xs" c="dimmed">Un clic en un diario abre su extracto del mismo período.</Text>
    </div>
  );
}
