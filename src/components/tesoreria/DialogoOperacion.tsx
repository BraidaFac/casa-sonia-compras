"use client";
import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Group, Menu, Modal, Table, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Ban, CheckCircle2, Circle, EllipsisVertical, Loader2, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { efecto, ESTADO_LABEL, fmt, formatCuit, lineasFactura, TIPO_LABEL, totalFactura, type Datos, type DiarioCfg } from "@/lib/tesoreria";
import { useTesoreriaOperacion, type OperacionView, type PasoView } from "@/hooks/useTesoreria";
import type { Fila } from "@/lib/tesoreriaVista";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { MONO, Monto } from "./comunes";
import { ClipAdjuntos } from "./Adjuntos";

const fechaHora = (s: string | null) => (s ? new Date(s).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "");
const fechaAR = (f?: string) => (f ? f.split("-").reverse().join("/") : "");

export const ESTADO_COLOR: Record<string, string> = {
  BORRADOR: "gray",
  PROCESANDO: "blue",
  ANULANDO: "blue",
  COMPLETADA: "green",
  PENDIENTE_DEBITO: "yellow",
  REQUIERE_ATENCION: "red",
  ANULADA: "dark",
  EXTERNO: "violet",
};

const EVENTO: Record<string, string> = {
  creada: "Creó el borrador",
  confirmada: "Confirmó",
  duplicado_aceptado: "Aceptó la advertencia de posible duplicado",
  volvio_a_borrador: "Volvió a borrador",
  requiere_atencion: "Quedó requiriendo atención",
  reanudada: "Reanudó",
  completada: "Quedó registrada en Odoo",
  anulada_en_odoo: "La marcó como anulada (sus registros se borraron en Odoo)",
  anulacion_iniciada: "Inició la anulación",
  anulada: "Anuló",
};

const MODELO: Record<string, string> = {
  "account.payment": "Pago",
  "account.bank.statement.line": "Línea de extracto",
  "account.move": "Asiento / factura",
};

const H = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text2)", fontWeight: 600, margin: "18px 0 6px" }}>{children}</Text>
);

const Dato = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Text style={{ fontSize: 11, color: "var(--text2)" }}>{label}</Text>
    <Text size="sm" style={{ color: "var(--text)" }}>{children || "—"}</Text>
  </div>
);

function IconoPaso({ estado }: { estado: PasoView["estado"] }) {
  if (estado === "OK") return <CheckCircle2 size={15} color="var(--green)" />;
  if (estado === "ERROR") return <XCircle size={15} color="var(--red)" />;
  if (estado === "EN_CURSO") return <Loader2 size={15} className="spin" color="var(--accent)" />;
  return <Circle size={15} color="var(--text3)" />;
}

const ESTADO_PASO: Record<PasoView["estado"], string> = { OK: "Hecho", ERROR: "Falló", EN_CURSO: "En curso", PENDIENTE: "Pendiente" };

function TablaPasos({ pasos, titulo }: { pasos: PasoView[]; titulo: string }) {
  if (!pasos.length) return null;
  return (
    <>
      <H>{titulo}</H>
      <Table fz="xs" withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr><Table.Th w={32}>#</Table.Th><Table.Th>Paso</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Referencia</Table.Th><Table.Th>Registro en Odoo</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pasos.map((p) => (
            <Table.Tr key={`${p.fase}-${p.orden}`}>
              <Table.Td>{p.orden + 1}</Table.Td>
              <Table.Td>{p.descripcion}{p.error && <Text size="xs" style={{ color: "var(--red)" }}>{p.error}</Text>}</Table.Td>
              <Table.Td><Group gap={6} wrap="nowrap"><IconoPaso estado={p.estado} />{ESTADO_PASO[p.estado]}{p.intentos > 1 ? ` (${p.intentos} intentos)` : ""}</Group></Table.Td>
              <Table.Td style={MONO}>{p.referencia}</Table.Td>
              <Table.Td>{p.odooId ? `${MODELO[p.odooModelo ?? ""] ?? p.odooModelo} #${p.odooId}` : "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

/** Cheques y líneas de cuenta de la operación, en tablas. */
function DetalleDatos({ op, nombreDiario, adjunto }: { op: OperacionView; nombreDiario: (id?: number) => string; adjunto: (diarioId: number | null, titulo: string) => React.ReactNode }) {
  const d = op.datos as Datos;
  const cheques: { tipo: string; numero: string; banco: string; quien: string; fecha: string; importe: number }[] = [];
  for (const m of d.medios ?? []) {
    if (m.tipo === "CARTERA") m.cheques.forEach((c) => cheques.push({ tipo: "Entregado (cartera)", numero: c.numero, banco: c.bancoNombre, quien: formatCuit(c.librador), fecha: c.fechaPago, importe: c.importe }));
    if (m.tipo === "NUEVOS") m.cheques.forEach((c) => cheques.push({ tipo: "Recibido", numero: c.numero, banco: c.bancoNombre, quien: c.librador || formatCuit(c.cuit), fecha: c.fechaPago, importe: c.importe }));
    if (m.tipo === "PROPIO") m.cheques.forEach((c) => cheques.push({ tipo: `Propio (${c.tipo === "ECHEQ" ? "e-cheq" : "físico"})`, numero: c.numero, banco: nombreDiario(m.diarioId), quien: "", fecha: c.fechaPago, importe: c.importe }));
  }
  (d.chequesNuevos ?? []).forEach((c) => cheques.push({ tipo: "Recibido", numero: c.numero, banco: c.bancoNombre, quien: c.librador || formatCuit(c.cuit), fecha: c.fechaPago, importe: c.importe }));
  (d.chequesCartera ?? []).forEach((c) => cheques.push({ tipo: "Entregado (cartera)", numero: c.numero, banco: c.bancoNombre, quien: formatCuit(c.librador), fecha: c.fechaPago, importe: c.importe }));
  (d.chequesEmitidos ?? []).forEach((c) => cheques.push({ tipo: "Débito", numero: c.numero, banco: nombreDiario(d.diarioId), quien: c.contacto, fecha: c.fechaPago, importe: c.importe }));
  const lineas = (d.diarios ?? []).flatMap((x) => x.lineas.map((l) => ({ diario: nombreDiario(x.diarioId), ...l })));

  return (
    <>
      {d.factura && (
        <>
          <H>Factura fiscal</H>
          <Group gap={8}>
            <Text size="sm">Factura {d.factura.letra} {d.factura.numero} · del {fechaAR(d.factura.fecha)} · total $ {fmt(totalFactura(d.factura, lineasFactura(d)))}</Text>
            {adjunto(null, "Factura")}
          </Group>
        </>
      )}
      {(d.imputaciones ?? []).length > 0 && (
        <>
          <H>Facturas imputadas</H>
          <Table fz="xs" withTableBorder withColumnBorders>
            <Table.Thead><Table.Tr><Table.Th>Número</Table.Th><Table.Th>Vencimiento</Table.Th><Table.Th ta="right">Saldo al elegirla</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {d.imputaciones!.map((f) => (
                <Table.Tr key={f.id}>
                  <Table.Td style={MONO}>{f.numero}</Table.Td><Table.Td>{fechaAR(f.vencimiento)}</Table.Td>
                  <Table.Td ta="right" style={MONO}>{fmt(f.saldo)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
      {lineas.length > 0 && (
        <>
          <H>Cuentas</H>
          <Table fz="xs" withTableBorder withColumnBorders>
            <Table.Thead><Table.Tr><Table.Th>Diario</Table.Th><Table.Th>Cuenta</Table.Th><Table.Th>Descripción</Table.Th>{d.factura?.letra === "A" && <Table.Th>IVA</Table.Th>}<Table.Th ta="right">Importe</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {lineas.map((l, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{l.diario}</Table.Td><Table.Td>{l.cuentaNombre}</Table.Td><Table.Td>{l.descripcion || "—"}</Table.Td>
                  {d.factura?.letra === "A" && <Table.Td>{l.iva === "exento" ? "Exento" : l.iva ? `${l.iva.replace(".", ",")} %` : "—"}</Table.Td>}
                  <Table.Td ta="right" style={MONO}>{fmt(l.importe)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
      {cheques.length > 0 && (
        <>
          <H>Cheques</H>
          <Table fz="xs" withTableBorder withColumnBorders>
            <Table.Thead><Table.Tr><Table.Th>Tipo</Table.Th><Table.Th>Número</Table.Th><Table.Th>Banco</Table.Th><Table.Th>Librador / contacto</Table.Th><Table.Th>Fecha de pago</Table.Th><Table.Th ta="right">Importe</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {cheques.map((c, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{c.tipo}</Table.Td><Table.Td style={MONO}>{c.numero}</Table.Td><Table.Td>{c.banco}</Table.Td><Table.Td>{c.quien || "—"}</Table.Td><Table.Td>{fechaAR(c.fecha)}</Table.Td>
                  <Table.Td ta="right" style={MONO}>{fmt(c.importe)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </>
  );
}

/**
 * Detalle de una operación en un diálogo centrado: resumen, movimiento por diario, cheques/cuentas,
 * registros en Odoo y auditoría, con las acciones que correspondan. Con `confirmar`, un borrador muestra
 * la pregunta final antes de registrarse en Odoo.
 */
export function DialogoOperacion({ operacionId, fila, diarios, siguiendo, odooDisponible, confirmar, onEditar, onClose }: {
  operacionId: number | null;
  fila: Fila | null; // para movimientos cargados en Odoo (sin operación de la app)
  diarios: DiarioCfg[];
  siguiendo: boolean; // consulta el progreso mientras se ejecuta
  odooDisponible: boolean;
  confirmar?: { onOk: () => void; cargando: boolean };
  onEditar: (op: OperacionView) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const movil = useMediaQuery("(max-width: 640px)");
  const [accion, setAccion] = useState<"reanudar" | "anular" | "eliminar" | "marcar-anulada" | null>(null);
  const [preguntar, setPreguntar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const corriendo = accion === "reanudar" || accion === "anular";
  const { data: op } = useTesoreriaOperacion(operacionId, siguiendo || corriendo);
  const enCurso = siguiendo || corriendo || op?.estado === "PROCESANDO" || op?.estado === "ANULANDO";
  const nombreDiario = (id?: number) => diarios.find((x) => x.odooJournalId === id)?.nombre ?? "";
  // Completada: se agrega directo a Odoo; en otros estados solo se ven (el borrador se edita con "Seguir cargando")
  const adjunto = (diarioId: number | null, titulo: string) =>
    op ? <ClipAdjuntos opId={op.id} diarioId={diarioId} titulo={titulo} directo soloLectura={(op.estado !== "COMPLETADA" && op.estado !== "PENDIENTE_DEBITO") || !odooDisponible} /> : null;

  async function correr(a: "reanudar" | "anular" | "eliminar" | "marcar-anulada") {
    setAccion(a);
    setError(null);
    const r = await fetch(`/api/tesoreria/operaciones/${operacionId}${a === "eliminar" ? "" : `/${a}`}`, { method: a === "eliminar" ? "DELETE" : "POST" });
    const b = await r.json().catch(() => ({}));
    setAccion(null);
    setPreguntar(false);
    qc.invalidateQueries({ queryKey: ["tesoreria"] });
    if (!r.ok) return setError(b.error ?? "No se pudo completar la acción");
    if (a === "eliminar") onClose();
  }

  const titulo = op ? (
    <Group gap={10}>
      <Text style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600 }}>{TIPO_LABEL[op.tipo]}</Text>
      <Text size="xs" c="dimmed" style={MONO}>TES-{op.id}</Text>
      <Badge variant="light" color={ESTADO_COLOR[op.estado]}>{ESTADO_LABEL[op.estado]}</Badge>
      {(op.estado === "COMPLETADA" || op.estado === "PENDIENTE_DEBITO") && !enCurso && (
        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" ml="auto" aria-label="Más acciones"><EllipsisVertical size={16} /></ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item color="red" leftSection={<Ban size={14} />} disabled={!odooDisponible} onClick={() => setPreguntar(true)}>Anular</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  ) : fila ? (
    <Group gap={10}>
      <Text style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600 }}>{fila.concepto}</Text>
      <Badge variant="light" color="violet">Cargado en Odoo</Badge>
    </Group>
  ) : "Operación";

  return (
    <Modal opened onClose={enCurso ? () => {} : onClose} title={titulo} centered size="xl" fullScreen={movil} overlayProps={{ backgroundOpacity: 0.6 }} styles={{ title: { flex: 1 } }} closeOnClickOutside={!enCurso} withCloseButton={!enCurso}>
      {!op && !fila && <LoadingSpinner label="Cargando…" />}

      {/* Movimiento cargado directamente en Odoo */}
      {!op && fila && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Dato label="Fecha">{fechaAR(fila.fecha)}</Dato>
            <Dato label="Contacto">{fila.contacto}</Dato>
            <Dato label="Cuenta">{fila.cuenta}</Dato>
          </div>
          <H>Movimiento por diario</H>
          <MovDiarios mov={fila.mov} pend={fila.pend} nombreDiario={nombreDiario} />
          <Alert color="violet" variant="light" mt={16} p={10}>
            <Text size="sm">Se cargó directamente en Odoo: suma en los totales, pero no se anula ni se reanuda desde la app.</Text>
          </Alert>
        </>
      )}

      {op && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Dato label="Fecha contable">{fechaAR(op.fechaContable)}</Dato>
            <Dato label="Contacto">{op.contactoNombre}</Dato>
            <Dato label="Total"><span style={MONO}>$ {fmt(op.total)}</span></Dato>
            <Dato label="Observación">{op.observacion}</Dato>
          </div>

          {fila?.faltaEnOdoo && (op.estado === "COMPLETADA" || op.estado === "PENDIENTE_DEBITO") && (
            <Alert color="red" mt={16} p={10}>
              <Group justify="space-between" gap={8}>
                <Text size="sm" style={{ flex: 1 }}>Los registros de esta operación ya no están en Odoo (se borraron allá). No suma en el TOTAL.</Text>
                <Button size="xs" color="red" variant="light" loading={accion === "marcar-anulada"} disabled={!odooDisponible || !!accion} onClick={() => correr("marcar-anulada")}>Marcar como anulada</Button>
              </Group>
            </Alert>
          )}

          {(op.error || error) && op.estado !== "COMPLETADA" && (
            <Alert color={op.estado === "BORRADOR" ? "yellow" : "red"} mt={16} p={10}><Text size="sm">{error ?? op.error}</Text></Alert>
          )}

          <H>Movimiento por diario</H>
          <MovDiarios {...efecto(op.tipo, op.datos as Datos)} nombreDiario={nombreDiario} adjunto={adjunto} />

          <DetalleDatos op={op} nombreDiario={nombreDiario} adjunto={adjunto} />

          {op.pasos.length ? (
            <>
              <TablaPasos titulo="Registros en Odoo" pasos={op.pasos.filter((p) => p.fase === "EJECUCION")} />
              <TablaPasos titulo="Anulación" pasos={op.pasos.filter((p) => p.fase === "ANULACION")} />
            </>
          ) : (
            <>
              <H>Registros en Odoo</H>
              <Text size="sm" c="dimmed">Todavía no se registró nada en Odoo.</Text>
            </>
          )}

          <H>Historial</H>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {op.eventos.map((e, i) => (
              <Text key={i} size="xs" style={{ color: "var(--text2)" }}>
                <span style={MONO}>{fechaHora(e.creadoEn)}</span> · <b style={{ color: "var(--text)" }}>{e.empleado}</b> · {EVENTO[e.tipo] ?? e.tipo}{e.detalle ? ` — ${e.detalle}` : ""}
              </Text>
            ))}
          </div>

          {/* Acciones */}
          <Group justify="flex-end" mt={20} gap={8}>
            {preguntar ? (
              <>
                <Text size="sm" style={{ flex: 1 }}>Se revierten en Odoo todos los registros de esta operación, en orden inverso. Queda en la grilla como Anulada. ¿Anular?</Text>
                <Button variant="default" disabled={accion === "anular"} onClick={() => setPreguntar(false)}>No</Button>
                <Button color="red" loading={accion === "anular"} onClick={() => correr("anular")}>Sí, anular</Button>
              </>
            ) : confirmar && op.estado === "BORRADOR" && !enCurso ? (
              <>
                <Text size="sm" style={{ flex: 1 }}>Revisá la operación: al confirmar se registra en Odoo. ¿Confirmar?</Text>
                <Button variant="default" disabled={confirmar.cargando} onClick={onClose}>Volver</Button>
                <Button loading={confirmar.cargando} disabled={!odooDisponible} onClick={confirmar.onOk}>Confirmar</Button>
              </>
            ) : (
              <>
                {op.estado === "BORRADOR" && (
                  <>
                    <Button variant="subtle" color="red" loading={accion === "eliminar"} onClick={() => correr("eliminar")}>Eliminar borrador</Button>
                    <Button onClick={() => onEditar(op)}>Seguir cargando</Button>
                  </>
                )}
                {op.estado === "REQUIERE_ATENCION" && (
                  <Button color="red" loading={accion === "reanudar"} disabled={!odooDisponible} onClick={() => correr("reanudar")}>Reanudar</Button>
                )}
                <Button variant="default" disabled={enCurso} onClick={onClose}>Cerrar</Button>
              </>
            )}
          </Group>
        </>
      )}
    </Modal>
  );
}

function MovDiarios({ mov, pend, nombreDiario, adjunto }: { mov: Record<number, number>; pend: Record<number, number>; nombreDiario: (id?: number) => string; adjunto?: (diarioId: number, titulo: string) => React.ReactNode }) {
  const ids = [...new Set([...Object.keys(mov), ...Object.keys(pend)].map(Number))];
  if (!ids.length) return <Text size="sm" c="dimmed">Sin importes cargados.</Text>;
  return (
    <Table fz="sm" withTableBorder withColumnBorders>
      <Table.Thead><Table.Tr><Table.Th>Diario</Table.Th><Table.Th ta="right">Importe</Table.Th>{adjunto && <Table.Th w={90}>Adjuntos</Table.Th>}</Table.Tr></Table.Thead>
      <Table.Tbody>
        {ids.map((id) => (
          <Table.Tr key={id}>
            <Table.Td>{nombreDiario(id)}</Table.Td>
            {/* Lo que sale ya y lo pagado con cheque propio, cada uno en su renglón (mismo banco: transferencia + cheque) */}
            <Table.Td ta="right">
              {mov[id] ? <div><Monto v={mov[id]} />{pend[id] ? <Text span size="xs" c="dimmed"> débito en cuenta</Text> : null}</div> : null}
              {pend[id] ? <div><Monto v={pend[id]} pend /> <Text span size="xs" c="dimmed">cheque propio, a debitar</Text></div> : null}
            </Table.Td>
            {adjunto && <Table.Td>{adjunto(id, nombreDiario(id))}</Table.Td>}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
