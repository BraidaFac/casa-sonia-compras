"use client";
import { Alert, Button, Group, Text } from "@mantine/core";
import { columnasPara, fmt, lineasFactura, repartoFactura, resumen, TIPO_LABEL } from "@/lib/tesoreria";
import { colorReparto } from "./DialogosCuentas";
import type { Catalogos } from "@/hooks/useTesoreria";
import { FechaInput } from "./comunes";
import { FilaEditor, type Borrador } from "./FilaEditor";
import { EstiloOcultas, MenuColumnas, useOcultas } from "./anchos";

const TH: React.CSSProperties = { padding: "8px", fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text2)", textAlign: "left", borderBottom: "1px solid var(--border2)", borderRight: "1px solid var(--border)", background: "var(--surface)", verticalAlign: "bottom", lineHeight: 1.3, overflowWrap: "anywhere" };
const ETIQUETA: React.CSSProperties = { fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 };
const ANCHO: Record<string, number> = { concepto: 260, contacto: 210, cuenta: 240 };
const ANCHO_DIARIO = 140;

/**
 * Operación en carga: cabecera (tipo, fecha contable, acciones), la fila con sus propias columnas
 * y el resumen al pie, todo en un mismo recuadro arriba de la grilla.
 */
export function PanelOperacion({ edit, setEdit, cat, hoy, errorEdit, guardando, confirmando, odooOk, duplicado, error, onCancel, onGuardar, onConfirmar, onVerDuplicado, onDescartarDuplicado }: {
  edit: Borrador;
  setEdit: (b: Borrador) => void;
  cat: Catalogos;
  hoy: string;
  errorEdit: string | null;
  guardando: boolean;
  confirmando: boolean;
  odooOk: boolean;
  duplicado: number | null;
  error: string | null;
  onCancel: () => void;
  onGuardar: () => void;
  onConfirmar: (aceptarDuplicado: boolean) => void;
  onVerDuplicado: (id: number) => void;
  onDescartarDuplicado: () => void;
}) {
  const columnas = columnasPara(edit.tipo, edit.datos, cat.diarios);
  const nombreDiario = (id?: number) => cat.diarios.find((x) => x.odooJournalId === id)?.nombre ?? "";
  const { ocultas, alternar } = useOcultas("tesoreria.ocultas.carga");
  // Concepto no se oculta; los importes cargados en una columna oculta se conservan
  const claves = ["concepto", "contacto", "cuenta", ...columnas.map((c) => `d-${c.odooJournalId}`)];
  const titulo = (k: string) => (k === "contacto" ? "Contacto" : k === "cuenta" ? "Cuenta / detalle" : columnas.find((c) => `d-${c.odooJournalId}` === k)?.nombre ?? k);
  const visibles = claves.filter((k) => !ocultas.includes(k));
  const ancho = visibles.reduce((a, k) => a + (ANCHO[k] ?? ANCHO_DIARIO), 0);
  const fc = edit.tipo === "GASTO" ? edit.datos.factura : null;
  const reparto = fc ? repartoFactura(fc, lineasFactura(edit.datos), edit.datos.diarios ?? []) : null;

  return (
    <section aria-label="Operación en carga" style={{ border: "1px solid var(--accent2)", borderRadius: 10, background: "var(--surface2)", overflow: "hidden" }}>
      {/* Cabecera */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <Group justify="space-between" wrap="wrap" gap={12}>
          <Group gap={16} wrap="wrap" align="flex-end">
            <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 10 }}>
              <Text style={{ ...ETIQUETA, color: "var(--accent)" }}>{edit.id ? `Borrador TES-${edit.id}` : "Nueva operación"}</Text>
              <Text style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{TIPO_LABEL[edit.tipo]}</Text>
            </div>
            <div>
              <Text style={{ ...ETIQUETA, color: "var(--text2)", marginBottom: 2 }}>Fecha contable</Text>
              <FechaInput ariaLabel="Fecha contable" value={edit.fechaContable} max={hoy} w={140}
                onChange={(v) => v && v <= hoy && setEdit({ ...edit, fechaContable: v })} />
            </div>
            {fc && reparto && (
              <div>
                <Text style={{ ...ETIQUETA, color: "var(--text2)", marginBottom: 2 }}>Factura fiscal</Text>
                <Text size="sm" style={{ color: "var(--text)", lineHeight: "30px" }}>
                  {fc.letra} {fc.numero || "sin número"} ·{" "}
                  <Text span c={colorReparto(reparto)} fw={700} style={{ fontFamily: "var(--font-mono)" }}
                    title={reparto.saldo > 0 ? `Queda con saldo $ ${fmt(reparto.saldo)}` : reparto.excedentes.length ? "El gasto supera a la factura" : "Coincide con los gastos"}>
                    $ {fmt(reparto.total)}
                  </Text>
                </Text>
              </div>
            )}
          </Group>
          <Group gap={6}>
            <MenuColumnas columnas={claves.slice(1).map((k) => ({ clave: k, titulo: titulo(k) }))} ocultas={ocultas} onAlternar={alternar} />
            <Button size="sm" variant="default" disabled={guardando} onClick={onCancel}>Cancelar</Button>
            <Button size="sm" variant="light" loading={guardando && !confirmando} disabled={guardando} onClick={onGuardar}>Guardar borrador</Button>
            <Button size="sm" loading={confirmando} disabled={guardando || !!errorEdit || !odooOk} onClick={() => onConfirmar(false)}>Confirmar</Button>
          </Group>
        </Group>
      </div>

      {/* Fila de carga con sus columnas */}
      <div style={{ overflowX: "auto", background: "var(--bg)" }}>
        <EstiloOcultas grilla="carga" claves={claves} ocultas={ocultas} />
        <table data-grilla="carga" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: "100%", minWidth: ancho }}>
          <colgroup>
            {visibles.map((k) => <col key={k} style={{ width: ANCHO[k] ?? ANCHO_DIARIO }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={TH}>Concepto</th>
              <th style={TH}>Contacto</th>
              <th style={TH}>Cuenta / detalle</th>
              {columnas.map((c) => <th key={c.odooJournalId} style={{ ...TH, textAlign: "right" }}>{c.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            <FilaEditor key={edit.id ?? "nueva"} b={edit} setB={setEdit} cat={cat} columnas={columnas} sugerido={edit.id ? null : cat.fijos.diarioEfectivoDefaultId} />
          </tbody>
        </table>
      </div>

      {/* Resumen y avisos */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
        <Text size="sm" style={{ color: "var(--text)" }}>
          {resumen(edit.tipo, edit.datos, edit.contactoNombre, nombreDiario).map((x, i) => (
            <span key={i} style={x.tono ? { color: x.tono === "sale" ? "var(--red)" : "var(--green)", fontWeight: 600 } : undefined}>{x.t}</span>
          ))}
        </Text>
        {errorEdit && !confirmando && <Text size="xs" style={{ color: "var(--red)" }}>Para confirmar: {errorEdit}</Text>}
        {duplicado && (
          <Alert color="yellow" mt={4} p={8}>
            <Group gap={8} wrap="wrap">
              <Text size="xs">Posible duplicado: ya hay una operación igual (mismo tipo, contacto, importe y día), TES-{duplicado}.</Text>
              <Button size="compact-xs" variant="subtle" onClick={() => onVerDuplicado(duplicado)}>Ver la existente</Button>
              <Button size="compact-xs" onClick={() => onConfirmar(true)}>Confirmar igual</Button>
              <Button size="compact-xs" variant="default" onClick={onDescartarDuplicado}>Volver</Button>
            </Group>
          </Alert>
        )}
        {error && <Alert color="red" mt={4} p={8}><Text size="xs">{error}</Text></Alert>}
      </div>
    </section>
  );
}
