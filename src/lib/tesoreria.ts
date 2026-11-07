// Tesorería — tipos y reglas compartidas entre cliente y servidor (sin dependencias de servidor).

export const TIPOS = [
  "PAGO",
  "COBRO",
  "GASTO",
  "INGRESO",
  "MOVIMIENTO",
  "SOCIOS",
  "PAGO_CHEQUES_PROPIOS",
  "CAMBIO_RECIBO",
  "CAMBIO_ENTREGO",
] as const;
export type Tipo = (typeof TIPOS)[number];

export const TIPO_LABEL: Record<Tipo, string> = {
  PAGO: "Pago a proveedor",
  COBRO: "Cobro de cliente",
  GASTO: "Gasto",
  INGRESO: "Ingreso",
  MOVIMIENTO: "Movimiento entre diarios",
  SOCIOS: "Retiro / Depósito de socios",
  PAGO_CHEQUES_PROPIOS: "Pago de cheques propios",
  CAMBIO_RECIBO: "Cambio de cheque (recibo cheque)",
  CAMBIO_ENTREGO: "Cambio de cheque (entrego cheque)",
};

export type Estado =
  | "BORRADOR"
  | "PROCESANDO"
  | "COMPLETADA"
  | "PENDIENTE_DEBITO"
  | "REQUIERE_ATENCION"
  | "ANULANDO"
  | "ANULADA";

export const ESTADO_LABEL: Record<Estado | "EXTERNO", string> = {
  BORRADOR: "Borrador",
  PROCESANDO: "Procesando",
  COMPLETADA: "Confirmada",
  PENDIENTE_DEBITO: "Pendiente de débito",
  REQUIERE_ATENCION: "Requiere atención",
  ANULANDO: "Anulando",
  ANULADA: "Anulada",
  EXTERNO: "Cargado en Odoo",
};

export const CUIT_CASA_SONIA = "30717060284";

// ─── Detalle por tipo (columna `datos`) ──────────────────────────────────────

export type ChequeNuevo = {
  tipo: "FISICO" | "ECHEQ";
  numero: string;
  bancoId: number | null;
  bancoNombre: string;
  cuit: string;
  librador: string;
  fechaPago: string; // YYYY-MM-DD
  importe: number;
};

export type ChequeCartera = {
  id: number; // l10n_latam.check
  numero: string;
  bancoNombre: string;
  librador: string;
  fechaPago: string;
  importe: number;
};

export type ChequePropio = {
  tipo: "FISICO" | "ECHEQ";
  numero: string;
  fechaPago: string;
  importe: number;
};

export type ChequeEmitido = ChequeCartera & { paymentId: number; contacto: string };

export type Medio =
  | { tipo: "IMPORTE"; diarioId: number; importe: number }
  | { tipo: "CARTERA"; diarioId: number; cheques: ChequeCartera[] }
  | { tipo: "NUEVOS"; diarioId: number; cheques: ChequeNuevo[] }
  | { tipo: "PROPIO"; diarioId: number; cheques: ChequePropio[] };

export type Iva = "21" | "10.5" | "27" | "exento";

export type LineaCuenta = {
  cuentaId: number | null;
  cuentaNombre: string;
  importe: number;
  descripcion?: string;
  iva?: Iva; // solo con factura A
};

export type Factura = {
  letra: "A" | "B" | "C";
  numero: string; // PPPPP-NNNNNNNN
  fecha: string;
  tipoDocId?: number; // A: tipo de comprobante de Odoo (l10n_latam.document.type); sin definir = Factura A
  tipoDocPrefijo?: string; // A: doc_code_prefix (ej. "FA-A")
  lineas?: LineaFactura[]; // sin definir (borradores viejos): las del gasto
};

/** Tipo de comprobante de compra de Odoo (letra A) para la factura del Gasto. */
export type TipoComprobante = { id: number; nombre: string; prefijo: string };

/** Línea de la factura de compra. `origen` = `${diarioId}-${i}` de la línea del gasto de la que se precargó. */
export type LineaFactura = { cuentaId: number | null; cuentaNombre: string; neto: number; iva?: Iva; origen?: string };

/** Factura (o nota de crédito) con saldo del contacto, a imputar en un Pago o Cobro. */
export type FacturaPendiente = {
  id: number; // account.move
  numero: string;
  fecha: string;
  vencimiento: string;
  total: number;
  saldo: number; // negativo en notas de crédito
};

export type Datos = {
  medios?: Medio[]; // PAGO, COBRO
  imputaciones?: FacturaPendiente[]; // PAGO, COBRO: Odoo aplica de la más vieja a la más nueva
  diarios?: { diarioId: number; lineas: LineaCuenta[]; cheques?: ChequePropio[] }[]; // GASTO, INGRESO; cheques: Gasto pagado con cheque propio del banco
  factura?: Factura | null; // GASTO
  origenId?: number; // MOVIMIENTO
  destinoId?: number;
  importe?: number; // MOVIMIENTO, SOCIOS
  sentido?: "RETIRO" | "DEPOSITO"; // SOCIOS
  diarioId?: number; // SOCIOS, PAGO_CHEQUES_PROPIOS
  cuentaId?: number | null; // SOCIOS
  cuentaNombre?: string;
  chequesEmitidos?: ChequeEmitido[]; // PAGO_CHEQUES_PROPIOS
  chequesNuevos?: ChequeNuevo[]; // CAMBIO_RECIBO
  chequesCartera?: ChequeCartera[]; // CAMBIO_ENTREGO
  chequesDiarioId?: number; // CAMBIOS: diario Cheques de Terceros
  diarioEfectivoId?: number; // CAMBIOS
  efectivo?: number;
};

export type DiarioCfg = { odooJournalId: number; nombre: string; tipo: "EFECTIVO" | "BANCO" | "CHEQUES" };

// ─── Números ────────────────────────────────────────────────────────────────

export const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
export const round2 = (n: number) => Math.round(n * 100) / 100;

const FMT = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt = (n: number) => FMT.format(n);

/** Importe tipeado en formato es-AR ("1.234,5") → número, o null si es inválido. */
export function parseImporte(s: string): number | null {
  const t = s.trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!t) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return n > 0 ? n : null;
}

export const importeValido = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 && round2(n) === n;

/** Totales de un listado de cheques: vencidos = fecha de pago ≤ hoy. */
export function totalesCheques(cs: { fechaPago: string; importe: number }[], hoy: string) {
  return {
    total: sum(cs.map((c) => c.importe)),
    cantidad: cs.length,
    vencidos: sum(cs.filter((c) => c.fechaPago <= hoy).map((c) => c.importe)),
    porVencer: sum(cs.filter((c) => c.fechaPago > hoy).map((c) => c.importe)),
  };
}

// ─── CUIT ───────────────────────────────────────────────────────────────────

export function cuitValido(cuit: string): boolean {
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
  let dv = 11 - (s % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return false;
  return dv === Number(d[10]);
}

export const formatCuit = (cuit: string) => {
  const d = cuit.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit;
};

// ─── Fechas (hora de Argentina) ─────────────────────────────────────────────

export function hoyAR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export type Periodo = "dia" | "mes" | "anio";

export function rango(periodo: Periodo, fecha: string): { desde: string; hasta: string } {
  const [y, m] = fecha.split("-").map(Number);
  if (periodo === "dia") return { desde: fecha, hasta: fecha };
  if (periodo === "mes") {
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { desde: `${y}-${String(m).padStart(2, "0")}-01`, hasta: `${y}-${String(m).padStart(2, "0")}-${ultimo}` };
  }
  return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
}

// ─── Efecto por diario ──────────────────────────────────────────────────────

/** Importe con signo por diario (mov) y cheques propios a debitar (pend). */
export type Efecto = { mov: Record<number, number>; pend: Record<number, number> };

const totalCheques = (cs: { importe: number }[] = []) => sum(cs.map((c) => c.importe || 0));

export const IVA_TASA: Record<Iva, number> = { "21": 0.21, "10.5": 0.105, "27": 0.27, exento: 0 };

/** Lo que sale del diario por una línea: con factura A la línea es neto gravado y se suma el IVA. */
export function brutoLinea(l: LineaCuenta, factura?: Factura | null): number {
  const neto = l.importe || 0;
  if (factura?.letra !== "A" || !l.iva) return neto;
  return round2(neto + round2(neto * IVA_TASA[l.iva]));
}

/** Líneas de la factura del gasto: las cargadas en el diálogo o, si no hay, las del gasto. */
export function lineasFactura(d: Datos): LineaFactura[] {
  if (d.factura?.lineas) return d.factura.lineas;
  return (d.diarios ?? []).flatMap((x) => x.lineas.map((l, i) => ({ cuentaId: l.cuentaId, cuentaNombre: l.cuentaNombre, neto: l.importe, iva: l.iva, origen: `${x.diarioId}-${i}` })));
}

export const totalFactura = (f: Factura, ls: LineaFactura[]) => sum(ls.map((l) => brutoLinea({ cuentaId: l.cuentaId, cuentaNombre: "", importe: l.neto, iva: l.iva }, f)));

export type Reparto = {
  pagos: { diarioId: number; importe: number }[]; // lo que paga la factura, por diario
  excedentes: { diarioId: number; cuentaId: number | null; cuentaNombre: string; descripcion?: string; importe: number }[]; // gasto sin factura
  saldo: number; // lo que la factura queda debiendo
  total: number; // total de la factura
  pagado: number;
};

/** Las líneas del gasto cubren el total de la factura en orden de columna; lo que sobra de cada línea va a su cuenta. */
export function repartoFactura(f: Factura, ls: LineaFactura[], diarios: { diarioId: number; lineas: LineaCuenta[] }[]): Reparto {
  const total = totalFactura(f, ls);
  let resta = total;
  const pagos: Reparto["pagos"] = [];
  const excedentes: Reparto["excedentes"] = [];
  for (const x of diarios) {
    let pago = 0;
    for (const l of x.lineas) {
      const b = brutoLinea(l, f);
      const cubre = round2(Math.min(b, resta));
      resta = round2(resta - cubre);
      pago = round2(pago + cubre);
      if (b > cubre) excedentes.push({ diarioId: x.diarioId, cuentaId: l.cuentaId, cuentaNombre: l.cuentaNombre, descripcion: l.descripcion, importe: round2(b - cubre) });
    }
    if (pago > 0) pagos.push({ diarioId: x.diarioId, importe: pago });
  }
  return { pagos, excedentes, saldo: resta, total, pagado: sum(diarios.flatMap((x) => x.lineas.map((l) => brutoLinea(l, f)))) };
}

export function totalMedio(m: Medio): number {
  return m.tipo === "IMPORTE" ? m.importe || 0 : totalCheques(m.cheques);
}

export function efecto(tipo: Tipo, d: Datos): Efecto {
  const mov: Record<number, number> = {};
  const pend: Record<number, number> = {};
  const add = (k: Record<number, number>, diario: number | undefined, v: number) => {
    if (!diario || !v) return;
    k[diario] = round2((k[diario] ?? 0) + v);
  };

  switch (tipo) {
    case "PAGO":
    case "COBRO": {
      const s = tipo === "PAGO" ? -1 : 1;
      for (const m of d.medios ?? []) {
        if (m.tipo === "PROPIO") add(pend, m.diarioId, -totalMedio(m));
        else add(mov, m.diarioId, s * totalMedio(m));
      }
      break;
    }
    case "GASTO":
    case "INGRESO": {
      const s = tipo === "GASTO" ? -1 : 1;
      for (const x of d.diarios ?? []) {
        // Lo pagado con cheque propio queda pendiente de débito; el resto sale del diario en el momento
        const chq = totalCheques(x.cheques);
        add(mov, x.diarioId, round2(s * sum(x.lineas.map((l) => brutoLinea(l, d.factura))) + chq));
        add(pend, x.diarioId, -chq);
      }
      break;
    }
    case "MOVIMIENTO":
      add(mov, d.origenId, -(d.importe ?? 0));
      add(mov, d.destinoId, d.importe ?? 0);
      break;
    case "SOCIOS":
      add(mov, d.diarioId, (d.sentido === "RETIRO" ? -1 : 1) * (d.importe ?? 0));
      break;
    case "PAGO_CHEQUES_PROPIOS":
      add(mov, d.diarioId, -totalCheques(d.chequesEmitidos));
      break;
    case "CAMBIO_RECIBO":
    case "CAMBIO_ENTREGO": {
      const s = tipo === "CAMBIO_RECIBO" ? 1 : -1;
      const chq = tipo === "CAMBIO_RECIBO" ? totalCheques(d.chequesNuevos) : totalCheques(d.chequesCartera);
      add(mov, d.chequesDiarioId, s * chq);
      add(mov, d.diarioEfectivoId, -s * (d.efectivo ?? 0));
      break;
    }
  }
  return { mov, pend };
}

/** Importe que identifica la operación (para duplicados y la columna total). */
export function totalOperacion(tipo: Tipo, d: Datos): number {
  switch (tipo) {
    case "PAGO":
    case "COBRO":
      return sum((d.medios ?? []).map(totalMedio));
    case "GASTO":
    case "INGRESO":
      return sum((d.diarios ?? []).flatMap((x) => x.lineas.map((l) => brutoLinea(l, d.factura))));
    case "MOVIMIENTO":
    case "SOCIOS":
      return d.importe ?? 0;
    case "PAGO_CHEQUES_PROPIOS":
      return totalCheques(d.chequesEmitidos);
    case "CAMBIO_RECIBO":
      return totalCheques(d.chequesNuevos);
    case "CAMBIO_ENTREGO":
      return totalCheques(d.chequesCartera);
  }
}

/** Números de los cheques de la operación, ordenados: dos operaciones con cheques distintos no son duplicado. */
export function chequesDe(d: Datos): string {
  const cs: { numero: string }[] = [...(d.medios ?? []).flatMap((m): { numero: string }[] => (m.tipo === "IMPORTE" ? [] : m.cheques)), ...(d.diarios ?? []).flatMap((x) => x.cheques ?? []), ...(d.chequesEmitidos ?? []), ...(d.chequesNuevos ?? []), ...(d.chequesCartera ?? [])];
  return cs.map((c) => c.numero.trim()).sort().join(",");
}

/** Ganancia (+) o pérdida (−) del cambio de cheques, solo lectura (R53). */
export function diferenciaCambio(tipo: Tipo, d: Datos): number {
  const chq = tipo === "CAMBIO_RECIBO" ? totalCheques(d.chequesNuevos) : totalCheques(d.chequesCartera);
  const dif = round2(chq - (d.efectivo ?? 0));
  return tipo === "CAMBIO_RECIBO" ? dif : -dif;
}

// ─── Etiqueta ───────────────────────────────────────────────────────────────

/** Prefijo del memo de un pago conciliado con facturas: hasta 3 números y "+N". */
export function prefijoFacturas(numeros: string[]): string {
  const extra = numeros.length - 3;
  return numeros.slice(0, 3).join("/") + (extra > 0 ? ` +${extra}` : "");
}

export function etiqueta(
  tipo: Tipo,
  d: Datos,
  o: { observacion?: string | null; contacto?: string | null; diarioNombre: (id?: number) => string },
): string {
  const obs = o.observacion?.trim();
  if (obs) return obs;
  switch (tipo) {
    case "PAGO":
      return `Pago ${o.contacto ?? ""}`.trim();
    case "COBRO":
      return `Cobro ${o.contacto ?? ""}`.trim();
    case "MOVIMIENTO":
      return `Mov. ${o.diarioNombre(d.origenId)} → ${o.diarioNombre(d.destinoId)}`;
    case "SOCIOS":
      return `${d.sentido === "RETIRO" ? "Retiro" : "Depósito"} ${(d.cuentaNombre ?? "").replace(/^Retiro\s+/i, "")}`.trim();
    case "PAGO_CHEQUES_PROPIOS":
      return `Débito cheque ${(d.chequesEmitidos ?? []).map((c) => c.numero).join(", ")}`;
    default:
      return TIPO_LABEL[tipo];
  }
}

// ─── Validación (cliente y servidor) ────────────────────────────────────────

export type ValidacionCtx = {
  hoy: string;
  diarios: DiarioCfg[];
  cuentasGasto: number[];
  cuentasIngreso: number[];
  cuentasSocio: number[];
};

const OBS_OBLIGATORIA: Tipo[] = ["GASTO", "INGRESO", "CAMBIO_RECIBO", "CAMBIO_ENTREGO"];
const CONTACTO_OBLIGATORIO: Tipo[] = ["PAGO", "COBRO", "CAMBIO_RECIBO", "CAMBIO_ENTREGO"];

/** Devuelve el primer error que impide confirmar, o null. */
export function validar(
  op: { tipo: Tipo; fechaContable: string; contactoId: number | null; observacion: string | null; datos: Datos },
  ctx: ValidacionCtx,
): string | null {
  const { tipo, datos: d } = op;
  const diario = (id?: number) => ctx.diarios.find((x) => x.odooJournalId === id);
  const esCheques = (id?: number) => diario(id)?.tipo === "CHEQUES";

  if (!op.fechaContable) return "Falta la fecha contable.";
  if (op.fechaContable > ctx.hoy) return "No se admiten fechas futuras.";
  if (OBS_OBLIGATORIA.includes(tipo) && !op.observacion?.trim())
    return "La observación es obligatoria en Gasto, Ingreso y Cambio de cheques.";
  const conFactura = tipo === "GASTO" && !!d.factura;
  const conCheque = (d.diarios ?? []).some((x) => x.cheques?.length);
  if ((CONTACTO_OBLIGATORIO.includes(tipo) || conFactura || conCheque) && !op.contactoId) return "Falta el contacto.";
  if (d.imputaciones?.length && tipo !== "PAGO" && tipo !== "COBRO") return "Solo el Pago y el Cobro se imputan a facturas.";
  // Solo notas de crédito (o que superan a las facturas) dejan todo de un lado y Odoo no puede conciliar
  if (d.imputaciones?.length && sum(d.imputaciones.map((f) => f.saldo)) <= 0) return "Las facturas elegidas tienen que sumar más que las notas de crédito.";

  const chequeNuevoError = (cs: ChequeNuevo[] = []) => {
    const vistos = new Set<string>();
    for (const c of cs) {
      if (c.tipo === "FISICO" && !/^\d{8}$/.test(c.numero)) return `El cheque ${c.numero || "sin número"} debe tener 8 dígitos.`;
      if (c.tipo === "ECHEQ" && !c.numero.trim()) return "Falta el número de un e-cheq.";
      if (!c.bancoId) return `Falta el banco del cheque ${c.numero}.`;
      if (!cuitValido(c.cuit)) return `El CUIT del librador del cheque ${c.numero} no es válido.`;
      if (c.cuit.replace(/\D/g, "") === CUIT_CASA_SONIA) return `El cheque ${c.numero} es de Casa Sonia: no es un cheque de tercero.`;
      if (!c.fechaPago) return `Falta la fecha de pago del cheque ${c.numero}.`;
      if (!importeValido(c.importe)) return `El importe del cheque ${c.numero} no es válido.`;
      const k = `${c.numero}|${c.bancoId}|${c.cuit.replace(/\D/g, "")}`;
      if (vistos.has(k)) return `El cheque ${c.numero} está cargado dos veces.`;
      vistos.add(k);
    }
    return null;
  };

  const chequePropioError = (diarioId: number, cs: ChequePropio[]) => {
    if (diario(diarioId)?.tipo !== "BANCO") return "El cheque propio se emite desde un banco.";
    for (const c of cs) {
      if (c.tipo === "FISICO" && !/^\d{8}$/.test(c.numero)) return `El cheque propio ${c.numero || "sin número"} debe tener 8 dígitos.`;
      if (c.tipo === "ECHEQ" && !c.numero.trim()) return "Falta el número de un e-cheq propio.";
      if (!c.fechaPago || c.fechaPago < op.fechaContable || c.fechaPago > sumarDias(op.fechaContable, 360))
        return `La fecha de pago del cheque ${c.numero} debe estar entre la fecha contable y 360 días después.`;
      if (!importeValido(c.importe)) return `El importe del cheque ${c.numero} no es válido.`;
    }
    return null;
  };

  switch (tipo) {
    case "PAGO":
    case "COBRO": {
      const medios = d.medios ?? [];
      if (!medios.length) return "Cargá al menos un medio.";
      for (const m of medios) {
        if (!diario(m.diarioId)) return "Hay un diario que no está habilitado.";
        if (m.tipo === "IMPORTE") {
          if (esCheques(m.diarioId)) return "En Cheques de Terceros se eligen o cargan cheques, no un importe.";
          if (!importeValido(m.importe)) return "Hay un importe inválido.";
        } else {
          if (!m.cheques.length) return "Hay un medio sin cheques.";
          if (m.tipo === "CARTERA" && tipo !== "PAGO") return "Los cheques de cartera solo se entregan en un Pago.";
          if (m.tipo === "NUEVOS") {
            if (tipo !== "COBRO") return "Los cheques nuevos se reciben en un Cobro.";
            const e = chequeNuevoError(m.cheques);
            if (e) return e;
          }
          if (m.tipo === "PROPIO") {
            if (tipo !== "PAGO") return "El cheque propio solo se usa en un Pago.";
            const e = chequePropioError(m.diarioId, m.cheques);
            if (e) return e;
          }
        }
      }
      return null;
    }
    case "GASTO":
    case "INGRESO": {
      const lista = tipo === "GASTO" ? ctx.cuentasGasto : ctx.cuentasIngreso;
      const ds = d.diarios ?? [];
      if (!ds.some((x) => x.lineas.length) && !(d.factura && lineasFactura(d).length)) return "Cargá al menos un importe en algún diario.";
      for (const x of ds) {
        if (!diario(x.diarioId) || esCheques(x.diarioId)) return "Hay un diario que no se puede usar acá.";
        for (const l of x.lineas) {
          if (!l.cuentaId) return "Falta elegir la cuenta.";
          if (!lista.includes(l.cuentaId)) return `La cuenta ${l.cuentaNombre} no está habilitada para ${tipo === "GASTO" ? "gastos" : "ingresos"}.`;
          if (!importeValido(l.importe)) return "Hay un importe inválido.";
        }
        if (x.cheques?.length) {
          if (tipo !== "GASTO") return "El cheque propio solo se usa en un Pago o un Gasto.";
          const e = chequePropioError(x.diarioId, x.cheques);
          if (e) return e;
          if (totalCheques(x.cheques) > round2(sum(x.lineas.map((l) => brutoLinea(l, d.factura))))) return `Los cheques superan el total de ${diario(x.diarioId)!.nombre}.`;
        }
      }
      if (d.factura) {
        if (tipo !== "GASTO") return "Solo el Gasto lleva factura.";
        if (!/^\d{1,5}-\d{1,8}$/.test(d.factura.numero.trim())) return "El número de factura debe tener el formato 00001-00000001.";
        if (!d.factura.fecha || d.factura.fecha > op.fechaContable) return "La fecha de la factura no puede ser posterior a la fecha contable.";
        const lf = lineasFactura(d);
        if (!lf.length) return "La factura no tiene líneas.";
        for (const l of lf) {
          if (!l.cuentaId || !ctx.cuentasGasto.includes(l.cuentaId)) return "Hay una línea de la factura sin cuenta de gasto.";
          if (!importeValido(l.neto)) return "Hay un importe inválido en la factura.";
          if (d.factura.letra === "A" && !l.iva) return "Falta la alícuota de IVA en alguna línea de la factura.";
        }
      }
      return null;
    }
    case "MOVIMIENTO":
      if (!diario(d.origenId) || !diario(d.destinoId)) return "Elegí el diario de origen y el de destino.";
      if (esCheques(d.origenId) || esCheques(d.destinoId)) return "Cheques de Terceros no se usa en un movimiento entre diarios.";
      if (d.origenId === d.destinoId) return "El diario de origen y el de destino tienen que ser distintos.";
      if (!importeValido(d.importe)) return "El importe no es válido.";
      return null;
    case "SOCIOS":
      if (!d.sentido) return "Elegí Retiro o Depósito.";
      if (!diario(d.diarioId) || esCheques(d.diarioId)) return "Elegí el diario.";
      if (!d.cuentaId || !ctx.cuentasSocio.includes(d.cuentaId)) return "Elegí la cuenta del socio.";
      if (!importeValido(d.importe)) return "El importe no es válido.";
      return null;
    case "PAGO_CHEQUES_PROPIOS":
      if (diario(d.diarioId)?.tipo !== "BANCO") return "Elegí el banco.";
      if (!d.chequesEmitidos?.length) return "Elegí al menos un cheque.";
      return null;
    case "CAMBIO_RECIBO":
    case "CAMBIO_ENTREGO": {
      if (!esCheques(d.chequesDiarioId)) return "Falta habilitar el diario Cheques de Terceros.";
      const cs = tipo === "CAMBIO_RECIBO" ? d.chequesNuevos : d.chequesCartera;
      if (!cs?.length) return "Cargá al menos un cheque.";
      if (tipo === "CAMBIO_RECIBO") {
        const e = chequeNuevoError(d.chequesNuevos);
        if (e) return e;
      }
      const ef = diario(d.diarioEfectivoId);
      if (!ef || ef.tipo === "CHEQUES") return "Elegí el diario del efectivo.";
      if (!importeValido(d.efectivo)) return "El importe en efectivo no es válido.";
      return null;
    }
  }
}

// ─── Carga: columnas que aplican y resumen en castellano ────────────────────

/** Diarios que se muestran al cargar cada tipo de operación (el resto no aplica). */
export function columnasPara(tipo: Tipo, d: Datos, diarios: DiarioCfg[]): DiarioCfg[] {
  switch (tipo) {
    case "GASTO":
    case "INGRESO":
    case "SOCIOS":
      return diarios.filter((x) => x.tipo !== "CHEQUES");
    case "MOVIMIENTO":
      return diarios.filter((x) => x.odooJournalId === d.origenId || x.odooJournalId === d.destinoId);
    case "PAGO_CHEQUES_PROPIOS":
      return diarios.filter((x) => x.odooJournalId === d.diarioId);
    default:
      return diarios;
  }
}

/** Trozo del resumen; `tono` marca lo que sale (rojo) o entra (verde). */
export type Trozo = { t: string; tono?: "sale" | "entra" };

/** Frase que describe la operación cargada: "Sale $ 50.000,00 de Efectivo Administracion". */
export function resumen(tipo: Tipo, d: Datos, contacto: string | null, nombreDiario: (id?: number) => string): Trozo[] {
  const { mov, pend } = efecto(tipo, d);
  const lista = (xs: Trozo[][]): Trozo[] => xs.flatMap((x, i) => (i ? [{ t: i === xs.length - 1 ? " y " : ", " }, ...x] : x));
  const item = (v: number, prep: string, k: string, tono?: Trozo["tono"]): Trozo[] => [{ t: `$ ${fmt(v)}`, tono }, { t: ` ${prep} ${nombreDiario(Number(k))}` }];
  const sale = Object.entries(mov).filter(([, v]) => v < 0).map(([k, v]) => item(-v, "de", k, "sale"));
  const entra = Object.entries(mov).filter(([, v]) => v > 0).map(([k, v]) => item(v, "en", k, "entra"));
  const aDebitar = Object.entries(pend).map(([k, v]) => item(-v, "en cheque propio de", k, "sale"));
  const prefijo =
    contacto && (tipo === "PAGO" || tipo === "CAMBIO_ENTREGO") ? `A ${contacto}: `
    : contacto && (tipo === "COBRO" || tipo === "CAMBIO_RECIBO") ? `De ${contacto}: `
    : "";
  const partes: Trozo[][] = [];
  const verbo = (v: string) => (partes.length || prefijo ? v : v.charAt(0).toUpperCase() + v.slice(1));
  if (sale.length) partes.push([{ t: verbo("sale"), tono: "sale" }, { t: " " }, ...lista(sale)]);
  if (entra.length) partes.push([{ t: verbo("entra"), tono: "entra" }, { t: " " }, ...lista(entra)]);
  if (aDebitar.length) partes.push([{ t: partes.length ? "y " : "" }, ...lista(aDebitar), { t: " (a debitar)" }]);
  if (!partes.length) return [{ t: "Todavía no cargaste importes." }];
  if (tipo === "CAMBIO_RECIBO" || tipo === "CAMBIO_ENTREGO") {
    const dif = diferenciaCambio(tipo, d);
    if (dif) partes.push([{ t: `${dif > 0 ? "ganancia" : "pérdida"} $ ${fmt(Math.abs(dif))}`, tono: dif > 0 ? "entra" : "sale" }]);
  }
  return [{ t: prefijo }, ...partes.flatMap((p, i) => (i ? [{ t: " · " }, ...p] : p)), { t: "." }];
}
