// Vista General: arma las filas leyendo Odoo (fuente de verdad) y la DB (operaciones de la app).
import { prisma } from "@/lib/prisma";
import { cargarConfig } from "@/lib/tesoreriaConfig";
import { diariosOdoo, metodosPago, OdooTesoreriaError, sr } from "@/lib/odooTesoreria";
import {
  efecto,
  etiqueta,
  rango,
  round2,
  type Datos,
  type DiarioCfg,
  type Estado,
  type Periodo,
  type Tipo,
} from "@/lib/tesoreria";

export { rango, type Periodo };

export type Fila = {
  key: string;
  clase: "APP" | "EXTERNO" | "CUENTA";
  operacionId?: number;
  tipo?: Tipo;
  estado?: Estado | "EXTERNO";
  fecha?: string;
  momento?: number; // cuándo se registró (ms): ordena el día, lo más nuevo arriba
  concepto: string;
  contacto: string;
  cuenta: string;
  mov: Record<number, number>;
  pend: Record<number, number>;
  suma: boolean; // si cuenta en el TOTAL
  faltaEnOdoo?: boolean; // confirmada, pero sus registros ya no aparecen en Odoo (borrados allá)
  hijos?: Fila[];
};

export type Vista = {
  odooDisponible: boolean;
  diarios: DiarioCfg[];
  desde: string;
  hasta: string;
  filas: Fila[];
  total: Record<number, number>;
};

type M2O = [number, string] | false;
const id = (v: M2O) => (v ? v[0] : 0);
const nom = (v: M2O) => (v ? v[1] : "");

/** Referencia de la app: TES-{operación}-{paso} */
export const opDeRef = (ref: string | false | null | undefined) => {
  const m = /^TES-(\d+)-/.exec(ref || "");
  return m ? Number(m[1]) : null;
};

/** create_date de Odoo ("YYYY-MM-DD HH:MM:SS", UTC) a ms. */
const odooMs = (s: string | false) => (s ? Date.parse(`${s.replace(" ", "T")}Z`) : 0);

type Parte = { grupo: string; cuenta: string; diario: number; importe: number; pend: boolean };

export async function armarVista(periodo: Periodo, fecha: string): Promise<Vista> {
  const { desde, hasta } = rango(periodo, fecha);
  const cfg = await cargarConfig();
  const diarioIds = cfg.diarios.map((d) => d.odooJournalId);
  const nombreDiario = (i?: number) => cfg.diarios.find((d) => d.odooJournalId === i)?.nombre ?? "";

  const ops = await prisma.tesoreriaOperacion.findMany({
    where: { fechaContable: { gte: new Date(`${desde}T00:00:00Z`), lte: new Date(`${hasta}T00:00:00Z`) } },
    orderBy: { id: "asc" },
  });

  const filaApp = (o: (typeof ops)[number], mov: Record<number, number>, pend: Record<number, number>, suma: boolean, estado: Estado): Fila => {
    const datos = o.datos as Datos;
    return {
      key: `op-${o.id}`,
      clase: "APP",
      operacionId: o.id,
      tipo: o.tipo,
      estado,
      fecha: o.fechaContable.toISOString().slice(0, 10),
      momento: (o.confirmadoEn ?? o.creadoEn).getTime(),
      concepto: etiqueta(o.tipo, datos, { observacion: o.observacion, contacto: o.contactoNombre, diarioNombre: nombreDiario }),
      contacto: o.contactoNombre ?? "",
      cuenta: detalleCuenta(o.tipo, datos, nombreDiario),
      mov,
      pend,
      suma,
    };
  };

  let partes: Parte[] = [];
  const externos = new Map<string, { concepto: string; contacto: string; fecha: string; momento: number }>();
  let odooDisponible = true;

  try {
    partes = await leerPartes(diarioIds, desde, hasta, externos);
  } catch (e) {
    if (!(e instanceof OdooTesoreriaError && e.ambiguo)) throw e;
    console.error("[tesoreria] vista sin Odoo", e.tecnico);
    odooDisponible = false;
  }

  // Sin Odoo: solo lo que está en la DB (borradores y estado de la app)
  if (!odooDisponible) {
    const filas = ops.map((o) => {
      const ef = efecto(o.tipo, o.datos as Datos);
      return filaApp(o, ef.mov, ef.pend, false, o.estado);
    });
    return { odooDisponible, diarios: cfg.diarios, desde, hasta, filas, total: {} };
  }

  const porGrupo = new Map<string, Parte[]>();
  for (const p of partes) porGrupo.set(p.grupo, [...(porGrupo.get(p.grupo) ?? []), p]);
  const acumular = (ps: Parte[]) => {
    const mov: Record<number, number> = {};
    const pend: Record<number, number> = {};
    for (const p of ps) {
      const k = p.pend ? pend : mov;
      k[p.diario] = round2((k[p.diario] ?? 0) + p.importe);
    }
    return { mov, pend };
  };

  // Filas por operación / asiento externo
  const filasDia: Fila[] = [];
  const opsIds = new Set(ops.map((o) => o.id));
  for (const o of ops) {
    const ps = porGrupo.get(`op-${o.id}`);
    if (ps?.length && o.estado !== "BORRADOR") {
      const { mov, pend } = acumular(ps);
      // El débito de un cheque propio deja de figurar pendiente: la operación queda completada
      const estado = o.estado === "PENDIENTE_DEBITO" && !Object.keys(pend).length ? "COMPLETADA" : o.estado;
      if (estado !== o.estado) await prisma.tesoreriaOperacion.update({ where: { id: o.id }, data: { estado } });
      filasDia.push(filaApp(o, mov, pend, true, estado));
    } else {
      const ef = efecto(o.tipo, o.datos as Datos);
      filasDia.push({ ...filaApp(o, ef.mov, ef.pend, false, o.estado), faltaEnOdoo: o.estado === "COMPLETADA" || o.estado === "PENDIENTE_DEBITO" });
    }
  }
  for (const [grupo, ps] of porGrupo) {
    if (grupo.startsWith("op-") && opsIds.has(Number(grupo.slice(3)))) continue;
    const ex = externos.get(grupo);
    const { mov, pend } = acumular(ps);
    filasDia.push({
      key: grupo,
      clase: "EXTERNO",
      estado: "EXTERNO",
      fecha: ex?.fecha,
      momento: ex?.momento,
      concepto: ex?.concepto || "Movimiento en Odoo",
      contacto: ex?.contacto ?? "",
      cuenta: [...new Set(ps.map((p) => p.cuenta))].join(", "),
      mov,
      pend,
      suma: true,
    });
  }
  // Cronológico, lo más nuevo arriba: fecha contable y, dentro del día, cuándo se registró (app y Odoo mezclados)
  filasDia.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || (b.momento ?? 0) - (a.momento ?? 0));

  const total: Record<number, number> = {};
  for (const f of filasDia) {
    if (!f.suma) continue;
    for (const [d, v] of Object.entries(f.mov)) total[Number(d)] = round2((total[Number(d)] ?? 0) + v);
  }

  if (periodo === "dia") return { odooDisponible, diarios: cfg.diarios, desde, hasta, filas: filasDia, total };

  // Mes / año: una fila por cuenta con desglose por operación
  const porCuenta = new Map<string, Parte[]>();
  for (const p of partes) porCuenta.set(p.cuenta, [...(porCuenta.get(p.cuenta) ?? []), p]);
  const filaDe = new Map(filasDia.map((f) => [f.key, f]));
  const filas: Fila[] = [...porCuenta.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true }))
    .map(([cuenta, ps]) => {
      const grupos = new Map<string, Parte[]>();
      for (const p of ps) grupos.set(p.grupo, [...(grupos.get(p.grupo) ?? []), p]);
      return {
        key: `cuenta-${cuenta}`,
        clase: "CUENTA" as const,
        concepto: cuenta,
        contacto: "",
        cuenta: "",
        ...acumular(ps),
        suma: true,
        hijos: [...grupos.entries()].map(([g, gps]) => ({ ...(filaDe.get(g) as Fila), key: `${cuenta}-${g}`, ...acumular(gps) })),
      };
    });
  // Lo que todavía no está en Odoo (borradores, fallidas) se lista aparte, sin sumar
  const sinOdoo = filasDia.filter((f) => !f.suma);
  if (sinOdoo.length) filas.push({ key: "sin-odoo", clase: "CUENTA", concepto: "Sin registrar en Odoo", contacto: "", cuenta: "", mov: {}, pend: {}, suma: false, hijos: sinOdoo });
  return { odooDisponible, diarios: cfg.diarios, desde, hasta, filas, total };
}

function detalleCuenta(tipo: Tipo, d: Datos, nombreDiario: (id?: number) => string): string {
  switch (tipo) {
    case "GASTO":
    case "INGRESO":
      return [...new Set((d.diarios ?? []).flatMap((x) => x.lineas.map((l) => l.cuentaNombre)).filter(Boolean))].join(", ") + (d.factura ? ` · Fc ${d.factura.letra} ${d.factura.numero}` : "");
    case "SOCIOS":
      return d.cuentaNombre ?? "";
    case "MOVIMIENTO":
      return `${nombreDiario(d.origenId)} → ${nombreDiario(d.destinoId)}`;
    case "PAGO_CHEQUES_PROPIOS":
      return `${d.chequesEmitidos?.length ?? 0} cheque(s)`;
    case "CAMBIO_RECIBO":
    case "CAMBIO_ENTREGO": {
      const n = (tipo === "CAMBIO_RECIBO" ? d.chequesNuevos : d.chequesCartera)?.length ?? 0;
      return `${n} cheque(s)`;
    }
    default: {
      const ms = d.medios ?? [];
      const chq = ms.reduce((a, m) => a + (m.tipo === "IMPORTE" ? 0 : m.cheques.length), 0);
      return chq ? `${chq} cheque(s)` : "";
    }
  }
}

/** Líneas de liquidez y cheques propios pendientes del período, atribuidas a operación (o asiento) y cuenta. */
async function leerPartes(
  diarioIds: number[],
  desde: string,
  hasta: string,
  externos: Map<string, { concepto: string; contacto: string; fecha: string; momento: number }>,
): Promise<Parte[]> {
  if (!diarioIds.length) return [];
  const diarios = (await diariosOdoo()).filter((d) => diarioIds.includes(d.id));
  const liquidez = diarios.map((d) => d.cuentaId).filter((x): x is number => !!x);
  // La columna sale de la cuenta, no del diario del asiento: un cambio cargado en otro diario mueve las dos cajas
  const diarioDeCuenta = new Map(diarios.filter((d) => d.cuentaId).map((d) => [d.cuentaId!, d.id]));

  type Aml = { move_id: M2O; account_id: M2O; balance: number; name: string | false; partner_id: M2O; date: string; ref: string | false; statement_line_id: M2O; create_date: string };
  const lineas = await sr<Aml>(
    "account.move.line",
    [["account_id", "in", liquidez], ["parent_state", "=", "posted"], ["date", ">=", desde], ["date", "<=", hasta]],
    ["move_id", "account_id", "balance", "name", "partner_id", "date", "ref", "statement_line_id", "create_date"],
    { limit: 5000, order: "date asc, id asc" },
  );

  // Contrapartidas (para la cuenta de cada movimiento)
  const moveIds = [...new Set(lineas.map((l) => id(l.move_id)))];
  const contra = moveIds.length
    ? await sr<{ move_id: M2O; account_id: M2O; balance: number; matching_number: string | false }>(
        "account.move.line",
        [["move_id", "in", moveIds], ["account_id", "not in", liquidez]],
        ["move_id", "account_id", "balance", "matching_number"],
        { limit: 10000 },
      )
    : [];
  const pendientes = new Set((await metodosPago(diarioIds)).map((m) => m.cuentaId).filter(Boolean) as number[]);

  // Contrapartida en una cuenta de pagos pendientes: la cuenta real es la del contacto en el pago conciliado
  const matching = [...new Set(contra.filter((c) => pendientes.has(id(c.account_id)) && c.matching_number).map((c) => c.matching_number as string))];
  const cuentaPorMatching = new Map<string, string>();
  if (matching.length) {
    const otros = await sr<{ move_id: M2O; matching_number: string }>(
      "account.move.line",
      [["matching_number", "in", matching], ["move_id", "not in", moveIds]],
      ["move_id", "matching_number"],
      { limit: 10000 },
    );
    const pagoMoves = [...new Set(otros.map((o) => id(o.move_id)))];
    const partner = pagoMoves.length
      ? await sr<{ move_id: M2O; account_id: M2O }>(
          "account.move.line",
          [["move_id", "in", pagoMoves], ["account_id.account_type", "in", ["asset_receivable", "liability_payable"]]],
          ["move_id", "account_id"],
          { limit: 10000 },
        )
      : [];
    const cuentaDePago = new Map(partner.map((x) => [id(x.move_id), nom(x.account_id)]));
    for (const o of otros) {
      const c = cuentaDePago.get(id(o.move_id));
      if (c) cuentaPorMatching.set(o.matching_number, c);
    }
  }

  const cuentaDeMove = new Map<number, string>();
  for (const c of contra) {
    if (cuentaDeMove.get(id(c.move_id))) continue;
    const real = pendientes.has(id(c.account_id)) ? cuentaPorMatching.get(c.matching_number || "") ?? "" : nom(c.account_id);
    cuentaDeMove.set(id(c.move_id), real);
  }

  const partes: Parte[] = lineas.map((l) => {
    const op = opDeRef(l.ref);
    const grupo = op ? `op-${op}` : `mv-${id(l.move_id)}`;
    if (!op && !externos.has(grupo)) externos.set(grupo, { concepto: l.name || "", contacto: nom(l.partner_id), fecha: l.date, momento: odooMs(l.create_date) });
    const cuenta = cuentaDeMove.get(id(l.move_id)) || "Pagos y cobros";
    return { grupo, cuenta, diario: diarioDeCuenta.get(id(l.account_id))!, importe: l.balance, pend: false };
  });

  // Cheques propios entregados y no debitados: importe pendiente en el banco. Por cheque: con varios cheques
  // Odoo separa una línea pendiente por cheque y el pago puede figurar pagado aunque falten débitos
  const cheques = await sr<{ amount: number; payment_id: M2O }>(
    "l10n_latam.check",
    [["payment_method_code", "=", "own_checks"], ["issue_state", "=", "handed"], ["payment_id.journal_id", "in", diarioIds], ["payment_id.date", ">=", desde], ["payment_id.date", "<=", hasta]],
    ["amount", "payment_id"],
    { limit: 5000 },
  );
  const pendientePorPago = new Map<number, number>();
  for (const c of cheques) pendientePorPago.set(id(c.payment_id), (pendientePorPago.get(id(c.payment_id)) ?? 0) + c.amount);
  const propios = pendientePorPago.size
    ? await sr<{ id: number; journal_id: M2O; partner_id: M2O; memo: string | false; payment_reference: string | false; date: string; destination_account_id: M2O; create_date: string }>(
        "account.payment",
        [["id", "in", [...pendientePorPago.keys()]]],
        ["journal_id", "partner_id", "memo", "payment_reference", "date", "destination_account_id", "create_date"],
        { limit: pendientePorPago.size },
      )
    : [];
  for (const p of propios) {
    const op = opDeRef(p.payment_reference);
    const grupo = op ? `op-${op}` : `pg-${p.id}`;
    if (!op && !externos.has(grupo)) externos.set(grupo, { concepto: p.memo || "Pago con cheque propio", contacto: nom(p.partner_id), fecha: p.date, momento: odooMs(p.create_date) });
    partes.push({ grupo, cuenta: nom(p.destination_account_id), diario: id(p.journal_id), importe: -round2(pendientePorPago.get(p.id) ?? 0), pend: true });
  }
  return partes;
}
