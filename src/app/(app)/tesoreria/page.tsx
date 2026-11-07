"use client";
import { Fragment, use, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Alert, Badge, Button, Group, Menu, Text } from "@mantine/core";
import { ArrowLeftRight, ChevronDown, Eye, Landmark, Pencil, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { useTesoreriaCatalogos, useTesoreriaMovimientos, useTesoreriaPendientes, type OperacionView, type PendienteView } from "@/hooks/useTesoreria";
import { ESTADO_LABEL, fmt, TIPO_LABEL, totalOperacion, validar, type Datos, type Tipo } from "@/lib/tesoreria";
import type { Fila } from "@/lib/tesoreriaVista";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Monto } from "@/components/tesoreria/comunes";
import { NavPeriodo, PestanasTesoreria, tituloPeriodo, useParamsTesoreria, type ParamsTesoreria } from "@/components/tesoreria/Navegacion";
import type { Borrador } from "@/components/tesoreria/FilaEditor";
import { PanelOperacion } from "@/components/tesoreria/PanelOperacion";
import { subirNuevos } from "@/components/tesoreria/Adjuntos";
import { aplicarFiltros, BarraFiltros, hayFiltros, SIN_FILTROS, type Filtros } from "@/components/tesoreria/Filtros";
import { DialogoOperacion, ESTADO_COLOR } from "@/components/tesoreria/DialogoOperacion";
import { EstiloOcultas, Manija, MenuColumnas, useAnchos, useOcultas } from "@/components/tesoreria/anchos";

// Diarios: 130 px por defecto (useAnchos)
const ANCHOS = { concepto: 300, contacto: 180, cuenta: 210 };

const TH: React.CSSProperties = { padding: "8px", fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text3)", textAlign: "left", borderBottom: "1px solid var(--border2)", borderRight: "1px solid var(--border)", whiteSpace: "nowrap", background: "var(--surface)", position: "sticky", top: 0, zIndex: 2 };
const TD: React.CSSProperties = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", verticalAlign: "top" };

const GRUPOS: { titulo: string; icono: React.ReactNode; tipos: Tipo[] }[] = [
  { titulo: "Sale plata", icono: <TrendingDown size={14} />, tipos: ["PAGO", "GASTO"] },
  { titulo: "Entra plata", icono: <TrendingUp size={14} />, tipos: ["COBRO", "INGRESO"] },
  { titulo: "Entre cuentas", icono: <ArrowLeftRight size={14} />, tipos: ["MOVIMIENTO", "SOCIOS"] },
  { titulo: "Cheques", icono: <Landmark size={14} />, tipos: ["CAMBIO_RECIBO", "CAMBIO_ENTREGO", "PAGO_CHEQUES_PROPIOS"] },
];

const nuevoBorrador = (tipo: Tipo, fecha: string, cheques?: number): Borrador => {
  const datos: Datos =
    tipo === "SOCIOS" ? { sentido: "RETIRO" } :
    tipo === "CAMBIO_RECIBO" || tipo === "CAMBIO_ENTREGO" ? { chequesDiarioId: cheques } :
    tipo === "PAGO" || tipo === "COBRO" ? { medios: [] } :
    tipo === "GASTO" || tipo === "INGRESO" ? { diarios: [] } : {};
  return { tipo, fechaContable: fecha, contactoId: null, contactoNombre: null, observacion: "", datos };
};

export default function TesoreriaPage({ searchParams }: { searchParams: Promise<ParamsTesoreria> }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentEmployee();
  const { hoy, periodo, fecha, ir } = useParamsTesoreria(use(searchParams));
  const [edit, setEdit] = useState<Borrador | null>(null);
  const [dialogo, setDialogo] = useState<{ opId: number | null; fila: Fila | null; confirmar?: boolean } | null>(null);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [procId, setProcId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [revisando, setRevisando] = useState(false); // Confirmar del panel: guardando antes de abrir el diálogo
  const [error, setError] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<number | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [resaltada, setResaltada] = useState<number | null>(null);

  const { data: vista, isPlaceholderData: cambiandoPeriodo, error: errVista } = useTesoreriaMovimientos(periodo, fecha);
  const { data: cat } = useTesoreriaCatalogos();
  const { data: pendientes = [] } = useTesoreriaPendientes();
  const atencion = pendientes.filter((p) => p.estado === "REQUIERE_ATENCION");
  const [reanudando, setReanudando] = useState<number | null>(null);
  const { ancho, setAncho } = useAnchos(ANCHOS);
  const { ocultas, alternar } = useOcultas("tesoreria.ocultas.vista");

  // Primera carga o error: la estructura queda y el spinner (o el error) va en el lugar de la grilla
  if (!cat || !me || !vista) {
    return (
      <div className="page-pad" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <PestanasTesoreria periodo={periodo} fecha={fecha} />
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Vista General</h2>
        <Group gap={8} wrap="wrap"><NavPeriodo periodo={periodo} fecha={fecha} hoy={hoy} ir={ir} /></Group>
        {errVista ? <Alert color="red">{(errVista as Error).message || "No se pudo cargar la Vista General"}</Alert> : <LoadingSpinner size={20} label="Cargando Tesorería…" />}
      </div>
    );
  }

  const columnas = vista.diarios;
  const filtrado = hayFiltros(filtros) ? aplicarFiltros(vista.filas, filtros) : { filas: vista.filas, total: vista.total };
  const claves = ["concepto", "contacto", "cuenta", ...columnas.map((c) => `d-${c.odooJournalId}`)];
  const titulo = (k: string) =>
    k === "concepto" ? "Concepto" : k === "contacto" ? "Contacto" : k === "cuenta" ? "Cuenta / detalle" : columnas.find((c) => `d-${c.odooJournalId}` === k)?.nombre;
  // Concepto no se oculta: es la que abre el detalle
  const visibles = claves.filter((k) => !ocultas.includes(k));
  const odooOk = vista.odooDisponible && cat.odooDisponible;
  const sinConfig = !cat.diarios.length;

  const ctxVal = {
    hoy,
    diarios: cat.diarios,
    cuentasGasto: cat.cuentas.GASTO.map((c) => c.odooAccountId),
    cuentasIngreso: cat.cuentas.INGRESO.map((c) => c.odooAccountId),
    cuentasSocio: cat.cuentas.SOCIO.map((c) => c.odooAccountId),
  };
  const errorEdit = edit ? validar({ ...edit, observacion: edit.observacion }, ctxVal) : null;

  function nueva(tipo: Tipo) {
    const f = periodo === "dia" && fecha <= hoy ? fecha : hoy;
    setError(null);
    setDuplicado(null);
    setEdit(nuevoBorrador(tipo, f, cat?.diarios.find((d) => d.tipo === "CHEQUES")?.odooJournalId));
  }

  function editar(op: OperacionView) {
    setDialogo(null);
    setError(op.error);
    setDuplicado(null);
    ir({ periodo: "dia", fecha: op.fechaContable });
    setEdit({ id: op.id, tipo: op.tipo, fechaContable: op.fechaContable, contactoId: op.contactoId, contactoNombre: op.contactoNombre, observacion: op.observacion ?? "", datos: op.datos });
  }

  async function guardar(b: Borrador): Promise<number | null> {
    const body = JSON.stringify({ tipo: b.tipo, fechaContable: b.fechaContable, contactoId: b.contactoId, contactoNombre: b.contactoNombre, observacion: b.observacion, datos: b.datos });
    const r = await fetch(b.id ? `/api/tesoreria/operaciones/${b.id}` : "/api/tesoreria/operaciones", { method: b.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(res.error ?? "No se pudo guardar el borrador");
      return null;
    }
    const id: number | null = res.id ?? b.id ?? null;
    if (id && b.adjuntosNuevos?.length) {
      const { error, restantes } = await subirNuevos(id, b.adjuntosNuevos);
      qc.invalidateQueries({ queryKey: ["tesoreria", "adjuntos", id] });
      if (error) {
        setError(error);
        setEdit({ ...b, id, adjuntosNuevos: restantes });
        return null;
      }
    }
    return id;
  }

  // Retomar un borrador directo desde la grilla o el aviso (de cualquier fecha)
  async function abrirBorrador(id: number) {
    const r = await fetch(`/api/tesoreria/operaciones/${id}`);
    if (r.ok) editar(await r.json());
  }

  async function reanudarOp(id: number) {
    setReanudando(id);
    await fetch(`/api/tesoreria/operaciones/${id}/reanudar`, { method: "POST" }).catch(() => null);
    setReanudando(null);
    setDialogo({ opId: id, fila: null });
    qc.invalidateQueries({ queryKey: ["tesoreria"] });
  }

  function verOperacion(p: PendienteView) {
    ir({ periodo: "dia", fecha: p.fechaContable });
    setDialogo({ opId: p.id, fila: null });
  }

  /** Lleva la vista al día de la operación y resalta su fila unos segundos. */
  function mostrarEnGrilla(id: number, fechaOp: string) {
    ir({ periodo: "dia", fecha: fechaOp });
    setResaltada(id);
    setTimeout(() => setResaltada((x) => (x === id ? null : x)), 4000);
  }

  async function guardarBorrador() {
    if (!edit) return;
    setGuardando(true);
    const id = await guardar(edit);
    setGuardando(false);
    if (id) {
      mostrarEnGrilla(id, edit.fechaContable);
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["tesoreria"] });
    }
  }

  /** Confirmar desde el panel: guarda el borrador y abre su detalle para revisarlo; se ejecuta desde ahí. */
  async function revisar() {
    if (!edit) return;
    setGuardando(true);
    setRevisando(true);
    setError(null);
    const id = await guardar(edit);
    setGuardando(false);
    setRevisando(false);
    if (!id) return;
    setEdit({ ...edit, id, adjuntosNuevos: [] });
    // El diálogo abre con lo cargado en pantalla y se refresca solo al montar (pasos, eventos);
    // la grilla y los movimientos de Odoo se refrescan al cerrarlo, para no competir con esa lectura
    const previa = qc.getQueryData<OperacionView>(queryKeys.tesoreria.operacion(id));
    qc.setQueryData<OperacionView>(queryKeys.tesoreria.operacion(id), {
      creadoPor: "", creadoEn: new Date().toISOString(), confirmadoPor: null, confirmadoEn: null, anuladoPor: null, anuladoEn: null, pasos: [], eventos: [],
      ...previa,
      id, tipo: edit.tipo, estado: "BORRADOR", fechaContable: edit.fechaContable, contactoId: edit.contactoId, contactoNombre: edit.contactoNombre,
      observacion: edit.observacion, datos: edit.datos, total: totalOperacion(edit.tipo, edit.datos) || 0, error: null,
    });
    setDialogo({ opId: id, fila: null, confirmar: true });
  }

  async function confirmar(aceptarDuplicado = false) {
    if (!edit) return;
    setGuardando(true);
    setError(null);
    const id = await guardar(edit);
    if (!id) return setGuardando(false);
    setEdit({ ...edit, id, adjuntosNuevos: [] });
    setProcId(id);
    setDialogo({ opId: id, fila: null });
    const r = await fetch(`/api/tesoreria/operaciones/${id}/confirmar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aceptarDuplicado }) });
    const res = await r.json().catch(() => ({}));
    setProcId(null);
    setGuardando(false);
    qc.invalidateQueries({ queryKey: ["tesoreria"] });
    if (r.ok) {
      mostrarEnGrilla(id, edit.fechaContable);
      setEdit(null);
      return;
    }
    if (res.duplicado) {
      setDialogo(null);
      return setDuplicado(res.duplicado.id);
    }
    // Si ya escribió algo en Odoo, la operación quedó "Requiere atención": se ve en la grilla
    const estado = await fetch(`/api/tesoreria/operaciones/${id}`).then((x) => x.json()).catch(() => null);
    if (estado && estado.estado !== "BORRADOR") {
      mostrarEnGrilla(id, edit.fechaContable);
      setEdit(null);
      setDialogo({ opId: id, fila: null });
    } else {
      setDialogo(null);
      setError(res.error ?? "No se pudo confirmar");
    }
  }

  const toggleCuenta = (k: string) => setExpandidas((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  const filaVista = (f: Fila, hijo = false) => {
    const editando = !!edit?.id && f.operacionId === edit.id;
    const atenuada = editando || f.estado === "ANULADA" || f.estado === "BORRADOR" || !!f.faltaEnOdoo;
    const brillo = resaltada !== null && f.operacionId === resaltada;
    return (
      <Fragment key={f.key}>
        <tr style={{ opacity: atenuada ? 0.55 : 1, textDecoration: f.estado === "ANULADA" || f.faltaEnOdoo ? "line-through" : undefined, background: brillo ? "var(--accent-bg)" : undefined, transition: "background 0.6s" }}>
          <td style={{ ...TD, paddingLeft: hijo ? 24 : 8 }}>
            <button type="button" onClick={() => (f.estado === "BORRADOR" && f.operacionId && !edit ? abrirBorrador(f.operacionId) : setDialogo({ opId: f.operacionId ?? null, fila: f }))} title={f.estado === "BORRADOR" ? "Seguir cargando" : "Ver detalle"}
              style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", textAlign: "left", padding: 0, font: "inherit", display: "inline-flex", gap: 6, alignItems: "flex-start" }}>
              {f.estado === "BORRADOR"
                ? <Pencil size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                : <Eye size={14} color="var(--text2)" style={{ flexShrink: 0, marginTop: 2 }} />}
              <span>
                {f.concepto}
                <span style={{ display: "block", fontSize: 11, color: "var(--text2)" }}>{f.tipo ? TIPO_LABEL[f.tipo] : f.clase === "EXTERNO" ? "Movimiento en Odoo" : ""}</span>
              </span>
            </button>
            {editando && <Badge size="xs" ml={6} variant="filled" color="amber">En edición</Badge>}
            {f.faltaEnOdoo ? (
              <Badge size="xs" ml={6} variant="filled" color="red" title="Sus registros se borraron en Odoo: no suma en el TOTAL">No está en Odoo</Badge>
            ) : f.estado && !editando && (
              f.estado === "BORRADOR" && f.operacionId && !edit ? (
                <Badge component="button" type="button" size="xs" ml={6} variant="light" color={ESTADO_COLOR[f.estado]} title="Seguir cargando"
                  style={{ cursor: "pointer", border: "none" }} onClick={() => abrirBorrador(f.operacionId!)}>
                  {ESTADO_LABEL[f.estado]}
                </Badge>
              ) : (
                <Badge size="xs" ml={6} variant="light" color={ESTADO_COLOR[f.estado]}>{ESTADO_LABEL[f.estado]}</Badge>
              )
            )}
            {f.estado === "REQUIERE_ATENCION" && f.operacionId && (
              <div><Button size="compact-xs" color="red" variant="light" mt={4} loading={reanudando === f.operacionId} disabled={!odooOk} onClick={() => reanudarOp(f.operacionId!)}>Reanudar</Button></div>
            )}
          </td>
          <td style={TD}>{f.contacto}</td>
          <td style={{ ...TD, color: "var(--text2)" }}>{f.cuenta}</td>
          {columnas.map((c) => (
            <td key={c.odooJournalId} style={{ ...TD, textAlign: "right" }}>
              <Monto v={f.mov[c.odooJournalId]} />
              {f.pend[c.odooJournalId] ? <div><Monto v={f.pend[c.odooJournalId]} pend /></div> : null}
            </td>
          ))}
        </tr>
      </Fragment>
    );
  };

  const filaCuenta = (f: Fila) => {
    const abiertaEsta = expandidas.has(f.key);
    return (
      <Fragment key={f.key}>
        <tr>
          <td style={{ ...TD, fontWeight: 600 }}>
            <button type="button" onClick={() => toggleCuenta(f.key)} style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", padding: 0, font: "inherit" }}>
              {abiertaEsta ? "▾" : "▸"} {f.concepto}
            </button>
            <Text span size="xs" c="dimmed" ml={6}>{f.hijos?.length ?? 0}</Text>
          </td>
          <td style={TD} />
          <td style={TD} />
          {columnas.map((c) => (
            <td key={c.odooJournalId} style={{ ...TD, textAlign: "right" }}>
              <Monto v={f.mov[c.odooJournalId]} />
              {f.pend[c.odooJournalId] ? <div><Monto v={f.pend[c.odooJournalId]} pend /></div> : null}
            </td>
          ))}
        </tr>
        {abiertaEsta && f.hijos?.map((h) => filaVista(h, true))}
      </Fragment>
    );
  };

  return (
    <div className="page-pad" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <PestanasTesoreria periodo={periodo} fecha={fecha} />
      <Group justify="space-between" wrap="wrap" gap={8}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Vista General</h2>
          <Text size="xs" c="dimmed">Movimientos de fondos por diario.</Text>
        </div>
        <Menu position="bottom-end" width={260} shadow="md" disabled={!!edit || sinConfig}>
          <Menu.Target>
            <Button leftSection={<Plus size={16} />} rightSection={<ChevronDown size={14} />} disabled={!!edit || sinConfig}>Nueva operación</Button>
          </Menu.Target>
          <Menu.Dropdown>
            {GRUPOS.map((g, i) => (
              <Fragment key={g.titulo}>
                {i > 0 && <Menu.Divider />}
                <Menu.Label>{g.titulo}</Menu.Label>
                {g.tipos.map((t) => (
                  <Menu.Item key={t} leftSection={g.icono} onClick={() => nueva(t)}>{TIPO_LABEL[t]}</Menu.Item>
                ))}
              </Fragment>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>

      {!odooOk && (
        <Alert color="red" p={8}>
          <Text size="sm">Odoo no está disponible. Podés guardar borradores; no se puede confirmar ni ver los movimientos.</Text>
          {/* Sin grilla, los borradores se retoman desde acá */}
          {!edit && (
            <Group gap={6} wrap="wrap" mt={6}>
              {pendientes.filter((p) => p.estado === "BORRADOR").map((p) => (
                <Button key={p.id} size="xs" variant="default" leftSection={<Pencil size={12} />} onClick={() => abrirBorrador(p.id)}>
                  {TIPO_LABEL[p.tipo]}{p.contactoNombre ? ` · ${p.contactoNombre}` : ""}{p.total ? ` · $ ${fmt(p.total)}` : ""} · {p.fechaContable.split("-").reverse().join("/")}
                </Button>
              ))}
            </Group>
          )}
        </Alert>
      )}
      {sinConfig && <Alert color="yellow" p={8}><Text size="sm">Tesorería no tiene diarios habilitados. {me.role === "ADMIN" ? "Configuralos en Configuración." : "Pedile a un Admin que la configure."}</Text></Alert>}

      <Group gap={8} wrap="wrap">
        <NavPeriodo periodo={periodo} fecha={fecha} hoy={hoy} ir={ir} />
        <MenuColumnas columnas={claves.slice(1).map((k) => ({ clave: k, titulo: titulo(k) ?? k }))} ocultas={ocultas} onAlternar={alternar} />
      </Group>
      <BarraFiltros value={filtros} onChange={setFiltros} />
      {/* Aviso: operaciones que requieren atención, de cualquier fecha (los borradores se ven en la grilla) */}
      {!edit && atencion.length > 0 && (
        <div style={{ border: "1px solid var(--red)", background: "rgba(239, 68, 68, 0.08)", borderRadius: 8, padding: "8px 12px" }}>
          <Text size="sm" fw={600} mb={6} style={{ color: "var(--red)" }}>
            {atencion.length === 1 ? "Una operación requiere" : `${atencion.length} operaciones requieren`} atención
          </Text>
          <Group gap={6} wrap="wrap">
            {atencion.map((p) => (
              <Button key={p.id} size="xs" variant="light" color="red" onClick={() => verOperacion(p)}>
                {TIPO_LABEL[p.tipo]}{p.contactoNombre ? ` · ${p.contactoNombre}` : ""}{p.total ? ` · $ ${fmt(p.total)}` : ""} · {p.fechaContable.split("-").reverse().join("/")}
              </Button>
            ))}
          </Group>
        </div>
      )}

      {edit && (
        <PanelOperacion
          edit={edit}
          setEdit={setEdit}
          cat={cat}
          hoy={hoy}
          errorEdit={errorEdit}
          guardando={guardando}
          confirmando={!!procId || revisando}
          odooOk={odooOk}
          duplicado={duplicado}
          error={error}
          onCancel={() => { setEdit(null); setError(null); setDuplicado(null); }}
          onGuardar={guardarBorrador}
          onConfirmar={(aceptar) => { setDuplicado(null); if (aceptar) confirmar(true); else revisar(); }}
          onVerDuplicado={(id) => setDialogo({ opId: id, fila: null })}
          onDescartarDuplicado={() => setDuplicado(null)}
        />
      )}

      {cambiandoPeriodo ? <LoadingSpinner size={20} label="Cargando movimientos…" /> : (
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
        <EstiloOcultas grilla="vista" claves={claves} ocultas={ocultas} />
        <table data-grilla="vista" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: visibles.reduce((a, k) => a + ancho(k), 0) }}>
          <colgroup>
            {visibles.map((k) => <col key={k} style={{ width: ancho(k) }} />)}
          </colgroup>
          <thead>
            <tr>
              {claves.map((k, i) => (
                <th key={k} style={{ ...TH, textAlign: i > 2 ? "right" : "left", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {titulo(k)}
                  <Manija ancho={ancho(k)} onCambio={(v) => setAncho(k, v)} onReset={() => setAncho(k, null)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!filtrado.filas.length && (
              <tr><td colSpan={visibles.length} style={{ ...TD, textAlign: "center", color: "var(--text3)", padding: 32 }}>
                {hayFiltros(filtros) ? "Ningún movimiento coincide con los filtros." : `Sin movimientos en ${tituloPeriodo(periodo, fecha)}.`}
              </td></tr>
            )}
            {filtrado.filas.map((f) => (f.clase === "CUENTA" ? filaCuenta(f) : filaVista(f)))}
          </tbody>
          {odooOk && (
            <tfoot>
              <tr>
                <td style={{ ...TD, fontWeight: 700, background: "var(--surface)", borderTop: "1px solid var(--border2)" }}>TOTAL{hayFiltros(filtros) && <Text span size="xs" c="dimmed" ml={6} fw={400}>(filtrado)</Text>}</td>
                <td style={{ ...TD, background: "var(--surface)", borderTop: "1px solid var(--border2)" }} />
                <td style={{ ...TD, background: "var(--surface)", borderTop: "1px solid var(--border2)" }} />
                {columnas.map((c) => (
                  <td key={c.odooJournalId} style={{ ...TD, textAlign: "right", fontWeight: 700, background: "var(--surface)", borderTop: "1px solid var(--border2)" }}>
                    <Monto v={filtrado.total[c.odooJournalId]} />
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}
      {dialogo && (
        <DialogoOperacion
          key={dialogo.opId ?? dialogo.fila?.key}
          operacionId={dialogo.opId}
          fila={dialogo.fila}
          diarios={cat.diarios}
          siguiendo={!!procId && procId === dialogo.opId}
          odooDisponible={odooOk}
          confirmar={dialogo.confirmar && edit?.id === dialogo.opId ? { onOk: () => confirmar(), cargando: guardando } : undefined}
          onEditar={editar}
          onClose={() => {
            if (dialogo.confirmar) qc.invalidateQueries({ queryKey: ["tesoreria"] }); // se demoró al abrir (revisar)
            setDialogo(null);
          }}
        />
      )}
      <Text size="xs" c="dimmed">Un clic en el concepto abre el detalle de la operación (en un borrador, sigue la carga). Las operaciones confirmadas no se editan: se anulan y se cargan de nuevo. (−) entre paréntesis = cheque propio a debitar.</Text>
    </div>
  );
}
