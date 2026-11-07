"use client";
import { useEffect, useMemo, useState } from "react";
import { ActionIcon, Alert, Button, Checkbox, Group, SegmentedControl, Select, Table, Text, TextInput } from "@mantine/core";
import { Copy, Printer, Trash2 } from "lucide-react";
import { htmlChequesPropios } from "@/lib/htmlChequesPropios";
import { CUIT_CASA_SONIA, cuitValido, fmt, formatCuit, sum, sumarDias, totalesCheques, type ChequeCartera, type ChequeEmitido, type ChequeNuevo, type ChequePropio } from "@/lib/tesoreria";
import { useTesoreriaCartera, useTesoreriaChequesPropios } from "@/hooks/useTesoreria";
import { Dialogo, FechaInput, ImporteInput, MONO } from "./comunes";

const fechaAR = (f: string) => (f ? f.split("-").reverse().join("/") : "");

const Total = ({ label, v }: { label: string; v: number }) => (
  <Group justify="flex-end" gap={8}>
    <Text size="sm" c="dimmed">{label}</Text>
    <Text size="sm" fw={700} style={MONO}>$ {fmt(v)}</Text>
  </Group>
);

// ─── Cheques de terceros recibidos (alta) ───────────────────────────────────

const chequeVacio = (): ChequeNuevo => ({ tipo: "FISICO", numero: "", bancoId: null, bancoNombre: "", cuit: "", librador: "", fechaPago: "", importe: 0 });

export function DialogoChequesNuevos({ opened, inicial, bancos, onCancel, onAccept }: {
  opened: boolean;
  inicial: ChequeNuevo[];
  bancos: { id: number; nombre: string }[];
  onCancel: () => void;
  onAccept: (cs: ChequeNuevo[]) => void;
}) {
  const [cs, setCs] = useState<ChequeNuevo[]>(inicial.length ? inicial : [chequeVacio()]);
  const [errores, setErrores] = useState<string[]>([]);
  const set = (i: number, patch: Partial<ChequeNuevo>) => setCs((xs) => xs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function aceptar() {
    const errs: string[] = [];
    const vistos = new Set<string>();
    for (const c of cs) {
      const d = c.cuit.replace(/\D/g, "");
      const id = c.numero || "sin número";
      if (c.tipo === "FISICO" && !/^\d{8}$/.test(c.numero)) errs.push(`Cheque ${id}: el número debe tener 8 dígitos.`);
      if (!c.bancoId) errs.push(`Cheque ${id}: falta el banco.`);
      if (!cuitValido(d)) errs.push(`Cheque ${id}: el CUIT del librador no es válido.`);
      if (d === CUIT_CASA_SONIA) errs.push(`Cheque ${id}: es de Casa Sonia, no es un cheque de tercero.`);
      if (!c.fechaPago) errs.push(`Cheque ${id}: falta la fecha de pago.`);
      if (!c.importe) errs.push(`Cheque ${id}: falta el importe.`);
      const k = `${c.numero}|${c.bancoId}|${d}`;
      if (vistos.has(k)) errs.push(`Cheque ${id}: está cargado dos veces.`);
      vistos.add(k);
    }
    if (!errs.length) {
      const existen = await Promise.all(
        cs.map((c) => fetch(`/api/tesoreria/cheques?vista=existe&numero=${encodeURIComponent(c.numero)}&bancoId=${c.bancoId}&cuit=${c.cuit.replace(/\D/g, "")}`).then((r) => r.json()).catch(() => ({ existe: false }))),
      );
      existen.forEach((e, i) => e.existe && errs.push(`Cheque ${cs[i].numero}: ya existe en Odoo.`));
    }
    setErrores(errs);
    if (!errs.length) onAccept(cs);
  }

  async function autocompletar(i: number, cuit: string) {
    const d = cuit.replace(/\D/g, "");
    if (!cuitValido(d)) return;
    const r = await fetch(`/api/tesoreria/contactos?cuit=${d}`).then((x) => x.json()).catch(() => null);
    if (r?.existente) set(i, { librador: r.existente.nombre });
  }

  return (
    <Dialogo opened={opened} title="Cheques recibidos" onCancel={onCancel} onAccept={aceptar} size="xl">
      {cs.map((c, i) => (
        <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, alignItems: "end" }}>
          <SegmentedControl size="xs" data={[{ value: "FISICO", label: "Físico" }, { value: "ECHEQ", label: "E-cheq" }]} value={c.tipo} onChange={(v) => set(i, { tipo: v as ChequeNuevo["tipo"] })} />
          <TextInput size="xs" label="Número" value={c.numero} onChange={(e) => set(i, { numero: e.currentTarget.value.trim() })} />
          <Select size="xs" label="Banco" data={bancos.map((b) => ({ value: String(b.id), label: b.nombre }))} value={c.bancoId ? String(c.bancoId) : null} searchable
            onChange={(v) => set(i, { bancoId: v ? Number(v) : null, bancoNombre: bancos.find((b) => String(b.id) === v)?.nombre ?? "" })} />
          <TextInput size="xs" label="CUIT librador" value={c.cuit} onChange={(e) => set(i, { cuit: e.currentTarget.value })} onBlur={() => autocompletar(i, c.cuit)}
            error={c.cuit.replace(/\D/g, "").length === 11 && !cuitValido(c.cuit) ? "CUIT inválido" : undefined} />
          <TextInput size="xs" label="Librador" value={c.librador} onChange={(e) => set(i, { librador: e.currentTarget.value })} />
          <FechaInput label="Fecha de pago" value={c.fechaPago} onChange={(v) => set(i, { fechaPago: v })} />
          <div><Text size="xs" mb={2}>Importe</Text><ImporteInput value={c.importe || undefined} onChange={(v) => set(i, { importe: v ?? 0 })} /></div>
          <Group gap={4}>
            <ActionIcon variant="subtle" color="gray" aria-label="Duplicar" onClick={() => setCs((xs) => [...xs.slice(0, i + 1), { ...chequeVacio(), bancoId: c.bancoId, bancoNombre: c.bancoNombre, cuit: c.cuit, librador: c.librador, tipo: c.tipo }, ...xs.slice(i + 1)])}><Copy size={14} /></ActionIcon>
            <ActionIcon variant="subtle" color="red" aria-label="Quitar" disabled={cs.length === 1} onClick={() => setCs((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={14} /></ActionIcon>
          </Group>
        </div>
      ))}
      <Button variant="subtle" size="xs" onClick={() => setCs((xs) => [...xs, chequeVacio()])} style={{ alignSelf: "flex-start" }}>+ Otro cheque</Button>
      <Total label="Total cheques" v={sum(cs.map((c) => c.importe || 0))} />
      {errores.length > 0 && <Alert color="red">{errores.map((e) => <div key={e}>{e}</div>)}</Alert>}
    </Dialogo>
  );
}

// ─── Selector de cartera (cheques de terceros a entregar) ───────────────────

export function DialogoCartera({ opened, diarioId, inicial, onCancel, onAccept }: {
  opened: boolean;
  diarioId: number;
  inicial: ChequeCartera[];
  onCancel: () => void;
  onAccept: (cs: ChequeCartera[]) => void;
}) {
  const { data = [], isLoading, error } = useTesoreriaCartera(diarioId, opened);
  const [sel, setSel] = useState<Set<number>>(new Set(inicial.map((c) => c.id)));
  const [banco, setBanco] = useState<string | null>(null);
  const [librador, setLibrador] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [min, setMin] = useState<number | undefined>();
  const [max, setMax] = useState<number | undefined>();

  const visibles = useMemo(
    () =>
      data.filter((c) =>
        (!banco || c.bancoNombre === banco) &&
        (!librador || c.librador.includes(librador.replace(/\D/g, "")) ) &&
        (!desde || c.fechaPago >= desde) &&
        (!hasta || c.fechaPago <= hasta) &&
        (!min || c.importe >= min) &&
        (!max || c.importe <= max),
      ),
    [data, banco, librador, desde, hasta, min, max],
  );
  const total = sum(data.filter((c) => sel.has(c.id)).map((c) => c.importe));
  const toggle = (id: number) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <Dialogo opened={opened} title="Cheques de terceros en cartera" onCancel={onCancel} onAccept={() => onAccept(data.filter((c) => sel.has(c.id)))} size="xl">
      <Text size="xs" c="dimmed">No se tipea importe: se suman los cheques elegidos.</Text>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
        <Select size="xs" placeholder="Todos los bancos" data={[...new Set(data.map((c) => c.bancoNombre))].filter(Boolean)} value={banco} onChange={setBanco} clearable />
        <TextInput size="xs" placeholder="CUIT librador" value={librador} onChange={(e) => setLibrador(e.currentTarget.value)} />
        <FechaInput ariaLabel="Pago desde" value={desde} onChange={setDesde} clearable />
        <FechaInput ariaLabel="Pago hasta" value={hasta} onChange={setHasta} clearable />
        <ImporteInput value={min} onChange={setMin} placeholder="Importe mín." ariaLabel="Importe mínimo" />
        <ImporteInput value={max} onChange={setMax} placeholder="Importe máx." ariaLabel="Importe máximo" />
      </div>
      {error && <Alert color="red">{(error as Error).message}</Alert>}
      <div style={{ overflowX: "auto", maxHeight: 360 }}>
        <Table striped highlightOnHover stickyHeader fz="xs">
          <Table.Thead>
            <Table.Tr><Table.Th /><Table.Th>Número</Table.Th><Table.Th>Banco</Table.Th><Table.Th>Librador</Table.Th><Table.Th>Fecha de pago</Table.Th><Table.Th style={{ textAlign: "right" }}>Importe</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && <Table.Tr><Table.Td colSpan={6}>Cargando cartera…</Table.Td></Table.Tr>}
            {!isLoading && !data.length && <Table.Tr><Table.Td colSpan={6}>No hay cheques en cartera.</Table.Td></Table.Tr>}
            {visibles.map((c) => (
              <Table.Tr key={c.id} onClick={() => toggle(c.id)} style={{ cursor: "pointer" }}>
                <Table.Td><Checkbox size="xs" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Elegir cheque ${c.numero}`} /></Table.Td>
                <Table.Td style={MONO}>{c.numero}</Table.Td>
                <Table.Td>{c.bancoNombre}</Table.Td>
                <Table.Td>{formatCuit(c.librador)}</Table.Td>
                <Table.Td>{fechaAR(c.fechaPago)}</Table.Td>
                <Table.Td style={{ ...MONO, textAlign: "right" }}>{fmt(c.importe)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
      <Total label={`${sel.size} cheque(s) elegidos`} v={total} />
    </Dialogo>
  );
}

// ─── Emisión de cheque propio ───────────────────────────────────────────────

export function DialogoChequePropio({ opened, diarioId, fechaContable, inicial, onCancel, onAccept }: {
  opened: boolean;
  diarioId: number;
  fechaContable: string;
  inicial: ChequePropio[];
  onCancel: () => void;
  onAccept: (cs: ChequePropio[]) => void;
}) {
  const [cs, setCs] = useState<ChequePropio[]>(inicial.length ? inicial : [{ tipo: "ECHEQ", numero: "", fechaPago: fechaContable, importe: 0 }]);
  const [errores, setErrores] = useState<string[]>([]);
  const set = (i: number, patch: Partial<ChequePropio>) => setCs((xs) => xs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  // Próximo número del banco (último emitido + 1), editable
  const sinNumero = !cs[0].numero;
  useEffect(() => {
    if (!opened || !sinNumero) return;
    fetch(`/api/tesoreria/cheques?vista=proximo&diarioId=${diarioId}`)
      .then((r) => r.json())
      .then((b) => b.numero && setCs((xs) => xs.map((c, j) => (j === 0 && !c.numero ? { ...c, numero: b.numero } : c))))
      .catch(() => {});
  }, [opened, diarioId, sinNumero]);

  const siguiente = (n: string) => (/^\d+$/.test(n) ? String(Number(n) + 1).padStart(n.length, "0") : "");
  const limite = sumarDias(fechaContable, 360);

  async function aceptar() {
    const errs: string[] = [];
    const nums = new Set<string>();
    for (const c of cs) {
      const id = c.numero || "sin número";
      if (c.tipo === "FISICO" && !/^\d{8}$/.test(c.numero)) errs.push(`Cheque ${id}: el número debe tener 8 dígitos.`);
      if (!c.numero) errs.push("Falta el número de un cheque.");
      if (!c.fechaPago || c.fechaPago < fechaContable || c.fechaPago > limite) errs.push(`Cheque ${id}: la fecha de pago debe estar entre ${fechaAR(fechaContable)} y ${fechaAR(limite)}.`);
      if (!c.importe) errs.push(`Cheque ${id}: falta el importe.`);
      if (nums.has(c.numero)) errs.push(`Cheque ${id}: número repetido.`);
      nums.add(c.numero);
    }
    if (!errs.length) {
      const usados = await Promise.all(cs.map((c) => fetch(`/api/tesoreria/cheques?vista=usado&diarioId=${diarioId}&numero=${encodeURIComponent(c.numero)}`).then((r) => r.json()).catch(() => ({ usado: false }))));
      usados.forEach((u, i) => u.usado && errs.push(`El número ${cs[i].numero} ya está usado en este banco.`));
    }
    setErrores(errs);
    if (!errs.length) onAccept(cs);
  }

  return (
    <Dialogo opened={opened} title="Pagar con cheque propio" onCancel={onCancel} onAccept={aceptar} size="lg">
      {cs.map((c, i) => (
        <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, alignItems: "end" }}>
          <SegmentedControl size="xs" data={[{ value: "FISICO", label: "Físico" }, { value: "ECHEQ", label: "E-cheq" }]} value={c.tipo} onChange={(v) => set(i, { tipo: v as ChequePropio["tipo"] })} />
          <TextInput size="xs" label="Número" value={c.numero} onChange={(e) => set(i, { numero: e.currentTarget.value.trim() })} />
          <FechaInput label="Fecha de pago" min={fechaContable} max={limite} value={c.fechaPago} onChange={(v) => set(i, { fechaPago: v })} />
          <div><Text size="xs" mb={2}>Importe</Text><ImporteInput value={c.importe || undefined} onChange={(v) => set(i, { importe: v ?? 0 })} /></div>
          <ActionIcon variant="subtle" color="red" aria-label="Quitar" disabled={cs.length === 1} onClick={() => setCs((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={14} /></ActionIcon>
        </div>
      ))}
      <Button variant="subtle" size="xs" style={{ alignSelf: "flex-start" }}
        onClick={() => setCs((xs) => [...xs, { tipo: xs[xs.length - 1].tipo, numero: siguiente(xs[xs.length - 1].numero), fechaPago: fechaContable, importe: 0 }])}>
        + Otro cheque
      </Button>
      <Total label="Total cheques propios" v={sum(cs.map((c) => c.importe || 0))} />
      {errores.length > 0 && <Alert color="red">{errores.map((e) => <div key={e}>{e}</div>)}</Alert>}
    </Dialogo>
  );
}

// ─── Cheques propios a debitar (Pago de cheques propios) ────────────────────

export function DialogoChequesEmitidos({ opened, diarioId, bancoNombre, hoy, inicial, onCancel, onAccept }: {
  opened: boolean;
  diarioId: number;
  bancoNombre: string;
  hoy: string;
  inicial: ChequeEmitido[];
  onCancel: () => void;
  onAccept: (cs: ChequeEmitido[]) => void;
}) {
  const { data = [], isLoading } = useTesoreriaChequesPropios(opened ? diarioId : undefined);
  const [sel, setSel] = useState<Set<number>>(new Set(inicial.map((c) => c.id)));
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [bloqueado, setBloqueado] = useState(false);
  const toggle = (id: number) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  // Los filtros solo cambian lo que se ve; la selección se conserva
  const visibles = useMemo(
    () => data.filter((c) => (!proveedor || c.contacto === proveedor) && (!desde || c.fechaPago >= desde) && (!hasta || c.fechaPago <= hasta)),
    [data, proveedor, desde, hasta],
  );
  const t = totalesCheques(visibles, hoy);

  function imprimir() {
    const filtros = [proveedor && `Proveedor: ${proveedor}`, desde && `Pago desde ${fechaAR(desde)}`, hasta && `Pago hasta ${fechaAR(hasta)}`].filter((x): x is string => !!x);
    const url = URL.createObjectURL(new Blob([htmlChequesPropios({ banco: bancoNombre, hoy, filtros, cheques: visibles })], { type: "text/html" }));
    setBloqueado(!window.open(url, "_blank"));
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <Dialogo opened={opened} title="Cheques propios a debitar" onCancel={onCancel} onAccept={() => onAccept(data.filter((c) => sel.has(c.id)))} size="xl">
      <Group gap={8} align="flex-end">
        <Select size="xs" placeholder="Todos los proveedores" data={[...new Set(data.map((c) => c.contacto))].filter(Boolean).sort()} value={proveedor} onChange={setProveedor} searchable clearable style={{ flex: 1, minWidth: 180 }} />
        <FechaInput ariaLabel="Pago desde" value={desde} onChange={setDesde} clearable />
        <FechaInput ariaLabel="Pago hasta" value={hasta} onChange={setHasta} clearable />
        <Button size="xs" variant="light" leftSection={<Printer size={14} />} disabled={!visibles.length} onClick={imprimir}>Imprimir</Button>
      </Group>
      {bloqueado && <Alert color="yellow">El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes para este sitio.</Alert>}
      <div style={{ overflowX: "auto", maxHeight: 400 }}>
        <Table striped highlightOnHover stickyHeader fz="xs">
          <Table.Thead>
            <Table.Tr><Table.Th /><Table.Th>Número</Table.Th><Table.Th>Proveedor</Table.Th><Table.Th>Fecha de pago</Table.Th><Table.Th style={{ textAlign: "right" }}>Importe</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && <Table.Tr><Table.Td colSpan={5}>Cargando…</Table.Td></Table.Tr>}
            {!isLoading && !data.length && <Table.Tr><Table.Td colSpan={5}>No hay cheques propios pendientes de débito en este banco.</Table.Td></Table.Tr>}
            {!isLoading && data.length > 0 && !visibles.length && <Table.Tr><Table.Td colSpan={5}>Ningún cheque cumple los filtros.</Table.Td></Table.Tr>}
            {visibles.map((c) => (
              <Table.Tr key={c.id} onClick={() => toggle(c.id)} style={{ cursor: "pointer", fontWeight: c.fechaPago <= hoy ? 600 : undefined }}>
                <Table.Td><Checkbox size="xs" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Elegir cheque ${c.numero}`} /></Table.Td>
                <Table.Td style={MONO}>{c.numero}</Table.Td>
                <Table.Td>{c.contacto}</Table.Td>
                <Table.Td style={{ color: c.fechaPago <= hoy ? "var(--accent)" : undefined }}>{fechaAR(c.fechaPago)}</Table.Td>
                <Table.Td style={{ ...MONO, textAlign: "right" }}>{fmt(c.importe)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Total label={`Total listado (${t.cantidad})`} v={t.total} />
        <Total label={`Vencidos (al ${fechaAR(hoy)})`} v={t.vencidos} />
        <Total label="Por vencer" v={t.porVencer} />
        <Total label={`${sel.size} cheque(s) elegidos`} v={sum(data.filter((c) => sel.has(c.id)).map((c) => c.importe))} />
      </div>
    </Dialogo>
  );
}
