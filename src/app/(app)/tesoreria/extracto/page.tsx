"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Checkbox, Group, SegmentedControl, Select, Text } from "@mantine/core";
import { ChevronLeft, ChevronRight, ExternalLink, Eye } from "lucide-react";
import { useTesoreriaCatalogos, useTesoreriaExtracto } from "@/hooks/useTesoreria";
import { fmt, rango, round2, sumarDias, type Periodo } from "@/lib/tesoreria";
import type { FilaExtracto } from "@/lib/tesoreriaExtracto";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { DateRangeInput } from "@/components/ui/DateRangeInput";
import { MONO, Monto } from "@/components/tesoreria/comunes";
import { DialogoOperacion } from "@/components/tesoreria/DialogoOperacion";
import { mover, PestanasTesoreria, tituloPeriodo, useParamsTesoreria, type ParamsTesoreria } from "@/components/tesoreria/Navegacion";

const TH: React.CSSProperties = { padding: "8px", fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text3)", textAlign: "left", borderBottom: "1px solid var(--border2)", whiteSpace: "nowrap", background: "var(--surface)", position: "sticky", top: 0, zIndex: 2 };
const TD: React.CSSProperties = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid var(--border)", verticalAlign: "top" };
const PIE: React.CSSProperties = { ...TD, fontWeight: 700, background: "var(--surface)", borderTop: "1px solid var(--border2)" };
// Fecha fija al hacer scroll horizontal (celular)
const FIJA: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1, background: "var(--bg)" };
const NUM: React.CSSProperties = { textAlign: "right", whiteSpace: "nowrap" };

const fechaAR = (f: string) => f.split("-").reverse().join("/");
const Saldo = ({ v }: { v: number }) => <span style={{ ...MONO, whiteSpace: "nowrap" }}>{fmt(v)}</span>;

export default function ExtractoPage({ searchParams }: { searchParams: Promise<ParamsTesoreria> }) {
  const router = useRouter();
  const qc = useQueryClient();
  const params = use(searchParams);
  const { hoy, periodo, fecha, diario: diarioUrl, ir } = useParamsTesoreria(params);
  const [soloSinConciliar, setSoloSinConciliar] = useState(false);
  const [opAbierta, setOpAbierta] = useState<number | null>(null);
  const { data: cat } = useTesoreriaCatalogos();
  const diarios = cat?.diarios ?? [];
  const diario = diarios.some((d) => d.odooJournalId === diarioUrl) ? diarioUrl : diarios[0]?.odooJournalId;

  // Rango personalizado (?periodo=rango&desde=&hasta=); si no, el rango del período Día / Mes / Año
  const fechaOk = (f?: string): f is string => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy;
  const personalizado = params.periodo === "rango" && fechaOk(params.desde) && fechaOk(params.hasta) && params.desde <= params.hasta;
  const { desde, hasta } = personalizado ? { desde: params.desde!, hasta: params.hasta! } : rango(periodo, fecha);
  const largo = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5) + 1;
  const irRango = (d: string, h: string, dia = diario) => {
    const q = new URLSearchParams({ periodo: "rango", desde: d, hasta: h });
    if (dia) q.set("diario", String(dia));
    router.replace(`/tesoreria/extracto?${q}`, { scroll: false });
  };
  const correr = (s: -1 | 1) => (personalizado ? irRango(sumarDias(desde, s * largo), sumarDias(hasta, s * largo)) : ir({ fecha: mover(periodo, fecha, s) }));
  const sinSiguiente = personalizado ? sumarDias(hasta, largo) > hoy : mover(periodo, fecha, 1) > hoy;
  const titulo = personalizado ? `del ${fechaAR(desde)} al ${fechaAR(hasta)}` : `en ${tituloPeriodo(periodo, fecha)}`;

  const { data: ext, isLoading, isPlaceholderData, error } = useTesoreriaExtracto(diario, desde, hasta);

  // Sin return temprano: la estructura queda y el spinner va en el lugar de la tabla
  const cargando = !cat || (!!diario && (isLoading || isPlaceholderData));
  const odooOk = cat?.odooDisponible !== false && ext?.odooDisponible !== false;
  const filas = ext ? (soloSinConciliar ? ext.filas.filter((f) => !f.conciliado) : ext.filas) : [];
  const total = round2(filas.reduce((a, f) => a + f.importe, 0));

  const abrir = (f: FilaExtracto) => {
    if (f.operacionId) setOpAbierta(f.operacionId);
    else if (ext && f.moveId) window.open(`${ext.odooUrl}/odoo/account.move/${f.moveId}`, "_blank", "noopener");
  };

  return (
    <div className="page-pad" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      {/* Las otras vistas no entienden rangos: con rango personalizado van al día "hasta" */}
      <PestanasTesoreria periodo={personalizado ? "dia" : periodo} fecha={personalizado ? hasta : fecha} />
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Vista Extracto</h2>
        <Text size="xs" c="dimmed">Movimientos de un diario con su saldo y conciliación.</Text>
      </div>

      {cat && !diarios.length && <Alert color="yellow" p={8}><Text size="sm">Tesorería no tiene diarios habilitados.</Text></Alert>}
      {!odooOk && (
        <Alert color="red" p={8}>
          <Group justify="space-between" gap={8}>
            <Text size="sm">Odoo no está disponible. No se pueden ver los movimientos ni los saldos.</Text>
            <Button size="xs" variant="default" onClick={() => qc.invalidateQueries({ queryKey: ["tesoreria"] })}>Reintentar</Button>
          </Group>
        </Alert>
      )}
      {error && <Alert color="red" p={8}>{(error as Error).message}</Alert>}

      <Group gap={8} wrap="wrap">
        <Select size="xs" aria-label="Diario" w={220} allowDeselect={false} value={diario ? String(diario) : null}
          data={diarios.map((d) => ({ value: String(d.odooJournalId), label: d.nombre }))}
          onChange={(v) => v && (personalizado ? irRango(desde, hasta, Number(v)) : ir({ diario: Number(v) }))} />
        <Group gap={2}>
          <Button variant="default" size="xs" px={6} aria-label="Anterior" onClick={() => correr(-1)}><ChevronLeft size={14} /></Button>
          <DateRangeInput size="xs" aria-label="Rango de fechas" w={200} value={[desde, hasta]} maxDate={hoy} onChange={(d, h) => irRango(d, h)} />
          <Button variant="default" size="xs" px={6} aria-label="Siguiente" disabled={sinSiguiente} onClick={() => correr(1)}><ChevronRight size={14} /></Button>
        </Group>
        <SegmentedControl size="xs" value={personalizado ? "" : periodo} onChange={(v) => ir({ periodo: v as Periodo, fecha: personalizado ? hasta : fecha })}
          data={[{ value: "dia", label: "Día" }, { value: "mes", label: "Mes" }, { value: "anio", label: "Año" }]} />
        <Checkbox size="xs" label="Solo sin conciliar" checked={soloSinConciliar} onChange={(e) => setSoloSinConciliar(e.currentTarget.checked)} />
      </Group>
      {ext?.truncado && <Alert color="yellow" p={8}><Text size="sm">El período tiene demasiados movimientos: se muestran los primeros. Elegí un período más corto.</Text></Alert>}

      {cargando ? <LoadingSpinner size={20} label="Cargando extracto…" /> : ext && odooOk && (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ ...TH, ...FIJA, zIndex: 3, background: "var(--surface)", width: 100 }}>Fecha</th>
                <th style={TH}>Etiqueta</th>
                <th style={TH}>Contacto</th>
                <th style={{ ...TH, ...NUM }}>Importe</th>
                <th style={{ ...TH, ...NUM }}>Balance</th>
                <th style={{ ...TH, textAlign: "center", width: 90 }}>Conciliado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...TD, ...FIJA, color: "var(--text2)" }}>{fechaAR(ext.desde)}</td>
                <td style={{ ...TD, color: "var(--text2)" }} colSpan={3}>Saldo inicial</td>
                <td style={{ ...TD, ...NUM }}><Saldo v={ext.saldoInicial} /></td>
                <td style={TD} />
              </tr>
              {!filas.length && (
                <tr><td colSpan={6} style={{ ...TD, textAlign: "center", color: "var(--text3)", padding: 32 }}>
                  {soloSinConciliar && ext.filas.length ? "No hay movimientos sin conciliar." : `Sin movimientos ${titulo}.`}
                </td></tr>
              )}
              {filas.map((f) => (
                <tr key={f.key}>
                  <td style={{ ...TD, ...FIJA }}>{fechaAR(f.fecha)}</td>
                  <td style={TD}>
                    <button type="button" onClick={() => abrir(f)} title={f.operacionId ? "Ver detalle" : "Abrir en Odoo"}
                      style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", textAlign: "left", padding: 0, font: "inherit", display: "inline-flex", gap: 6, alignItems: "flex-start" }}>
                      {f.operacionId ? <Eye size={14} color="var(--text2)" style={{ flexShrink: 0, marginTop: 2 }} /> : <ExternalLink size={14} color="var(--text2)" style={{ flexShrink: 0, marginTop: 2 }} />}
                      <span>{f.etiqueta}</span>
                    </button>
                    {f.clase === "EXTERNO" && <Badge size="xs" ml={6} variant="light" color="violet">Cargado en Odoo</Badge>}
                  </td>
                  <td style={TD}>{f.contacto}</td>
                  <td style={{ ...TD, ...NUM }}><Monto v={f.importe} /></td>
                  <td style={{ ...TD, ...NUM }}><Saldo v={f.balance} /></td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700, color: f.conciliado ? (f.importe < 0 ? "var(--red)" : "var(--green)") : "var(--text3)" }}
                    aria-label={f.conciliado ? "Conciliado" : "Sin conciliar"}>
                    {f.conciliado ? "✓" : "✗"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...PIE, ...FIJA, background: "var(--surface)" }}>TOTAL</td>
                <td style={PIE} colSpan={2}>{soloSinConciliar && <Text span size="xs" c="dimmed" fw={400}>(sin conciliar)</Text>}</td>
                <td style={{ ...PIE, ...NUM }}>{total ? <Monto v={total} /> : <Saldo v={0} />}</td>
                <td style={{ ...PIE, ...NUM }}><Saldo v={ext.saldoFinal} /></td>
                <td style={PIE} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {opAbierta && (
        <DialogoOperacion
          key={opAbierta}
          operacionId={opAbierta}
          fila={null}
          diarios={diarios}
          siguiendo={false}
          odooDisponible={odooOk}
          onEditar={(op) => router.push(`/tesoreria?periodo=dia&fecha=${op.fechaContable}`)}
          onClose={() => setOpAbierta(null)}
        />
      )}
      <Text size="xs" c="dimmed">Un clic en la etiqueta abre el detalle de la operación; si se cargó fuera de la app, abre el asiento en Odoo.</Text>
    </div>
  );
}
