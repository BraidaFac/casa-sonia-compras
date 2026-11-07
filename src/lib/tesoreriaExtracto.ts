// Vista Extracto: líneas de un diario en el período, con saldo acumulado y conciliación (solo lectura de Odoo).
import { prisma } from "@/lib/prisma";
import { cargarConfig } from "@/lib/tesoreriaConfig";
import { diariosOdoo, ot, OdooTesoreriaError, sr } from "@/lib/odooTesoreria";
import { etiqueta, round2, type Datos } from "@/lib/tesoreria";
import { opDeRef } from "@/lib/tesoreriaVista";

export type FilaExtracto = {
  key: string;
  clase: "APP" | "EXTERNO";
  operacionId?: number;
  moveId?: number;
  fecha: string;
  etiqueta: string;
  contacto: string;
  importe: number;
  balance: number;
  conciliado: boolean;
};

export type Extracto = {
  odooDisponible: boolean;
  diarioId: number;
  desde: string;
  hasta: string;
  saldoInicial: number;
  saldoFinal: number;
  filas: FilaExtracto[];
  truncado: boolean; // se alcanzó el límite de líneas: faltan movimientos
  odooUrl: string;
};

export class DiarioInvalido extends Error {}

type M2O = [number, string] | false;
const id = (v: M2O) => (v ? v[0] : 0);
const nom = (v: M2O) => (v ? v[1] : "");

const LIMITE = 5000;

export async function armarExtracto(diarioId: number, desde: string, hasta: string): Promise<Extracto> {
  const base = { diarioId, desde, hasta, odooUrl: process.env.ODOO_URL ?? "" };
  const cfg = await cargarConfig();
  if (!cfg.diarios.some((d) => d.odooJournalId === diarioId)) throw new DiarioInvalido("El diario no está habilitado en Tesorería.");

  try {
    // diariosOdoo() solo trae diarios en pesos (R58)
    const diario = (await diariosOdoo()).find((d) => d.id === diarioId);
    if (!diario?.cuentaId) throw new DiarioInvalido("El diario no está disponible en Odoo o no es en pesos.");
    // Toda la cuenta del diario, venga el asiento del diario que venga (como el saldo contable de Odoo)
    const dominio = [["account_id", "=", diario.cuentaId], ["parent_state", "=", "posted"]];

    const saldoInicial = (await sumaBalancePorCuenta([...dominio, ["date", "<", desde]])).get(diario.cuentaId) ?? 0;

    type Aml = { id: number; move_id: M2O; balance: number; name: string | false; partner_id: M2O; date: string; ref: string | false; statement_line_id: M2O };
    const lineas = await sr<Aml>(
      "account.move.line",
      [...dominio, ["date", ">=", desde], ["date", "<=", hasta]],
      ["move_id", "balance", "name", "partner_id", "date", "ref", "statement_line_id"],
      { limit: LIMITE, order: "date asc, id asc" },
    );

    // Asiento directo a la cuenta del diario (sin línea de extracto): no hay nada que conciliar
    const stmtIds = [...new Set(lineas.map((l) => id(l.statement_line_id)).filter(Boolean))];
    const stmts = stmtIds.length ? await sr<{ id: number; is_reconciled: boolean }>("account.bank.statement.line", [["id", "in", stmtIds]], ["is_reconciled"], { limit: stmtIds.length }) : [];
    const conciliada = new Map(stmts.map((s) => [s.id, s.is_reconciled]));

    const opIds = [...new Set(lineas.map((l) => opDeRef(l.ref)).filter((x): x is number => x !== null))];
    const ops = opIds.length ? await prisma.tesoreriaOperacion.findMany({ where: { id: { in: opIds } } }) : [];
    const opPorId = new Map(ops.map((o) => [o.id, o]));
    const nombreDiario = (i?: number) => cfg.diarios.find((d) => d.odooJournalId === i)?.nombre ?? "";

    // Una fila por operación de la app (R26) o por línea externa, en el orden de su primera línea
    const filas = new Map<string, Omit<FilaExtracto, "balance">>();
    for (const l of lineas) {
      const opId = opDeRef(l.ref);
      const op = opId !== null ? opPorId.get(opId) : undefined;
      const key = op ? `op-${op.id}` : `ml-${l.id}`;
      const ok = l.statement_line_id ? conciliada.get(id(l.statement_line_id)) ?? false : true;
      const f = filas.get(key);
      if (f) {
        f.importe = round2(f.importe + l.balance);
        f.conciliado &&= ok;
        continue;
      }
      filas.set(key, op
        ? { key, clase: "APP", operacionId: op.id, fecha: l.date, etiqueta: etiqueta(op.tipo, op.datos as Datos, { observacion: op.observacion, contacto: op.contactoNombre, diarioNombre: nombreDiario }), contacto: op.contactoNombre ?? nom(l.partner_id), importe: round2(l.balance), conciliado: ok }
        : { key, clase: "EXTERNO", moveId: id(l.move_id), fecha: l.date, etiqueta: l.name || nom(l.move_id), contacto: nom(l.partner_id), importe: round2(l.balance), conciliado: ok });
    }

    let balance = saldoInicial;
    const conBalance = [...filas.values()].map((f) => ({ ...f, balance: (balance = round2(balance + f.importe)) }));
    return { ...base, odooDisponible: true, saldoInicial, saldoFinal: balance, filas: conBalance, truncado: lineas.length === LIMITE };
  } catch (e) {
    if (!(e instanceof OdooTesoreriaError && e.ambiguo)) throw e;
    console.error("[tesoreria] extracto sin Odoo", e.tecnico);
    return { ...base, odooDisponible: false, saldoInicial: 0, saldoFinal: 0, filas: [], truncado: false };
  }
}

/**
 * Suma de balance por cuenta, agregada en Odoo; si formatted_read_group no responde como se espera, suma paginando.
 * Por cuenta y no por diario: el saldo de una caja incluye asientos de otros diarios sobre su cuenta (apertura, ajustes, cambios).
 */
export async function sumaBalancePorCuenta(domain: unknown[]): Promise<Map<number, number>> {
  // La clave del grupo puede venir como [id, nombre] o como id
  const cuentaDe = (v: unknown) => (Array.isArray(v) ? Number(v[0]) : Number(v));
  try {
    const r = await ot<Record<string, unknown>[]>("account.move.line", "formatted_read_group", { domain, groupby: ["account_id"], aggregates: ["balance:sum"] });
    if (Array.isArray(r) && r.every((g) => typeof g["balance:sum"] === "number" && cuentaDe(g.account_id) > 0)) {
      return new Map(r.map((g) => [cuentaDe(g.account_id), round2(g["balance:sum"] as number)]));
    }
  } catch (e) {
    if (e instanceof OdooTesoreriaError && e.ambiguo) throw e;
  }
  // ponytail: fallback lento en cuentas con mucha historia; quitar si formatted_read_group queda verificado
  const total = new Map<number, number>();
  for (let offset = 0; ; offset += LIMITE) {
    const ls = await sr<{ account_id: M2O; balance: number }>("account.move.line", domain, ["account_id", "balance"], { limit: LIMITE, offset, order: "id asc" });
    for (const l of ls) total.set(id(l.account_id), (total.get(id(l.account_id)) ?? 0) + l.balance);
    if (ls.length < LIMITE) return new Map([...total].map(([k, v]) => [k, round2(v)]));
  }
}
