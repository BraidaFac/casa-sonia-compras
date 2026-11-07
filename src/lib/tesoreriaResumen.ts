// Resumen PN (posición neta): saldos por diario y cheques propios pendientes de débito (solo lectura de Odoo).
import { cargarConfig } from "@/lib/tesoreriaConfig";
import { diariosOdoo, OdooTesoreriaError, sr } from "@/lib/odooTesoreria";
import { round2, sumarDias } from "@/lib/tesoreria";
import { sumaBalancePorCuenta } from "@/lib/tesoreriaExtracto";
import { rango, type Periodo } from "@/lib/tesoreriaVista";

export type Saldos = { inicio: number; movimientos: number; final: number };
export type FilaResumen = Saldos & { diarioId: number; nombre: string };

export type Resumen = {
  odooDisponible: boolean;
  desde: string;
  hasta: string;
  filas: FilaResumen[];
  cheques: Saldos;
  total: Saldos;
};

type M2O = [number, string] | false;
const id = (v: M2O) => (v ? v[0] : 0);
const CERO: Saldos = { inicio: 0, movimientos: 0, final: 0 };

export async function armarResumen(periodo: Periodo, fecha: string): Promise<Resumen> {
  const { desde, hasta } = rango(periodo, fecha);
  const base = { desde, hasta };
  const cfg = await cargarConfig();
  try {
    // diariosOdoo() solo trae diarios en pesos (R58); se respeta el orden de la configuración
    const odoo = new Map((await diariosOdoo()).map((d) => [d.id, d]));
    const diarios = cfg.diarios.filter((d) => odoo.get(d.odooJournalId)?.cuentaId);
    const ids = diarios.map((d) => d.odooJournalId);
    if (!ids.length) return { ...base, odooDisponible: true, filas: [], cheques: CERO, total: CERO };

    // Saldo = cuenta de liquidez del diario, con asientos de cualquier diario (apertura, ajustes)
    const cuenta = (d: { odooJournalId: number }) => odoo.get(d.odooJournalId)!.cuentaId!;
    const dominio = [["account_id", "in", diarios.map(cuenta)], ["parent_state", "=", "posted"]];
    const [inicios, movs, cheques] = await Promise.all([
      sumaBalancePorCuenta([...dominio, ["date", "<", desde]]),
      sumaBalancePorCuenta([...dominio, ["date", ">=", desde], ["date", "<=", hasta]]),
      chequesPropios(ids, desde, hasta),
    ]);

    const filas = diarios.map((d) => {
      const inicio = inicios.get(cuenta(d)) ?? 0;
      const movimientos = movs.get(cuenta(d)) ?? 0;
      return { diarioId: d.odooJournalId, nombre: d.nombre, inicio, movimientos, final: round2(inicio + movimientos) };
    });
    const sumar = (k: keyof Saldos) => round2(filas.reduce((a, f) => a + f[k], 0) + cheques[k]);
    return { ...base, odooDisponible: true, filas, cheques, total: { inicio: sumar("inicio"), movimientos: sumar("movimientos"), final: sumar("final") } };
  } catch (e) {
    if (!(e instanceof OdooTesoreriaError && e.ambiguo)) throw e;
    console.error("[tesoreria] resumen sin Odoo", e.tecnico);
    return { ...base, odooDisponible: false, filas: [], cheques: CERO, total: CERO };
  }
}

/** Cheques propios entregados y no debitados al inicio y al final del período, en negativo (design D2). */
async function chequesPropios(diarioIds: number[], desde: string, hasta: string): Promise<Saldos> {
  // Por cheque: con varios cheques Odoo separa una línea pendiente por cheque (outstanding_line_id)
  // y el pago puede figurar pagado aunque falten débitos. Un cheque no queda más de 360 días sin debitar.
  const haceUnAnio = sumarDias(desde, -366);
  const cheques = await sr<{ id: number; amount: number; issue_state: string; payment_id: M2O; outstanding_line_id: M2O }>(
    "l10n_latam.check",
    [["payment_method_code", "=", "own_checks"], ["payment_id.journal_id", "in", diarioIds], ["payment_id.date", "<=", hasta],
      "|", ["issue_state", "=", "handed"], "&", ["issue_state", "=", "debited"], ["payment_id.date", ">=", haceUnAnio]],
    ["amount", "issue_state", "payment_id", "outstanding_line_id"],
    { limit: 5000 },
  );
  if (!cheques.length) return CERO;

  // Emisión = fecha del pago
  const pagoIds = [...new Set(cheques.map((c) => id(c.payment_id)))];
  const pagos = await sr<{ id: number; date: string }>("account.payment", [["id", "in", pagoIds]], ["date"], { limit: pagoIds.length });
  const emision = new Map(pagos.map((p) => [p.id, p.date]));

  // Débito = fecha de la línea que concilia la línea pendiente del cheque
  const debito = new Map<number, string>();
  const debitados = cheques.filter((c) => c.issue_state === "debited" && c.outstanding_line_id);
  if (debitados.length) {
    const lineaIds = debitados.map((c) => id(c.outstanding_line_id));
    const propias = await sr<{ id: number; matching_number: string | false }>("account.move.line", [["id", "in", lineaIds]], ["matching_number"], { limit: lineaIds.length });
    const matching = [...new Set(propias.map((l) => l.matching_number).filter(Boolean) as string[])];
    const otras = matching.length
      ? await sr<{ date: string; matching_number: string }>("account.move.line", [["matching_number", "in", matching], ["id", "not in", lineaIds]], ["date", "matching_number"], { limit: 10000 })
      : [];
    const fechaMatch = new Map<string, string>();
    for (const o of otras) if (o.date > (fechaMatch.get(o.matching_number) ?? "")) fechaMatch.set(o.matching_number, o.date);
    const matchDeLinea = new Map(propias.map((l) => [l.id, l.matching_number]));
    for (const c of debitados) {
      const f = fechaMatch.get(matchDeLinea.get(id(c.outstanding_line_id)) || "");
      if (f) debito.set(c.id, f);
    }
  }

  // Debitado sin conciliación encontrada (dato inconsistente): se toma debitado en su emisión
  const pendienteA = (d: string) =>
    -round2(cheques.reduce((a, c) => {
      const em = emision.get(id(c.payment_id)) ?? "";
      if (!em || em > d) return a;
      const deb = c.issue_state === "handed" ? null : debito.get(c.id) ?? em;
      return deb === null || deb > d ? a + c.amount : a;
    }, 0));
  const inicio = pendienteA(sumarDias(desde, -1));
  const final = pendienteA(hasta);
  return { inicio, movimientos: round2(final - inicio), final };
}
