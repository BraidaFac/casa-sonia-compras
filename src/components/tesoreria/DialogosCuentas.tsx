"use client";
import { useState } from "react";
import { ActionIcon, Alert, Button, Checkbox, Group, SegmentedControl, Select, Table, Text, TextInput } from "@mantine/core";
import { Trash2 } from "lucide-react";
import { fmt, repartoFactura, round2, sum, type Factura, type FacturaPendiente, type Iva, type LineaCuenta, type LineaFactura, type Reparto, type TipoComprobante } from "@/lib/tesoreria";
import { useTesoreriaFacturasPendientes } from "@/hooks/useTesoreria";
import { Dialogo, FechaInput, ImporteInput, MONO } from "./comunes";
import { ComboBox } from "@/components/ui/ComboBox";

export type CuentaOpt = { odooAccountId: number; codigo: string; nombre: string };

// ─── Varias cuentas para un diario (Gasto / Ingreso) ────────────────────────

export function DialogoCuentas({ opened, diarioNombre, cuentas, inicial, onCancel, onAccept }: {
  opened: boolean;
  diarioNombre: string;
  cuentas: CuentaOpt[];
  inicial: LineaCuenta[];
  onCancel: () => void;
  onAccept: (ls: LineaCuenta[]) => void;
}) {
  const vacia = (): LineaCuenta => ({ cuentaId: null, cuentaNombre: "", importe: 0, descripcion: "" });
  const [ls, setLs] = useState<LineaCuenta[]>(inicial.length ? inicial : [vacia()]);
  const set = (i: number, patch: Partial<LineaCuenta>) => setLs((xs) => xs.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const opts = cuentas.map((c) => ({ id: c.odooAccountId, name: `${c.codigo} ${c.nombre}` }));
  const incompletas = ls.some((l) => !l.cuentaId || !l.importe);

  return (
    <Dialogo opened={opened} title={`Cuentas — ${diarioNombre}`} onCancel={onCancel} onAccept={() => onAccept(ls)} aceptarDisabled={incompletas} size="lg">
      {ls.map((l, i) => (
        <Group key={i} gap={8} align="flex-end" wrap="wrap">
          <div style={{ flex: "2 1 220px" }}>
            {i === 0 && <Text size="xs" mb={2}>Cuenta</Text>}
            <ComboBox placeholder="Elegir cuenta…" options={opts} value={opts.find((o) => o.id === l.cuentaId) ?? null}
              onChange={(o) => set(i, { cuentaId: o.id, cuentaNombre: o.name })} />
          </div>
          <div style={{ flex: "1 1 110px" }}>{i === 0 && <Text size="xs" mb={2}>Importe</Text>}<ImporteInput value={l.importe || undefined} onChange={(v) => set(i, { importe: v ?? 0 })} /></div>
          <TextInput size="xs" label={i === 0 ? "Descripción (opcional)" : undefined} value={l.descripcion ?? ""} onChange={(e) => set(i, { descripcion: e.currentTarget.value })} style={{ flex: "2 1 160px" }} />
          <ActionIcon variant="subtle" color="red" aria-label="Quitar" disabled={ls.length === 1} onClick={() => setLs((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={14} /></ActionIcon>
        </Group>
      ))}
      <Button variant="subtle" size="xs" style={{ alignSelf: "flex-start" }} onClick={() => setLs((xs) => [...xs, vacia()])}>+ Otra cuenta</Button>
      <Group justify="flex-end"><Text size="sm" c="dimmed">Total</Text><Text size="sm" fw={700} style={MONO}>$ {fmt(sum(ls.map((l) => l.importe || 0)))}</Text></Group>
    </Dialogo>
  );
}

// ─── Factura fiscal del Gasto ───────────────────────────────────────────────

export type LineaConDiario = { diarioId: number; diarioNombre: string; i: number; linea: LineaCuenta };

const IVAS = [{ value: "21", label: "IVA 21 %" }, { value: "10.5", label: "IVA 10,5 %" }, { value: "27", label: "IVA 27 %" }, { value: "exento", label: "Exento" }];

/** Factura contra lo pagado: ámbar = queda con saldo, rojo = sobra (gasto sin factura), verde = coincide. */
export const colorReparto = (r: Reparto) => (r.saldo > 0 ? "amber" : r.excedentes.length ? "red" : "green");

export function DialogoFactura({ opened, fechaContable, inicial, lineas, cuentas, cuentaDefault, tipos, adjuntos, onCancel, onAccept }: {
  opened: boolean;
  fechaContable: string;
  inicial: Factura | null;
  lineas: LineaConDiario[];
  cuentas: CuentaOpt[];
  cuentaDefault: { id: number; nombre: string } | null; // la elegida en la fila: va en cada línea nueva
  tipos: TipoComprobante[]; // de Odoo: comprobantes de letra A usados en compras
  adjuntos?: React.ReactNode; // clip de adjuntos de la factura
  onCancel: () => void;
  onAccept: (f: Factura | null, ivas: Record<string, Iva | undefined>) => void;
}) {
  const [lleva, setLleva] = useState(!!inicial);
  const facturaA = tipos.find((t) => t.prefijo === "FA-A") ?? tipos[0];
  const [f, setF] = useState<Factura>(inicial ?? { letra: "A", numero: "", fecha: fechaContable, tipoDocId: facturaA?.id, tipoDocPrefijo: facturaA?.prefijo });
  // Líneas de la factura: las guardadas o, por defecto, una por línea del gasto con su importe
  const nueva = (): LineaFactura => ({ cuentaId: cuentaDefault?.id ?? null, cuentaNombre: cuentaDefault?.nombre ?? "", neto: 0, iva: "21" });
  const [ls, setLs] = useState<LineaFactura[]>(() =>
    inicial?.lineas ?? (lineas.length
      ? lineas.map((l) => ({ cuentaId: l.linea.cuentaId, cuentaNombre: l.linea.cuentaNombre, neto: l.linea.importe, iva: l.linea.iva ?? "21", origen: `${l.diarioId}-${l.i}` }))
      : [nueva()]),
  );
  const set = (i: number, patch: Partial<LineaFactura>) => setLs((xs) => xs.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const opts = cuentas.map((c) => ({ id: c.odooAccountId, name: `${c.codigo} ${c.nombre}` }));
  const conIva = lleva && f.letra === "A";

  // La línea del gasto toma el IVA de la línea de la factura que se precargó de ella
  const ivas: Record<string, Iva | undefined> = Object.fromEntries(lineas.map((l) => {
    const k = `${l.diarioId}-${l.i}`;
    return [k, ls.find((x) => x.origen === k)?.iva];
  }));
  const diarios = [...new Set(lineas.map((l) => l.diarioId))].map((id) => ({
    diarioId: id,
    lineas: lineas.filter((l) => l.diarioId === id).map((l) => ({ ...l.linea, iva: ivas[`${l.diarioId}-${l.i}`] })),
  }));
  const r = repartoFactura(f, ls, diarios);
  const exc = sum(r.excedentes.map((e) => e.importe));
  const color = colorReparto(r);

  const error =
    lleva && !/^\d{1,5}-\d{1,8}$/.test(f.numero.trim()) ? "El número tiene el formato 00001-00000001." :
    lleva && (!f.fecha || f.fecha > fechaContable) ? "La fecha de la factura no puede ser posterior a la fecha contable." :
    lleva && !ls.length ? "Cargá al menos una línea en la factura." :
    lleva && ls.some((l) => !l.cuentaId || !l.neto) ? "Hay una línea de la factura sin cuenta o sin importe." : null;

  return (
    <Dialogo opened={opened} title="Factura fiscal" onCancel={onCancel} onAccept={() => onAccept(lleva ? { ...f, numero: f.numero.trim(), ...(f.letra === "A" ? {} : { tipoDocId: undefined, tipoDocPrefijo: undefined }), lineas: ls.map((l) => ({ ...l, iva: f.letra === "A" ? l.iva : undefined })) } : null, f.letra === "A" ? ivas : {})} aceptarDisabled={!!error} size="xl">
      <Checkbox label="¿Lleva factura fiscal?" checked={lleva} onChange={(e) => setLleva(e.currentTarget.checked)} />
      {lleva && (
        <>
          <Text size="xs" c="dimmed">La app crea la factura de compra en Odoo y la paga con los importes del gasto. Las líneas arrancan con el importe de cada columna y se pueden cambiar. El proveedor pasa a ser obligatorio.
            {f.letra === "A" ? " La A va al diario con comprobantes." : " La B y la C van al diario sin comprobantes, con el número en la referencia."}</Text>
          <Group align="flex-end" wrap="wrap">
            <SegmentedControl size="xs" data={["A", "B", "C"].map((x) => ({ value: x, label: `Factura ${x}` }))} value={f.letra} onChange={(v) => setF({ ...f, letra: v as Factura["letra"] })} />
            {f.letra === "A" && (
              <Select size="xs" label="Comprobante" w={200} allowDeselect={false} data={tipos.map((t) => ({ value: String(t.id), label: `${t.prefijo} · ${t.nombre}` }))}
                value={f.tipoDocId ? String(f.tipoDocId) : null}
                onChange={(v) => { const t = tipos.find((x) => String(x.id) === v); setF({ ...f, tipoDocId: t?.id, tipoDocPrefijo: t?.prefijo }); }} />
            )}
            <TextInput size="xs" label="Número" placeholder="00008-12345678" value={f.numero} onChange={(e) => setF({ ...f, numero: e.currentTarget.value })} />
            <FechaInput label="Fecha del comprobante" max={fechaContable} value={f.fecha} onChange={(v) => setF({ ...f, fecha: v })} />
            {adjuntos && <Group gap={4} align="center" pb={4}><Text size="xs" c="dimmed">Adjunto</Text>{adjuntos}</Group>}
          </Group>
          {ls.map((l, i) => (
            <Group key={i} gap={8} align="flex-end" wrap="wrap">
              <div style={{ flex: "2 1 220px" }}>
                {i === 0 && <Text size="xs" mb={2}>Cuenta</Text>}
                <ComboBox placeholder="Elegir cuenta…" options={opts} value={opts.find((o) => o.id === l.cuentaId) ?? null}
                  onChange={(o) => set(i, { cuentaId: o.id, cuentaNombre: o.name })} />
              </div>
              <div style={{ flex: "1 1 110px" }}>{i === 0 && <Text size="xs" mb={2}>{conIva ? "Neto" : "Importe"}</Text>}<ImporteInput value={l.neto || undefined} onChange={(v) => set(i, { neto: v ?? 0 })} /></div>
              {conIva && <Select size="xs" w={110} label={i === 0 ? "IVA" : undefined} data={IVAS} value={l.iva ?? null} onChange={(v) => set(i, { iva: (v as Iva) ?? undefined })} allowDeselect={false} />}
              <ActionIcon variant="subtle" color="red" aria-label="Quitar" onClick={() => setLs((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={14} /></ActionIcon>
            </Group>
          ))}
          <Button variant="subtle" size="xs" style={{ alignSelf: "flex-start" }} onClick={() => setLs((xs) => [...xs, nueva()])}>+ Otra línea</Button>
          <Group justify="flex-end" gap={16}>
            <Text size="sm" c="dimmed">Pagado <b style={MONO}>$ {fmt(r.pagado)}</b></Text>
            <Text size="sm" c="dimmed">Total del comprobante</Text>
            <Text size="sm" fw={700} c={color} style={MONO}>$ {fmt(r.total)}</Text>
          </Group>
          {ls.length > 0 && (
            <Alert color={color} variant="light" p="xs">
              {r.saldo > 0
                ? r.pagado > 0
                  ? `El importe de la factura no coincide con los gastos: la factura queda con saldo $ ${fmt(r.saldo)}.`
                  : `No hay pagos cargados: la factura queda impaga por $ ${fmt(r.saldo)}.`
                : exc > 0
                  ? `El gasto supera a la factura: se salda el total de la factura y quedan $ ${fmt(exc)} como gasto sin factura en ${r.excedentes.map((e) => `${e.cuentaNombre} ($ ${fmt(e.importe)})`).join(", ")}.`
                  : "La factura coincide con los gastos y queda pagada."}
            </Alert>
          )}
        </>
      )}
      {error && <Alert color="red">{error}</Alert>}
    </Dialogo>
  );
}

// ─── Imputación a facturas (Pago / Cobro) ───────────────────────────────────

const fechaAR = (f: string) => (f ? f.split("-").reverse().join("/") : "");

/** Facturas con saldo del contacto. No se tipea importe: Odoo aplica de la más vieja a la más nueva. */
export function DialogoImputacion({ opened, contactoId, contactoNombre, tipo, total, inicial, onCancel, onAccept }: {
  opened: boolean;
  contactoId: number;
  contactoNombre: string;
  tipo: "PAGO" | "COBRO";
  total: number; // importe de la operación
  inicial: FacturaPendiente[];
  onCancel: () => void;
  onAccept: (fs: FacturaPendiente[]) => void;
}) {
  const { data = [], isLoading, error } = useTesoreriaFacturasPendientes(contactoId, tipo, opened);
  const [sel, setSel] = useState<Set<number>>(new Set(inicial.map((f) => f.id)));
  const toggle = (id: number) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const elegido = sum(data.filter((f) => sel.has(f.id)).map((f) => f.saldo));
  const dif = round2(total - elegido);
  return (
    <Dialogo opened={opened} title={`Facturas a imputar — ${contactoNombre}`} onCancel={onCancel} onAccept={() => onAccept(data.filter((f) => sel.has(f.id)))} size="xl"
      aceptarDisabled={isLoading || !!error || (sel.size > 0 && elegido <= 0)}>
      {error && <Alert color="red">{error.message}</Alert>}
      <div style={{ overflowX: "auto", maxHeight: 400 }}>
        <Table striped highlightOnHover stickyHeader fz="xs">
          <Table.Thead>
            <Table.Tr><Table.Th /><Table.Th>Número</Table.Th><Table.Th>Fecha</Table.Th><Table.Th>Vencimiento</Table.Th><Table.Th style={{ textAlign: "right" }}>Total</Table.Th><Table.Th style={{ textAlign: "right" }}>Saldo</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && <Table.Tr><Table.Td colSpan={6}>Cargando…</Table.Td></Table.Tr>}
            {!isLoading && !error && !data.length && <Table.Tr><Table.Td colSpan={6}>{contactoNombre} no tiene facturas con saldo.</Table.Td></Table.Tr>}
            {data.map((f) => (
              <Table.Tr key={f.id} onClick={() => toggle(f.id)} style={{ cursor: "pointer" }}>
                <Table.Td><Checkbox size="xs" checked={sel.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Elegir factura ${f.numero}`} /></Table.Td>
                <Table.Td style={MONO}>{f.numero}</Table.Td>
                <Table.Td>{fechaAR(f.fecha)}</Table.Td>
                <Table.Td>{fechaAR(f.vencimiento)}</Table.Td>
                <Table.Td style={{ ...MONO, textAlign: "right" }}>{fmt(f.total)}</Table.Td>
                <Table.Td style={{ ...MONO, textAlign: "right" }}>{fmt(f.saldo)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
      <Group justify="flex-end" gap={16}>
        <Text size="sm" c="dimmed">{tipo === "PAGO" ? "Pago" : "Cobro"} <b style={MONO}>$ {fmt(total)}</b></Text>
        <Text size="sm" c="dimmed">{sel.size} factura(s) <b style={MONO}>$ {fmt(elegido)}</b></Text>
        {sel.size > 0 && dif !== 0 && <Text size="sm" c="dimmed">{dif > 0 ? "A cuenta" : "Queda con saldo"} <b style={MONO}>$ {fmt(Math.abs(dif))}</b></Text>}
      </Group>
      <Text size="xs" c="dimmed">Odoo aplica el importe de la factura más vieja a la más nueva.</Text>
    </Dialogo>
  );
}
