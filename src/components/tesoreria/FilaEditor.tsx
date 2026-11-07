"use client";
import { useState } from "react";
import { ActionIcon, Button, Group, Menu, SegmentedControl, Select, Text, Tooltip } from "@mantine/core";
import { EllipsisVertical, FileText, ListPlus, Paperclip, Receipt } from "lucide-react";
import {
  diferenciaCambio,
  efecto,
  fmt,
  lineasFactura,
  round2,
  sum,
  totalFactura,
  totalMedio,
  type ChequePropio,
  type Datos,
  type DiarioCfg,
  type LineaCuenta,
  type Medio,
  type Tipo,
} from "@/lib/tesoreria";
import { useTesoreriaAdjuntos, type Catalogos } from "@/hooks/useTesoreria";
import { ContactoSelect, ImporteInput, Monto, TextoInput } from "./comunes";
import { ComboBox } from "@/components/ui/ComboBox";
import { DialogoCartera, DialogoChequePropio, DialogoChequesEmitidos, DialogoChequesNuevos } from "./DialogosCheques";
import { DialogoCuentas, DialogoFactura, DialogoImputacion } from "./DialogosCuentas";
import { ClipAdjuntos, type AdjuntoNuevo } from "./Adjuntos";

export type Borrador = {
  id?: number;
  tipo: Tipo;
  fechaContable: string;
  contactoId: number | null;
  contactoNombre: string | null;
  observacion: string;
  datos: Datos;
  adjuntosNuevos?: AdjuntoNuevo[]; // elegidos y todavía no guardados
};

const TD: React.CSSProperties = { padding: "8px", borderRight: "1px solid var(--border)", verticalAlign: "top" };
const CELDA_DIALOGO: React.CSSProperties = { border: "1px dashed var(--border2)", borderRadius: 6, padding: "4px 8px", minWidth: 0, minHeight: 30, background: "none", color: "var(--text2)", cursor: "pointer", fontSize: 12, textAlign: "right", width: "100%" };

/** Cuenta de la configuración → opción del ComboBox de la app. */
const aOpcion = (c: { odooAccountId: number; codigo: string; nombre: string }) => ({ id: c.odooAccountId, name: `${c.codigo} ${c.nombre}` });

const SIN_CONTACTO: Tipo[] = ["MOVIMIENTO", "SOCIOS", "PAGO_CHEQUES_PROPIOS"];

type Dlg =
  | { k: "cartera"; diarioId: number }
  | { k: "nuevos"; diarioId: number }
  | { k: "propio"; diarioId: number }
  | { k: "cuentas"; diarioId: number }
  | { k: "factura" }
  | { k: "emitidos" }
  | { k: "imputar" }
  | null;

export function FilaEditor({ b, setB, cat, columnas, sugerido }: {
  b: Borrador;
  sugerido?: number | null; // diario sugerido (Efectivo Administración): recibe el foco
  setB: (b: Borrador) => void;
  cat: Catalogos;
  columnas: DiarioCfg[];
}) {
  const [dlg, setDlg] = useState<Dlg>(null);
  const [adjDe, setAdjDe] = useState<number | null>(null); // diario con el diálogo de adjuntos abierto
  const [adjFactura, setAdjFactura] = useState(false); // diálogo de adjuntos de la factura abierto
  const { data: adjs } = useTesoreriaAdjuntos(b.id);
  const nAdjFactura = (adjs?.adjuntos ?? []).filter((a) => a.diarioId === null).length + (b.adjuntosNuevos ?? []).filter((n) => n.diarioId === null).length;
  // Al retomar un borrador, arranca con la cuenta de la primera línea cargada
  const [cuentaDefault, setCuentaDefault] = useState<number | null>(() => b.datos.diarios?.flatMap((x) => x.lineas)[0]?.cuentaId ?? null);
  const d = b.datos;
  const setD = (patch: Partial<Datos>) => setB({ ...b, datos: { ...d, ...patch } });
  const nombre = (id?: number) => cat.diarios.find((x) => x.odooJournalId === id)?.nombre ?? "";
  const ef = efecto(b.tipo, d);

  // ── medios (Pago / Cobro): uno por diario y tipo (ej. transferencia + cheque propio del mismo banco) ──
  const medio = (diarioId: number, tipo: Medio["tipo"]) => (d.medios ?? []).find((m) => m.diarioId === diarioId && m.tipo === tipo);
  const setMedio = (diarioId: number, tipo: Medio["tipo"], m: Medio | null) =>
    setD({ medios: [...(d.medios ?? []).filter((x) => !(x.diarioId === diarioId && x.tipo === tipo)), ...(m && totalMedio(m) > 0 ? [m] : [])] });

  // ── líneas de cuenta por diario (Gasto / Ingreso) ──
  const cuentasLista = b.tipo === "GASTO" ? cat.cuentas.GASTO : cat.cuentas.INGRESO;
  const diarioDe = (diarioId: number) => (d.diarios ?? []).find((x) => x.diarioId === diarioId);
  const lineas = (diarioId: number) => diarioDe(diarioId)?.lineas ?? [];
  const chequesPropios = (diarioId: number) => diarioDe(diarioId)?.cheques ?? [];
  const setDiario = (diarioId: number, patch: { lineas?: LineaCuenta[]; cheques?: ChequePropio[] }) => {
    const x = { ...(diarioDe(diarioId) ?? { diarioId, lineas: [] }), ...patch };
    if (!x.cheques?.length) delete x.cheques;
    const queda = x.lineas.length || x.cheques?.length;
    setD({ diarios: [...(d.diarios ?? []).filter((y) => y.diarioId !== diarioId), ...(queda ? [x] : [])].sort((a, c) => orden(a.diarioId) - orden(c.diarioId)) });
  };
  const setLineas = (diarioId: number, ls: LineaCuenta[]) => setDiario(diarioId, { lineas: ls });
  const orden = (id: number) => columnas.findIndex((c) => c.odooJournalId === id);
  const cuentaNombre = (id: number | null) => {
    const c = cuentasLista.find((x) => x.odooAccountId === id);
    return c ? `${c.codigo} ${c.nombre}` : "";
  };

  // ── un único diario con importe (Socios, efectivo de los Cambios) ──
  const unico = (diarioId: number, v: number | undefined, campos: "socios" | "cambio") =>
    campos === "socios" ? setD({ diarioId: v ? diarioId : undefined, importe: v }) : setD({ diarioEfectivoId: v ? diarioId : undefined, efectivo: v });

  // Adjuntos por medio de pago (diario de la celda) o de la factura (null)
  const clip = (diarioId: number | null, titulo: string, ctrl?: { abierto: boolean; onCerrar: () => void }) => (
    <ClipAdjuntos opId={b.id} diarioId={diarioId} titulo={titulo} {...ctrl}
      nuevos={(b.adjuntosNuevos ?? []).filter((n) => n.diarioId === diarioId)}
      onNuevos={(ns) => setB({ ...b, adjuntosNuevos: [...(b.adjuntosNuevos ?? []).filter((n) => n.diarioId !== diarioId), ...ns] })} />
  );

  // Importe en cheque propio debajo del input: etiquetado para no confundirlo con el importe que sale ya
  const botonPropio = (id: number) => (
    <button type="button" style={{ ...CELDA_DIALOGO, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }} title="Cheque propio (pendiente de débito)" onClick={() => setDlg({ k: "propio", diarioId: id })}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11 }}><Receipt size={12} />Cheque</span>
      <Monto v={ef.pend[id]} pend />
    </button>
  );

  function celda(col: DiarioCfg) {
    const id = col.odooJournalId;
    const foco = id === sugerido;
    const esChq = col.tipo === "CHEQUES";
    switch (b.tipo) {
      case "PAGO":
      case "COBRO": {
        if (esChq) {
          const k = b.tipo === "PAGO" ? "cartera" : "nuevos";
          const m = medio(id, b.tipo === "PAGO" ? "CARTERA" : "NUEVOS");
          return <button type="button" style={CELDA_DIALOGO} onClick={() => setDlg({ k, diarioId: id })}>{m ? <Monto v={ef.mov[id]} /> : b.tipo === "PAGO" ? "Elegir cheques" : "Cargar cheques"}</button>;
        }
        const imp = medio(id, "IMPORTE") as Extract<Medio, { tipo: "IMPORTE" }> | undefined;
        const propio = medio(id, "PROPIO");
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <ImporteInput autoFocus={foco} value={imp?.importe} onChange={(v) => setMedio(id, "IMPORTE", v ? { tipo: "IMPORTE", diarioId: id, importe: v } : null)} ariaLabel={`Importe ${col.nombre}`} />
            {propio && botonPropio(id)}
          </div>
        );
      }
      case "GASTO":
      case "INGRESO": {
        if (esChq) return <Text size="xs" c="dimmed" ta="right">—</Text>;
        const ls = lineas(id);
        const varias = ls.length > 1;
        // La línea guarda el total de la columna; el input muestra solo lo que sale ya del banco (sin los cheques propios), como en el Pago
        const chq = sum(chequesPropios(id).map((c) => c.importe));
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Group gap={2} wrap="nowrap" justify="flex-end">
            {varias ? (
              // Total de la columna: lo que sale ya más lo pagado con cheque propio
              <button type="button" style={CELDA_DIALOGO} onClick={() => setDlg({ k: "cuentas", diarioId: id })}><Monto v={(ef.mov[id] ?? 0) + (ef.pend[id] ?? 0)} /></button>
            ) : (
              <ImporteInput
                autoFocus={foco}
                value={ls[0] ? round2(ls[0].importe - chq) || undefined : undefined}
                ariaLabel={`Importe ${col.nombre}`}
                onChange={(v) => {
                  const cuentaId = ls[0]?.cuentaId ?? cuentaDefault;
                  const total = round2((v ?? 0) + chq);
                  setLineas(id, total ? [{ ...(ls[0] ?? { descripcion: "" }), cuentaId, cuentaNombre: cuentaNombre(cuentaId), importe: total }] : []);
                }}
              />
            )}
          </Group>
            {!!ef.pend[id] && botonPropio(id)}
          </div>
        );
      }
      case "SOCIOS":
        if (esChq) return <Text size="xs" c="dimmed" ta="right">—</Text>;
        return <ImporteInput autoFocus={foco} value={d.diarioId === id ? d.importe : undefined} onChange={(v) => unico(id, v, "socios")} ariaLabel={`Importe ${col.nombre}`} />;
      case "CAMBIO_RECIBO":
      case "CAMBIO_ENTREGO":
        if (esChq) {
          const hay = b.tipo === "CAMBIO_RECIBO" ? d.chequesNuevos?.length : d.chequesCartera?.length;
          return <button type="button" style={CELDA_DIALOGO} onClick={() => setDlg({ k: b.tipo === "CAMBIO_RECIBO" ? "nuevos" : "cartera", diarioId: id })}>{hay ? <Monto v={ef.mov[id]} /> : b.tipo === "CAMBIO_RECIBO" ? "Cargar cheques" : "Elegir cheques"}</button>;
        }
        return <ImporteInput autoFocus={foco} value={d.diarioEfectivoId === id ? d.efectivo : undefined} onChange={(v) => unico(id, v, "cambio")} ariaLabel={`Efectivo ${col.nombre}`} />;
      default:
        return <div style={{ textAlign: "right", paddingTop: 6 }}><Monto v={ef.mov[id]} /></div>;
    }
  }

  // Acciones secundarias de la celda en un menú ⋯ al lado del importe (cheque propio, varias cuentas, adjuntos)
  function acciones(col: DiarioCfg) {
    const id = col.odooJournalId;
    const conImporte = !!(ef.mov[id] || ef.pend[id]);
    const nAdj = (adjs?.adjuntos ?? []).filter((a) => a.diarioId === id).length + (b.adjuntosNuevos ?? []).filter((n) => n.diarioId === id).length;
    const propio = (b.tipo === "PAGO" || b.tipo === "GASTO") && col.tipo === "BANCO";
    const cuentas = (b.tipo === "GASTO" || b.tipo === "INGRESO") && col.tipo !== "CHEQUES";
    if (!propio && !cuentas && !conImporte) return null;
    return (
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon size="input-xs" w={18} miw={18} variant={nAdj ? "light" : "subtle"} color={nAdj ? "amber" : "gray"} aria-label={`Acciones ${col.nombre}`} title={nAdj ? `${nAdj} adjunto(s)` : "Más opciones"}>
            <EllipsisVertical size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {propio && <Menu.Item leftSection={<Receipt size={14} />} onClick={() => setDlg({ k: "propio", diarioId: id })}>Cheque propio…</Menu.Item>}
          {cuentas && <Menu.Item leftSection={<ListPlus size={14} />} onClick={() => setDlg({ k: "cuentas", diarioId: id })}>Varias cuentas…</Menu.Item>}
          {conImporte && <Menu.Item leftSection={<Paperclip size={14} />} onClick={() => setAdjDe(id)}>{nAdj ? `Adjuntos (${nAdj})…` : "Adjuntar…"}</Menu.Item>}
        </Menu.Dropdown>
      </Menu>
    );
  }

  function detalle() {
    switch (b.tipo) {
      case "GASTO":
      case "INGRESO":
        return (
          <Group gap={4} wrap="nowrap">
            <div style={{ minWidth: 190, flex: 1 }}>
            <ComboBox placeholder="Elegir cuenta…"
              options={cuentasLista.map(aOpcion)}
              value={cuentasLista.map(aOpcion).find((o) => o.id === cuentaDefault) ?? null}
              onChange={(o) => {
                const id = o.id;
                setCuentaDefault(id);
                // aplica a los diarios que tienen una sola línea
                setD({ diarios: (d.diarios ?? []).map((x) => (x.lineas.length === 1 ? { ...x, lineas: [{ ...x.lineas[0], cuentaId: id, cuentaNombre: cuentaNombre(id) }] } : x)) });
              }}
            />
            </div>
            {/* Factura y sus adjuntos en un menú ⋯, como las acciones de las columnas */}
            {b.tipo === "GASTO" && (
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon size="input-xs" w={18} miw={18} variant={d.factura ? "light" : "subtle"} color={d.factura ? "amber" : "gray"} aria-label="Acciones de la factura"
                      title={d.factura ? (nAdjFactura ? `Factura ${d.factura.letra} · ${nAdjFactura} adjunto(s)` : `Factura ${d.factura.letra}`) : "Factura"}>
                      <EllipsisVertical size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {d.factura && <Menu.Label>Factura {d.factura.letra} {d.factura.numero} · $ {fmt(totalFactura(d.factura, lineasFactura(d)))}</Menu.Label>}
                    <Menu.Item leftSection={<FileText size={14} />} onClick={() => setDlg({ k: "factura" })}>{d.factura ? "Editar factura…" : "Factura fiscal…"}</Menu.Item>
                    {d.factura && <Menu.Item leftSection={<Paperclip size={14} />} onClick={() => setAdjFactura(true)}>{nAdjFactura ? `Adjuntos (${nAdjFactura})…` : "Adjuntar…"}</Menu.Item>}
                  </Menu.Dropdown>
                </Menu>
            )}
          </Group>
        );
      case "MOVIMIENTO": {
        const opts = cat.diarios.filter((x) => x.tipo !== "CHEQUES").map((x) => ({ value: String(x.odooJournalId), label: x.nombre }));
        return (
          <Group gap={4} wrap="nowrap">
            <Select size="xs" placeholder="Sale de…" data={opts} value={d.origenId ? String(d.origenId) : null} onChange={(v) => setD({ origenId: v ? Number(v) : undefined })} style={{ minWidth: 130 }} />
            <Select size="xs" placeholder="Entra en…" data={opts} value={d.destinoId ? String(d.destinoId) : null} onChange={(v) => setD({ destinoId: v ? Number(v) : undefined })} style={{ minWidth: 130 }} />
            <ImporteInput value={d.importe} onChange={(v) => setD({ importe: v })} />
          </Group>
        );
      }
      case "SOCIOS":
        return (
          <Group gap={4} wrap="nowrap">
            <SegmentedControl size="xs" data={[{ value: "RETIRO", label: "Retiro" }, { value: "DEPOSITO", label: "Depósito" }]} value={d.sentido ?? "RETIRO"} onChange={(v) => setD({ sentido: v as Datos["sentido"] })} />
            <div style={{ minWidth: 150, flex: 1 }}>
              <ComboBox placeholder="Cuenta del socio…"
                options={cat.cuentas.SOCIO.map(aOpcion)}
                value={cat.cuentas.SOCIO.map(aOpcion).find((o) => o.id === d.cuentaId) ?? null}
                onChange={(o) => setD({ cuentaId: o.id, cuentaNombre: cat.cuentas.SOCIO.find((c) => c.odooAccountId === o.id)?.nombre ?? "" })} />
            </div>
          </Group>
        );
      case "PAGO_CHEQUES_PROPIOS":
        return (
          <Group gap={4} wrap="nowrap">
            <Select size="xs" placeholder="Banco…" style={{ minWidth: 130 }}
              data={cat.diarios.filter((x) => x.tipo === "BANCO").map((x) => ({ value: String(x.odooJournalId), label: x.nombre }))}
              value={d.diarioId ? String(d.diarioId) : null}
              onChange={(v) => setD({ diarioId: v ? Number(v) : undefined, chequesEmitidos: [] })} />
            <Button size="compact-xs" variant="light" disabled={!d.diarioId} onClick={() => setDlg({ k: "emitidos" })}>
              {d.chequesEmitidos?.length ? `${d.chequesEmitidos.length} cheque(s)` : "Elegir cheques"}
            </Button>
          </Group>
        );
      case "CAMBIO_RECIBO":
      case "CAMBIO_ENTREGO": {
        const dif = diferenciaCambio(b.tipo, { ...d });
        const signo = b.tipo === "CAMBIO_RECIBO" ? dif : -dif;
        return (
          <Text size="xs" c="dimmed" pt={6}>
            {signo === 0 ? "Sin diferencia" : signo > 0 ? `Ganancia $ ${fmt(signo)}` : `Pérdida / interés $ ${fmt(-signo)}`}
          </Text>
        );
      }
      default: {
        const chq = (d.medios ?? []).reduce((a, m) => a + (m.tipo === "IMPORTE" ? 0 : m.cheques.length), 0);
        const imp = d.imputaciones ?? [];
        return (
          <Group gap={6} wrap="nowrap">
            {(b.tipo === "PAGO" || b.tipo === "COBRO") && (
              <Tooltip label="Elegí el contacto" disabled={!!b.contactoId}>
                <span>
                  <Button size="compact-xs" variant={imp.length ? "light" : "subtle"} color={imp.length ? "amber" : "gray"} leftSection={<FileText size={12} />}
                    disabled={!b.contactoId} onClick={() => setDlg({ k: "imputar" })}>
                    {imp.length ? `${imp.length} fc · $ ${fmt(sum(imp.map((f) => f.saldo)))}` : "Imputar facturas"}
                  </Button>
                </span>
              </Tooltip>
            )}
            <Text size="xs" c="dimmed">{chq ? `${chq} cheque(s)` : ""}</Text>
          </Group>
        );
      }
    }
  }

  const cerrar = () => setDlg(null);
  const sinAdjFactura = (b.adjuntosNuevos ?? []).filter((n) => n.diarioId !== null);
  const lineasTodas = (d.diarios ?? []).flatMap((x) => x.lineas.map((linea, i) => ({ diarioId: x.diarioId, diarioNombre: nombre(x.diarioId), i, linea })));

  return (
    <>
      <tr>
        <td style={TD}>
          <TextoInput placeholder={["GASTO", "INGRESO", "CAMBIO_RECIBO", "CAMBIO_ENTREGO"].includes(b.tipo) ? "Observación (obligatoria)" : "Observación (opcional)"}
            value={b.observacion} onChange={(v) => setB({ ...b, observacion: v })} ariaLabel="Observación" />
        </td>
        <td style={TD}>
          {SIN_CONTACTO.includes(b.tipo) ? <Text size="xs" c="dimmed" pt={6}>—</Text> : (
            <ContactoSelect value={{ id: b.contactoId, nombre: b.contactoNombre }} onChange={(c) => setB({ ...b, contactoId: c.id, contactoNombre: c.nombre, datos: c.id === b.contactoId ? d : { ...d, imputaciones: [] } })} responsabilidades={cat.responsabilidades} />
          )}
        </td>
        <td style={TD}>{detalle()}</td>
        {columnas.map((c) => (
          <td key={c.odooJournalId} style={TD}>
            <Group gap={2} wrap="nowrap" align="flex-start">
              <div style={{ flex: 1, minWidth: 0 }}>{celda(c)}</div>
              {acciones(c)}
            </Group>
          </td>
        ))}
      </tr>

      {adjDe !== null && clip(adjDe, nombre(adjDe), { abierto: true, onCerrar: () => setAdjDe(null) })}
      {adjFactura && clip(null, "Factura", { abierto: true, onCerrar: () => setAdjFactura(false) })}

      {dlg?.k === "cartera" && (
        <DialogoCartera opened diarioId={dlg.diarioId} onCancel={cerrar}
          inicial={b.tipo === "PAGO" ? ((medio(dlg.diarioId, "CARTERA") as Extract<Medio, { tipo: "CARTERA" }> | undefined)?.cheques ?? []) : d.chequesCartera ?? []}
          onAccept={(cs) => {
            if (b.tipo === "PAGO") setMedio(dlg.diarioId, "CARTERA", cs.length ? { tipo: "CARTERA", diarioId: dlg.diarioId, cheques: cs } : null);
            else setD({ chequesCartera: cs, chequesDiarioId: dlg.diarioId });
            cerrar();
          }} />
      )}
      {dlg?.k === "nuevos" && (
        <DialogoChequesNuevos opened bancos={cat.bancos} onCancel={cerrar}
          inicial={b.tipo === "COBRO" ? ((medio(dlg.diarioId, "NUEVOS") as Extract<Medio, { tipo: "NUEVOS" }> | undefined)?.cheques ?? []) : d.chequesNuevos ?? []}
          onAccept={(cs) => {
            if (b.tipo === "COBRO") setMedio(dlg.diarioId, "NUEVOS", { tipo: "NUEVOS", diarioId: dlg.diarioId, cheques: cs });
            else setD({ chequesNuevos: cs, chequesDiarioId: dlg.diarioId });
            cerrar();
          }} />
      )}
      {dlg?.k === "propio" && (
        <DialogoChequePropio opened diarioId={dlg.diarioId} fechaContable={b.fechaContable} onCancel={cerrar}
          inicial={b.tipo === "GASTO" ? chequesPropios(dlg.diarioId) : (medio(dlg.diarioId, "PROPIO") as Extract<Medio, { tipo: "PROPIO" }> | undefined)?.cheques ?? []}
          onAccept={(cs) => {
            if (b.tipo === "GASTO") {
              // Con una sola cuenta, lo transferido queda igual y la línea suma los cheques; con varias, el total lo define el diálogo de cuentas
              const ls = lineas(dlg.diarioId);
              const cuentaId = ls[0]?.cuentaId ?? cuentaDefault;
              const total = round2((ls[0]?.importe ?? 0) - sum(chequesPropios(dlg.diarioId).map((c) => c.importe)) + sum(cs.map((c) => c.importe)));
              if (ls.length > 1) setDiario(dlg.diarioId, { cheques: cs });
              else setDiario(dlg.diarioId, { cheques: cs, lineas: total > 0 ? [{ ...(ls[0] ?? { descripcion: "" }), cuentaId, cuentaNombre: cuentaNombre(cuentaId), importe: total }] : [] });
            }
            else setMedio(dlg.diarioId, "PROPIO", cs.length ? { tipo: "PROPIO", diarioId: dlg.diarioId, cheques: cs } : null);
            cerrar();
          }} />
      )}
      {dlg?.k === "cuentas" && (
        <DialogoCuentas opened diarioNombre={nombre(dlg.diarioId)} cuentas={cuentasLista} onCancel={cerrar}
          inicial={lineas(dlg.diarioId).length ? lineas(dlg.diarioId) : cuentaDefault ? [{ cuentaId: cuentaDefault, cuentaNombre: cuentaNombre(cuentaDefault), importe: 0, descripcion: "" }] : []}
          onAccept={(ls) => {
            setLineas(dlg.diarioId, ls.filter((l) => l.importe > 0));
            cerrar();
          }} />
      )}
      {dlg?.k === "factura" && (
        <DialogoFactura opened fechaContable={b.fechaContable} inicial={d.factura ?? null} lineas={lineasTodas} cuentas={cat.cuentas.GASTO} tipos={cat.tiposComprobante ?? []} cuentaDefault={cuentaDefault ? { id: cuentaDefault, nombre: cuentaNombre(cuentaDefault) } : null}
          adjuntos={clip(null, "Factura")}
          // Sin factura, los archivos elegidos para ella no tienen a dónde ir: se descartan
          onCancel={() => { if (!d.factura) setB({ ...b, adjuntosNuevos: sinAdjFactura }); cerrar(); }}
          onAccept={(f, ivas) => {
            setB({
              ...b,
              datos: { ...d, factura: f, diarios: (d.diarios ?? []).map((x) => ({ ...x, lineas: x.lineas.map((l, i) => ({ ...l, iva: f?.letra === "A" ? ivas[`${x.diarioId}-${i}`] : undefined })) })) },
              adjuntosNuevos: f ? b.adjuntosNuevos : sinAdjFactura,
            });
            cerrar();
          }} />
      )}
      {dlg?.k === "imputar" && b.contactoId && (b.tipo === "PAGO" || b.tipo === "COBRO") && (
        <DialogoImputacion opened contactoId={b.contactoId} contactoNombre={b.contactoNombre ?? ""} tipo={b.tipo} onCancel={cerrar}
          total={sum((d.medios ?? []).map(totalMedio))} inicial={d.imputaciones ?? []}
          onAccept={(fs) => {
            setD({ imputaciones: fs });
            cerrar();
          }} />
      )}
      {dlg?.k === "emitidos" && d.diarioId && (
        <DialogoChequesEmitidos opened diarioId={d.diarioId} bancoNombre={nombre(d.diarioId)} hoy={b.fechaContable} inicial={d.chequesEmitidos ?? []} onCancel={cerrar}
          onAccept={(cs) => {
            setD({ chequesEmitidos: cs });
            cerrar();
          }} />
      )}
    </>
  );
}
