// Tesorería — qué registros crea cada operación en Odoo (pasos) y cómo se ejecuta y revierte cada uno.
// Cada ejecutor es "buscar por referencia o crear": reanudar nunca duplica.
import {
  brutoLinea,
  diferenciaCambio,
  etiqueta,
  lineasFactura,
  repartoFactura,
  prefijoFacturas,
  round2,
  sum,
  totalMedio,
  type Datos,
  type Tipo,
} from "@/lib/tesoreria";
import type { ConfigTesoreria } from "@/lib/tesoreriaConfig";
import {
  chequeTerceroExiste,
  chequesEnDiario,
  chequesPropiosPendientes,
  contactosActivos,
  cuentasOdoo,
  diariosOdoo,
  facturasPendientes,
  metodosPago,
  numeroPropioUsado,
  OdooTesoreriaError,
  ot,
  sr,
} from "@/lib/odooTesoreria";
import { prisma } from "@/lib/prisma";
import { registroAdjuntable, subirAdjunto } from "@/lib/tesoreriaAdjuntos";

// ─── Tipos de paso ──────────────────────────────────────────────────────────

export type PasoDef =
  | { tipo: "linea"; diarioId: number; importe: number; etiqueta: string; partnerId: number | null; cuentaId: number }
  | {
      tipo: "pago";
      paymentType: "inbound" | "outbound";
      partnerType: "customer" | "supplier";
      partnerId: number;
      diarioId: number;
      metodo: "manual" | "new_third_party_checks" | "out_third_party_checks" | "own_checks";
      importe: number;
      etiqueta: string; // también la de la línea de extracto
      memo?: string; // memo del pago si difiere (prefijo con los números de factura)
      chequesNuevos?: { numero: string; bancoId: number | null; cuit: string; fechaPago: string; importe: number }[];
      chequesCartera?: number[];
    }
  | { tipo: "conciliar_pago"; pasoPago?: number; chequeId?: number; diarioId: number; importe: number; etiqueta: string; partnerId: number | null }
  | {
      tipo: "factura";
      partnerId: number;
      diarioId: number;
      letra: "A" | "B" | "C";
      tipoDocId: number | null; // A: tipo de comprobante; B/C: null (diario sin comprobantes, número en ref)
      numero: string;
      fecha: string;
      lineas: { cuentaId: number; descripcion: string; neto: number; iva: string | null }[];
    }
  // Gasto con cheque propio: lo que la columna no paga de la factura, contra la cuenta de proveedores del contacto
  | { tipo: "asiento"; diarioId: number; partnerId: number; lineas: { cuentaId: number; importe: number; etiqueta: string }[] }
  // Gasto: la factura creada en la operación (pasoFactura) y los asientos de cheque propio (asientos); Pago/Cobro: facturas existentes elegidas (facturas)
  | { tipo: "conciliar_factura"; pasoFactura?: number; asientos?: number[]; facturas?: number[]; pasosPago: number[] }
  | { tipo: "ajuste"; pasosPago: number[]; partnerId: number; diarioId: number | null; gananciaId: number | null; perdidaId: number | null; etiqueta: string }
  | { tipo: "adjunto"; adjuntoId: number; nombre: string; pasos: number[] } // sube a Odoo un adjunto del borrador
  // Anulación
  | { tipo: "borrar_linea"; statementLineId: number }
  | { tipo: "cancelar_pago"; paymentId: number }
  | { tipo: "cancelar_asiento"; moveId: number };

export const PASO_LABEL: Record<PasoDef["tipo"], (p: PasoDef) => string> = {
  linea: () => "Línea de extracto contra la cuenta",
  pago: (p) => (p.tipo === "pago" ? `${p.paymentType === "outbound" ? "Pago" : "Cobro"}${p.metodo === "manual" ? "" : p.metodo === "own_checks" ? " con cheque propio" : " con cheques"}` : ""),
  conciliar_pago: () => "Línea de extracto y conciliación",
  factura: () => "Factura de compra",
  asiento: () => "Asiento del gasto contra la cuenta del contacto",
  conciliar_factura: (p) =>
    p.tipo !== "conciliar_factura" ? "" : p.facturas ? "Imputar a las facturas" : p.pasoFactura !== undefined ? "Conciliar pagos con la factura" : "Conciliar pagos con el asiento",
  ajuste: () => "Ajuste de la diferencia en la cuenta del contacto",
  adjunto: (p) => (p.tipo === "adjunto" ? `Adjunto ${p.nombre}` : ""),
  borrar_linea: () => "Borrar línea de extracto",
  cancelar_pago: () => "Cancelar pago",
  cancelar_asiento: () => "Cancelar asiento",
};

export type OpEjec = {
  id: number;
  tipo: Tipo;
  fechaContable: string;
  contactoId: number | null;
  contactoNombre: string | null;
  observacion: string | null;
  datos: Datos;
};

// ─── Generación de pasos ────────────────────────────────────────────────────

export function generarPasos(op: OpEjec, cfg: ConfigTesoreria): PasoDef[] {
  const d = op.datos;
  const nombreDiario = (id?: number) => cfg.diarios.find((x) => x.odooJournalId === id)?.nombre ?? "";
  const lbl = etiqueta(op.tipo, d, { observacion: op.observacion, contacto: op.contactoNombre, diarioNombre: nombreDiario });
  const partner = op.contactoId;
  const pasos: PasoDef[] = [];
  const push = (p: PasoDef) => pasos.push(p) - 1; // devuelve el índice (orden) del paso

  const pagoYConciliar = (p: Extract<PasoDef, { tipo: "pago" }>, signo: 1 | -1) => {
    const i = push(p);
    push({ tipo: "conciliar_pago", pasoPago: i, diarioId: p.diarioId, importe: signo * p.importe, etiqueta: p.etiqueta, partnerId: p.partnerId });
    return i;
  };

  switch (op.tipo) {
    case "PAGO":
    case "COBRO": {
      const out = op.tipo === "PAGO";
      const pagos: number[] = [];
      for (const m of d.medios ?? []) {
        const base = {
          tipo: "pago" as const,
          paymentType: out ? ("outbound" as const) : ("inbound" as const),
          partnerType: out ? ("supplier" as const) : ("customer" as const),
          partnerId: partner!,
          diarioId: m.diarioId,
          importe: totalMedio(m),
          etiqueta: lbl,
          memo: d.imputaciones?.length ? `${prefijoFacturas(d.imputaciones.map((f) => f.numero))} - ${lbl}` : undefined,
        };
        if (m.tipo === "IMPORTE") pagos.push(pagoYConciliar({ ...base, metodo: "manual" }, out ? -1 : 1));
        if (m.tipo === "CARTERA") pagos.push(pagoYConciliar({ ...base, metodo: "out_third_party_checks", chequesCartera: m.cheques.map((c) => c.id) }, -1));
        if (m.tipo === "NUEVOS") pagos.push(pagoYConciliar({ ...base, metodo: "new_third_party_checks", chequesNuevos: m.cheques }, 1));
        if (m.tipo === "PROPIO")
          pagos.push(push({ ...base, metodo: "own_checks", chequesNuevos: m.cheques.map((c) => ({ numero: c.numero, bancoId: null, cuit: "", fechaPago: c.fechaPago, importe: c.importe })) }));
      }
      if (d.imputaciones?.length) push({ tipo: "conciliar_factura", facturas: d.imputaciones.map((f) => f.id), pasosPago: pagos });
      break;
    }
    case "GASTO":
    case "INGRESO": {
      const s = op.tipo === "GASTO" ? -1 : 1;
      const etq = (desc?: string) => (desc ? `${lbl} — ${desc}` : lbl);
      const conCheque = (diarioId: number) => !!(d.diarios ?? []).find((x) => x.diarioId === diarioId)?.cheques?.length;
      const pagos: number[] = [];
      const asientos: number[] = [];
      // Columna con cheque propio: lo que no paga la factura va a un asiento contra el contacto; se paga con los cheques y el resto sale del banco
      const pagarConCheques = (x: NonNullable<Datos["diarios"]>[number], excedentes: { cuentaId: number | null; descripcion?: string; importe: number }[], memo?: string) => {
        if (excedentes.length)
          asientos.push(push({ tipo: "asiento", diarioId: cfg.fijos.diarioAjustesId!, partnerId: partner!, lineas: excedentes.map((e) => ({ cuentaId: e.cuentaId!, importe: e.importe, etiqueta: etq(e.descripcion) })) }));
        const base = { tipo: "pago" as const, paymentType: "outbound" as const, partnerType: "supplier" as const, partnerId: partner!, diarioId: x.diarioId, etiqueta: lbl, memo };
        const chq = sum(x.cheques!.map((c) => c.importe));
        pagos.push(push({ ...base, metodo: "own_checks", importe: chq, chequesNuevos: x.cheques!.map((c) => ({ numero: c.numero, bancoId: null, cuit: "", fechaPago: c.fechaPago, importe: c.importe })) }));
        const resto = round2(sum(x.lineas.map((l) => brutoLinea(l, d.factura))) - chq);
        if (resto > 0) pagos.push(pagoYConciliar({ ...base, metodo: "manual", importe: resto }, -1));
      };
      if (op.tipo === "GASTO" && d.factura) {
        const f = push({
          tipo: "factura",
          partnerId: partner!,
          // Como el contador: A en el diario con comprobantes; B/C en el sin comprobantes
          diarioId: (d.factura.letra === "A" ? cfg.fijos.diarioComprasId : cfg.fijos.diarioComprasSinDocId)!,
          letra: d.factura.letra,
          tipoDocId: d.factura.letra === "A" ? d.factura.tipoDocId ?? FACTURA_A : null,
          numero: d.factura.numero,
          fecha: d.factura.fecha,
          lineas: lineasFactura(d).map((l) => ({ cuentaId: l.cuentaId!, descripcion: lbl, neto: l.neto, iva: d.factura!.letra === "A" ? l.iva ?? null : null })),
        });
        // Los pagos cubren hasta el total de la factura; el excedente de cada línea va a su cuenta (gasto sin factura)
        const r = repartoFactura(d.factura, lineasFactura(d), d.diarios ?? []);
        const memo = `${prefijoFacturas([nombreFactura(d.factura)])} - ${lbl}`;
        for (const x of r.pagos.filter((x) => !conCheque(x.diarioId)))
          pagos.push(pagoYConciliar({ tipo: "pago", paymentType: "outbound", partnerType: "supplier", partnerId: partner!, diarioId: x.diarioId, metodo: "manual", importe: x.importe, etiqueta: lbl, memo }, -1));
        for (const e of r.excedentes.filter((e) => !conCheque(e.diarioId)))
          push({ tipo: "linea", diarioId: e.diarioId, importe: -e.importe, etiqueta: etq(e.descripcion), partnerId: partner, cuentaId: e.cuentaId! });
        for (const x of d.diarios ?? []) if (conCheque(x.diarioId)) pagarConCheques(x, r.excedentes.filter((e) => e.diarioId === x.diarioId), memo);
        if (pagos.length) push({ tipo: "conciliar_factura", pasoFactura: f, asientos, pasosPago: pagos });
      } else {
        for (const x of d.diarios ?? []) {
          if (conCheque(x.diarioId)) {
            pagarConCheques(x, x.lineas);
            continue;
          }
          for (const l of x.lineas)
            push({ tipo: "linea", diarioId: x.diarioId, importe: s * l.importe, etiqueta: etq(l.descripcion), partnerId: partner, cuentaId: l.cuentaId! });
        }
        if (asientos.length) push({ tipo: "conciliar_factura", asientos, pasosPago: pagos });
      }
      break;
    }
    case "MOVIMIENTO":
      push({ tipo: "linea", diarioId: d.origenId!, importe: -d.importe!, etiqueta: lbl, partnerId: null, cuentaId: cfg.fijos.cuentaPuenteId! });
      push({ tipo: "linea", diarioId: d.destinoId!, importe: d.importe!, etiqueta: lbl, partnerId: null, cuentaId: cfg.fijos.cuentaPuenteId! });
      break;
    case "SOCIOS":
      push({ tipo: "linea", diarioId: d.diarioId!, importe: (d.sentido === "RETIRO" ? -1 : 1) * d.importe!, etiqueta: lbl, partnerId: null, cuentaId: d.cuentaId! });
      break;
    case "PAGO_CHEQUES_PROPIOS":
      for (const c of d.chequesEmitidos ?? [])
        push({ tipo: "conciliar_pago", chequeId: c.id, diarioId: d.diarioId!, importe: -c.importe, etiqueta: op.observacion?.trim() || `Débito cheque ${c.numero} — ${c.contacto}`, partnerId: null });
      break;
    case "CAMBIO_RECIBO":
    case "CAMBIO_ENTREGO": {
      const recibo = op.tipo === "CAMBIO_RECIBO";
      const partnerType = recibo ? ("customer" as const) : ("supplier" as const);
      const chq = recibo ? sum((d.chequesNuevos ?? []).map((c) => c.importe)) : sum((d.chequesCartera ?? []).map((c) => c.importe));
      const p1 = pagoYConciliar(
        recibo
          ? { tipo: "pago", paymentType: "inbound", partnerType, partnerId: partner!, diarioId: d.chequesDiarioId!, metodo: "new_third_party_checks", importe: chq, etiqueta: `${lbl} — cheques`, chequesNuevos: d.chequesNuevos }
          : { tipo: "pago", paymentType: "outbound", partnerType, partnerId: partner!, diarioId: d.chequesDiarioId!, metodo: "out_third_party_checks", importe: chq, etiqueta: `${lbl} — cheques`, chequesCartera: (d.chequesCartera ?? []).map((c) => c.id) },
        recibo ? 1 : -1,
      );
      const p2 = pagoYConciliar(
        { tipo: "pago", paymentType: recibo ? "outbound" : "inbound", partnerType, partnerId: partner!, diarioId: d.diarioEfectivoId!, metodo: "manual", importe: d.efectivo!, etiqueta: `${lbl} — efectivo` },
        recibo ? -1 : 1,
      );
      push({ tipo: "ajuste", pasosPago: [p1, p2], partnerId: partner!, diarioId: cfg.fijos.diarioAjustesId, gananciaId: cfg.fijos.cuentaGananciaId, perdidaId: cfg.fijos.cuentaPerdidaId, etiqueta: `${lbl} — diferencia` });
      break;
    }
  }
  return pasos;
}

// ─── Revalidación contra Odoo (antes de escribir nada) ──────────────────────

/** Devuelve el primer motivo por el que la operación ya no se puede ejecutar, o null. */
export async function revalidar(op: OpEjec, cfg: ConfigTesoreria): Promise<string | null> {
  const d = op.datos;
  const pasos = generarPasos(op, cfg);
  const [diarios, cuentas] = await Promise.all([diariosOdoo(), cuentasOdoo()]);
  const diarioIds = new Set(diarios.map((x) => x.id));
  const cuentaIds = new Set(cuentas.map((x) => x.id));

  if (op.contactoId && !(await contactosActivos([op.contactoId])).has(op.contactoId)) return "El contacto ya no está activo en Odoo.";

  if (pasos.some((p) => p.tipo === "asiento") && !cfg.fijos.diarioAjustesId) return "Falta configurar el diario de ajustes (lo configura un Admin).";
  // El diario de compras de la factura y el de ajustes no son de efectivo ni banco: se controlan aparte (fijos)
  const diariosUsados = new Set(pasos.flatMap((p) => (p.tipo !== "factura" && p.tipo !== "asiento" && "diarioId" in p && p.diarioId ? [p.diarioId] : [])));
  for (const id of diariosUsados) if (!diarioIds.has(id)) return `El diario ${cfg.diarios.find((x) => x.odooJournalId === id)?.nombre ?? id} ya no está disponible en Odoo.`;
  for (const p of pasos)
    if ((p.tipo === "linea" && !cuentaIds.has(p.cuentaId)) || ((p.tipo === "factura" || p.tipo === "asiento") && p.lineas.some((l) => !cuentaIds.has(l.cuentaId))))
      return "Una de las cuentas ya no está disponible en Odoo.";

  // Métodos de pago necesarios
  const metodos = await metodosPago([...diariosUsados]);
  for (const p of pasos) {
    if (p.tipo !== "pago") continue;
    if (!metodos.some((m) => m.diarioId === p.diarioId && m.code === p.metodo && m.tipo === p.paymentType)) {
      return `El diario ${cfg.diarios.find((x) => x.odooJournalId === p.diarioId)?.nombre} no tiene en Odoo el método de pago necesario.`;
    }
  }

  // Cheques
  if (d.chequesDiarioId || (d.medios ?? []).some((m) => m.tipo !== "IMPORTE")) {
    const cartera = [...(d.chequesCartera ?? []), ...(d.medios ?? []).flatMap((m) => (m.tipo === "CARTERA" ? m.cheques : []))];
    const chqDiario = cfg.diarios.find((x) => x.tipo === "CHEQUES")?.odooJournalId;
    if (cartera.length && chqDiario) {
      const enCartera = await chequesEnDiario(cartera.map((c) => c.id), chqDiario);
      const fuera = cartera.find((c) => !enCartera.has(c.id));
      if (fuera) return `El cheque ${fuera.numero} ya no está en cartera.`;
    }
    const nuevos = [...(d.chequesNuevos ?? []), ...(d.medios ?? []).flatMap((m) => (m.tipo === "NUEVOS" ? m.cheques : []))];
    for (const c of nuevos) if (c.bancoId && (await chequeTerceroExiste(c.numero, c.bancoId, c.cuit))) return `El cheque ${c.numero} ya existe en Odoo.`;
    for (const m of d.medios ?? []) {
      if (m.tipo !== "PROPIO") continue;
      for (const c of m.cheques) if (await numeroPropioUsado(m.diarioId, c.numero)) return `El número de cheque propio ${c.numero} ya está usado en ese banco.`;
    }
  }
  for (const x of d.diarios ?? [])
    for (const c of x.cheques ?? []) if (await numeroPropioUsado(x.diarioId, c.numero)) return `El número de cheque propio ${c.numero} ya está usado en ese banco.`;
  if ((op.tipo === "PAGO" || op.tipo === "COBRO") && d.imputaciones?.length) {
    const pend = new Set((await facturasPendientes(op.contactoId!, op.tipo)).map((f) => f.id));
    const ya = d.imputaciones.find((f) => !pend.has(f.id));
    if (ya) return `La factura ${ya.numero} ya no tiene saldo de este contacto en Odoo.`;
  }
  if (op.tipo === "PAGO_CHEQUES_PROPIOS") {
    const pend = new Set((await chequesPropiosPendientes(d.diarioId!)).map((c) => c.id));
    const ya = (d.chequesEmitidos ?? []).find((c) => !pend.has(c.id));
    if (ya) return `El cheque ${ya.numero} ya no está pendiente de débito.`;
  }

  // Cuentas y diarios fijos
  if (op.tipo === "MOVIMIENTO" && !cfg.fijos.cuentaPuenteId) return "Falta configurar la cuenta puente (lo configura un Admin).";
  if (op.tipo === "CAMBIO_RECIBO" || op.tipo === "CAMBIO_ENTREGO") {
    const dif = diferenciaCambio(op.tipo, d);
    if (dif !== 0 && (!cfg.fijos.cuentaGananciaId || !cfg.fijos.cuentaPerdidaId || !cfg.fijos.diarioAjustesId))
      return "Falta configurar las cuentas de ganancia y pérdida del cambio de cheques o el diario de ajustes (lo configura un Admin).";
  }
  if (op.tipo === "GASTO" && d.factura) {
    const conDoc = d.factura.letra === "A";
    if (conDoc && !cfg.fijos.diarioComprasId) return "Falta configurar el diario de compras con comprobantes (lo configura un Admin).";
    if (!conDoc && !cfg.fijos.diarioComprasSinDocId) return "Falta configurar el diario de compras sin comprobantes para facturas B y C (lo configura un Admin).";
    const base = [["partner_id", "=", op.contactoId], ["move_type", "=", "in_invoice"], ["state", "!=", "cancel"]];
    const n = await ot<number>("account.move", "search_count", {
      domain: conDoc
        ? [...base, ["l10n_latam_document_type_id", "=", d.factura.tipoDocId ?? FACTURA_A], ["name", "=", nombreFactura(d.factura)]]
        : [...base, ["journal_id", "=", cfg.fijos.diarioComprasSinDocId], ["ref", "=", d.factura.numero.trim()]],
    });
    if (n) return "Ya existe en Odoo una factura de ese proveedor con ese tipo y número.";
  }
  return null;
}

const FACTURA_A = 1; // l10n_latam.document.type "(1) INVOICES A": borradores sin tipo elegido
/**
 * A: nombre que Odoo da a la factura (ej. "FA-A 00002-00011165"; l10n_latam_document_number no es buscable).
 * B/C: van sin comprobante (el nombre es la secuencia del diario): "Fc B {número}" solo para el memo.
 */
const nombreFactura = (f: { letra: "A" | "B" | "C"; numero: string; tipoDocPrefijo?: string }) =>
  f.letra === "A" ? `${f.tipoDocPrefijo ?? "FA-A"} ${normalizarNumero(f.numero)}` : `Fc ${f.letra} ${f.numero.trim()}`;
const normalizarNumero = (n: string) => {
  const [pv, nro] = n.trim().split("-");
  return `${pv.padStart(5, "0")}-${nro.padStart(8, "0")}`;
};

// ─── Ejecución ──────────────────────────────────────────────────────────────

export type CtxPaso = {
  ref: string; // TES-{op}-{orden}
  nota: string; // Registrado por …
  fecha: string;
  resultados: Map<number, { odooModelo: string | null; odooId: number | null }>; // pasos OK por orden
};
export type ResultadoPaso = { odooModelo: string | null; odooId: number | null };

type M2O = [number, string] | false;
const id = (v: M2O) => (v ? v[0] : 0);

async function buscarPorRef(model: string, campo: string, ref: string): Promise<number | null> {
  const r = await sr<{ id: number }>(model, [[campo, "=", ref]], ["id"], { limit: 1 });
  return r[0]?.id ?? null;
}

async function crearLinea(ctx: CtxPaso, v: { diarioId: number; importe: number; etiqueta: string; partnerId: number | null; cuentaId: number }) {
  const existente = await buscarPorRef("account.bank.statement.line", "move_id.ref", ctx.ref);
  if (existente) return existente;
  const res = await ot<number[] | number>("account.bank.statement.line", "create", {
    vals_list: [{
      journal_id: v.diarioId,
      date: ctx.fecha,
      payment_ref: v.etiqueta,
      amount: v.importe,
      partner_id: v.partnerId || false,
      ref: ctx.ref,
      narration: ctx.nota,
      counterpart_account_id: v.cuentaId,
    }],
  });
  return Array.isArray(res) ? res[0] : res;
}

async function moveDeLinea(stmtId: number): Promise<number> {
  const [l] = await sr<{ move_id: M2O }>("account.bank.statement.line", [["id", "=", stmtId]], ["move_id"]);
  if (!l) throw new OdooTesoreriaError("La línea de extracto no existe en Odoo.", false, `statement line ${stmtId}`);
  return id(l.move_id);
}

async function reconciliar(lineIds: number[]) {
  if (lineIds.length < 2) return;
  await ot("account.move.line", "reconcile", { ids: lineIds });
}

const metodoLinea = async (diarioId: number, code: string, tipo: string) => {
  const m = (await metodosPago([diarioId])).find((x) => x.code === code && x.tipo === tipo);
  if (!m) throw new OdooTesoreriaError("El diario no tiene el método de pago necesario.", false, `${diarioId} ${code} ${tipo}`);
  return m;
};

async function impuestoCompra(iva: string | null, letra: "A" | "B" | "C"): Promise<number | null> {
  const nombre = letra !== "A" ? "IVA No Corresp" : iva === "exento" ? "IVA Exen" : iva === "21" ? "IVA 21% Compras" : iva === "10.5" ? "IVA 10.5%" : iva === "27" ? "IVA 27%" : null;
  if (!nombre) return null;
  const [t] = await sr<{ id: number }>("account.tax", [["type_tax_use", "=", "purchase"], ["name", "=", nombre]], ["id"], { limit: 1 });
  if (!t) throw new OdooTesoreriaError(`Odoo no tiene el impuesto ${nombre}.`, false, `account.tax ${nombre}`);
  return t.id;
}

const resultado = (ctx: CtxPaso, orden: number) => {
  const r = ctx.resultados.get(orden);
  if (!r?.odooId) throw new OdooTesoreriaError("Falta un paso anterior.", false, `paso ${orden} sin resultado`);
  return r.odooId;
};

/** Líneas de la cuenta del contacto (a cobrar / a pagar) de un asiento, sin conciliar del todo. */
async function lineasContacto(moveIds: number[]) {
  return sr<{ id: number; account_id: M2O; balance: number; reconciled: boolean; move_id: M2O }>(
    "account.move.line",
    [["move_id", "in", moveIds], ["account_id.account_type", "in", ["asset_receivable", "liability_payable"]]],
    ["account_id", "balance", "reconciled", "move_id"],
  );
}

const moveDePago = async (paymentId: number) => {
  const [p] = await sr<{ move_id: M2O; state: string; outstanding_account_id: M2O }>("account.payment", [["id", "=", paymentId]], ["move_id", "state", "outstanding_account_id"]);
  if (!p) throw new OdooTesoreriaError("El pago no existe en Odoo.", false, `payment ${paymentId}`);
  return { moveId: id(p.move_id), state: p.state, outstandingId: id(p.outstanding_account_id) };
};

export async function ejecutarPaso(p: PasoDef, ctx: CtxPaso): Promise<ResultadoPaso> {
  switch (p.tipo) {
    case "linea": {
      const stmt = await crearLinea(ctx, p);
      const [l] = await sr<{ is_reconciled: boolean }>("account.bank.statement.line", [["id", "=", stmt]], ["is_reconciled"]);
      if (!l?.is_reconciled) throw new OdooTesoreriaError("La línea de extracto quedó sin conciliar en Odoo.", false, `statement line ${stmt} sin conciliar`);
      return { odooModelo: "account.bank.statement.line", odooId: stmt };
    }

    case "pago": {
      let pid = await buscarPorRef("account.payment", "payment_reference", ctx.ref);
      if (!pid) {
        const m = await metodoLinea(p.diarioId, p.metodo, p.paymentType);
        const vals: Record<string, unknown> = {
          payment_type: p.paymentType,
          partner_type: p.partnerType,
          partner_id: p.partnerId,
          journal_id: p.diarioId,
          payment_method_line_id: m.id,
          amount: p.importe,
          date: ctx.fecha,
          memo: p.memo ?? p.etiqueta,
          payment_reference: ctx.ref,
        };
        if (p.chequesNuevos?.length)
          vals.l10n_latam_new_check_ids = p.chequesNuevos.map((c) => [0, 0, {
            name: c.numero,
            ...(c.bancoId ? { bank_id: c.bancoId } : {}),
            ...(c.cuit ? { issuer_vat: c.cuit.replace(/\D/g, "") } : {}),
            payment_date: c.fechaPago,
            amount: c.importe,
          }]);
        if (p.chequesCartera?.length) vals.l10n_latam_move_check_ids = [[6, 0, p.chequesCartera]];
        const res = await ot<number[] | number>("account.payment", "create", { vals_list: [vals] });
        pid = Array.isArray(res) ? res[0] : res;
      }
      const { state } = await moveDePago(pid);
      if (state === "draft") await ot("account.payment", "action_post", { ids: [pid] });
      const { state: s2 } = await moveDePago(pid);
      if (s2 === "draft" || s2 === "canceled") throw new OdooTesoreriaError("El pago no quedó confirmado en Odoo.", false, `payment ${pid} en ${s2}`);
      return { odooModelo: "account.payment", odooId: pid };
    }

    case "conciliar_pago": {
      // Débito de cheque propio: se concilia con la línea pendiente de ese cheque (con varios cheques, Odoo separa una por cheque)
      if (p.chequeId) {
        const [c] = await sr<{ name: string; outstanding_line_id: M2O }>("l10n_latam.check", [["id", "=", p.chequeId]], ["name", "outstanding_line_id"]);
        if (!c?.outstanding_line_id) throw new OdooTesoreriaError("El cheque propio no tiene línea pendiente en Odoo.", false, `check ${p.chequeId}`);
        const [pend] = await sr<{ id: number; account_id: M2O }>("account.move.line", [["id", "=", id(c.outstanding_line_id)]], ["account_id"]);
        const stmt = await crearLinea(ctx, { diarioId: p.diarioId, importe: p.importe, etiqueta: p.etiqueta, partnerId: p.partnerId, cuentaId: id(pend.account_id) });
        const stmtMove = await moveDeLinea(stmt);
        const ls = await sr<{ id: number; reconciled: boolean }>(
          "account.move.line",
          ["|", ["id", "=", pend.id], "&", ["move_id", "=", stmtMove], ["account_id", "=", id(pend.account_id)]],
          ["reconciled"],
        );
        if (ls.some((l) => !l.reconciled)) await reconciliar(ls.map((l) => l.id));
        const [l] = await sr<{ is_reconciled: boolean }>("account.bank.statement.line", [["id", "=", stmt]], ["is_reconciled"]);
        if (!l?.is_reconciled) throw new OdooTesoreriaError(`La línea de extracto quedó sin conciliar con el cheque ${c.name}.`, false, `statement line ${stmt} / check ${p.chequeId}`);
        return { odooModelo: "account.bank.statement.line", odooId: stmt };
      }
      const pid = resultado(ctx, p.pasoPago!);
      const pago = await moveDePago(pid);
      const stmt = await crearLinea(ctx, { diarioId: p.diarioId, importe: p.importe, etiqueta: p.etiqueta, partnerId: p.partnerId, cuentaId: pago.outstandingId });
      const stmtMove = await moveDeLinea(stmt);
      const ls = await sr<{ id: number; reconciled: boolean; move_id: M2O }>(
        "account.move.line",
        [["move_id", "in", [pago.moveId, stmtMove]], ["account_id", "=", pago.outstandingId]],
        ["reconciled", "move_id"],
      );
      const abiertas = ls.filter((l) => !l.reconciled).map((l) => l.id);
      if (abiertas.length) await reconciliar(ls.map((l) => l.id));
      const [l] = await sr<{ is_reconciled: boolean }>("account.bank.statement.line", [["id", "=", stmt]], ["is_reconciled"]);
      if (!l?.is_reconciled) throw new OdooTesoreriaError("La línea de extracto quedó sin conciliar con el pago.", false, `statement line ${stmt} / payment ${pid}`);
      return { odooModelo: "account.bank.statement.line", odooId: stmt };
    }

    case "factura": {
      let mid = await buscarPorRef("account.move", "payment_reference", ctx.ref);
      if (!mid) {
        const lineas = await Promise.all(
          p.lineas.map(async (l) => {
            const tax = await impuestoCompra(l.iva, p.letra);
            return [0, 0, { account_id: l.cuentaId, name: l.descripcion, quantity: 1, price_unit: l.neto, tax_ids: tax ? [[6, 0, [tax]]] : [] }];
          }),
        );
        const res = await ot<number[] | number>("account.move", "create", {
          vals_list: [{
            move_type: "in_invoice",
            partner_id: p.partnerId,
            journal_id: p.diarioId,
            invoice_date: p.fecha,
            date: ctx.fecha,
            ...(p.tipoDocId
              ? { l10n_latam_document_type_id: p.tipoDocId, l10n_latam_document_number: normalizarNumero(p.numero) }
              : { ref: p.numero.trim() }),
            payment_reference: ctx.ref,
            narration: ctx.nota,
            invoice_line_ids: lineas,
          }],
        });
        mid = Array.isArray(res) ? res[0] : res;
      }
      const [m] = await sr<{ state: string }>("account.move", [["id", "=", mid]], ["state"]);
      if (m?.state === "draft") await ot("account.move", "action_post", { ids: [mid] });
      return { odooModelo: "account.move", odooId: mid };
    }

    case "asiento": {
      let mid = await buscarPorRef("account.move", "ref", ctx.ref);
      if (!mid) {
        const [pt] = await sr<{ property_account_payable_id: M2O }>("res.partner", [["id", "=", p.partnerId]], ["property_account_payable_id"]);
        const cuentaContacto = pt ? id(pt.property_account_payable_id) : 0;
        if (!cuentaContacto) throw new OdooTesoreriaError("El contacto no tiene cuenta de proveedores en Odoo.", false, `partner ${p.partnerId}`);
        const res = await ot<number[] | number>("account.move", "create", {
          vals_list: [{
            move_type: "entry",
            journal_id: p.diarioId,
            date: ctx.fecha,
            ref: ctx.ref,
            narration: ctx.nota,
            line_ids: [
              ...p.lineas.map((l) => [0, 0, { account_id: l.cuentaId, partner_id: p.partnerId, name: l.etiqueta, debit: l.importe, credit: 0 }]),
              [0, 0, { account_id: cuentaContacto, partner_id: p.partnerId, name: p.lineas[0].etiqueta, debit: 0, credit: round2(sum(p.lineas.map((l) => l.importe))) }],
            ],
          }],
        });
        mid = Array.isArray(res) ? res[0] : res;
      }
      const [m] = await sr<{ state: string }>("account.move", [["id", "=", mid]], ["state"]);
      if (m?.state === "draft") await ot("account.move", "action_post", { ids: [mid] });
      return { odooModelo: "account.move", odooId: mid };
    }

    case "conciliar_factura": {
      const facturas = [
        ...(p.pasoFactura !== undefined ? [resultado(ctx, p.pasoFactura)] : p.facturas ?? []),
        ...(p.asientos ?? []).map((o) => resultado(ctx, o)),
      ];
      const pagos = await Promise.all(p.pasosPago.map((o) => moveDePago(resultado(ctx, o))));
      // Odoo concilia por vencimiento: la factura más vieja se cancela primero; el sobrante queda a cuenta
      const ls = (await lineasContacto([...facturas, ...pagos.map((x) => x.moveId)])).filter((l) => !l.reconciled);
      await reconciliar(ls.map((l) => l.id));
      return { odooModelo: null, odooId: null };
    }

    case "ajuste": {
      const pagos = await Promise.all(p.pasosPago.map((o) => moveDePago(resultado(ctx, o))));
      let mid = await buscarPorRef("account.move", "ref", ctx.ref);
      const ls = await lineasContacto([...pagos.map((x) => x.moveId), ...(mid ? [mid] : [])]);
      if (!mid) {
        const neto = round2(sum(ls.map((l) => l.balance)));
        if (neto !== 0) {
          if (!p.diarioId || !p.gananciaId || !p.perdidaId) throw new OdooTesoreriaError("Faltan configurar las cuentas del cambio de cheques.", false, "config ajuste");
          const cuentaContacto = id(ls[0].account_id);
          // Saldo deudor del contacto (neto > 0) → se lo acredita contra pérdida; acreedor → contra ganancia
          const resultadoId = neto > 0 ? p.perdidaId : p.gananciaId;
          const res = await ot<number[] | number>("account.move", "create", {
            vals_list: [{
              move_type: "entry",
              journal_id: p.diarioId,
              date: ctx.fecha,
              ref: ctx.ref,
              narration: ctx.nota,
              line_ids: [
                [0, 0, { account_id: cuentaContacto, partner_id: p.partnerId, name: p.etiqueta, debit: neto < 0 ? -neto : 0, credit: neto > 0 ? neto : 0 }],
                [0, 0, { account_id: resultadoId, name: p.etiqueta, debit: neto > 0 ? neto : 0, credit: neto < 0 ? -neto : 0 }],
              ],
            }],
          });
          mid = Array.isArray(res) ? res[0] : res;
        }
      }
      if (mid) {
        const [m] = await sr<{ state: string }>("account.move", [["id", "=", mid]], ["state"]);
        if (m?.state === "draft") await ot("account.move", "action_post", { ids: [mid] });
      }
      const todas = (await lineasContacto([...pagos.map((x) => x.moveId), ...(mid ? [mid] : [])])).filter((l) => !l.reconciled);
      await reconciliar(todas.map((l) => l.id));
      return { odooModelo: mid ? "account.move" : null, odooId: mid };
    }

    case "adjunto": {
      const a = await prisma.tesoreriaAdjunto.findUnique({ where: { id: p.adjuntoId } });
      if (!a) return { odooModelo: null, odooId: null }; // ya subido en un intento anterior
      for (const [i, o] of p.pasos.entries()) {
        const r = ctx.resultados.get(o);
        const reg = await registroAdjuntable(r?.odooModelo ?? null, r?.odooId ?? null);
        if (!reg) throw new OdooTesoreriaError("Falta el registro de Odoo al que va el adjunto.", false, `adjunto ${a.id} paso ${o}`);
        await subirAdjunto(reg, a, `${ctx.ref}-${i}`);
      }
      await prisma.tesoreriaAdjunto.delete({ where: { id: a.id } });
      return { odooModelo: null, odooId: null };
    }

    case "borrar_linea": {
      const existe = await sr<{ id: number }>("account.bank.statement.line", [["id", "=", p.statementLineId]], ["id"]);
      if (existe.length) await ot("account.bank.statement.line", "unlink", { ids: [p.statementLineId] });
      return { odooModelo: null, odooId: null };
    }

    case "cancelar_pago": {
      const { state } = await moveDePago(p.paymentId);
      if (state !== "canceled") {
        if (state !== "draft") await ot("account.payment", "action_draft", { ids: [p.paymentId] });
        await ot("account.payment", "action_cancel", { ids: [p.paymentId] });
      }
      return { odooModelo: null, odooId: null };
    }

    case "cancelar_asiento": {
      const [m] = await sr<{ state: string }>("account.move", [["id", "=", p.moveId]], ["state"]);
      if (m && m.state !== "cancel") {
        if (m.state !== "draft") await ot("account.move", "button_draft", { ids: [p.moveId] });
        await ot("account.move", "button_cancel", { ids: [p.moveId] });
      }
      return { odooModelo: null, odooId: null };
    }
  }
}

/** Pasos de anulación: los registros creados, en orden inverso. */
export function pasosAnulacion(ok: { def: PasoDef; odooModelo: string | null; odooId: number | null }[]): PasoDef[] {
  const out: PasoDef[] = [];
  for (const { odooModelo, odooId } of [...ok].reverse()) {
    if (!odooId) continue;
    if (odooModelo === "account.bank.statement.line") out.push({ tipo: "borrar_linea", statementLineId: odooId });
    if (odooModelo === "account.payment") out.push({ tipo: "cancelar_pago", paymentId: odooId });
    if (odooModelo === "account.move") out.push({ tipo: "cancelar_asiento", moveId: odooId });
  }
  return out;
}

/** Motivo por el que no se puede anular (cheques ya usados o débitos registrados), o null. */
export async function bloqueoAnulacion(ok: { def: PasoDef; odooModelo: string | null; odooId: number | null }[]): Promise<string | null> {
  const pagos = ok.filter((x) => x.def.tipo === "pago" && x.odooId) as { def: Extract<PasoDef, { tipo: "pago" }>; odooId: number }[];
  for (const { def, odooId } of pagos) {
    if (def.metodo === "new_third_party_checks") {
      const cs = await sr<{ name: string; current_journal_id: M2O }>("l10n_latam.check", [["payment_id", "=", odooId]], ["name", "current_journal_id"]);
      const usado = cs.find((c) => id(c.current_journal_id) !== def.diarioId);
      if (usado) return `El cheque ${usado.name} ya salió de cartera (está en ${usado.current_journal_id ? usado.current_journal_id[1] : "otro diario"}). Anulá primero esa operación.`;
    }
    if (def.metodo === "own_checks") {
      // Por cheque: el pago puede figurar pagado (separado en un cheque por línea) sin ningún débito
      const [deb] = await sr<{ name: string }>("l10n_latam.check", [["payment_id", "=", odooId], ["issue_state", "=", "debited"]], ["name"], { limit: 1 });
      if (deb) return `El cheque propio ${deb.name} ya tiene registrado el débito. Anulá primero el Pago de cheques propios.`;
    }
  }
  return null;
}
