// Tesorería ↔ Odoo: cliente con timeout y lecturas de catálogos.
// Las escrituras contables viven en tesoreriaPasos.ts.
import type { ChequeCartera, ChequeEmitido, FacturaPendiente, TipoComprobante } from "@/lib/tesoreria";

const BASE_URL = `${process.env.ODOO_URL}/json/2`;
const TIMEOUT_MS = 30_000;

/** Error de Odoo. `ambiguo` = no sabemos si Odoo aplicó el cambio (timeout o corte). */
export class OdooTesoreriaError extends Error {
  constructor(message: string, public ambiguo: boolean, public tecnico: string) {
    super(message);
  }
}

const LECTURA = new Set(["search_read", "search_count", "search", "read", "fields_get", "name_search", "formatted_read_group"]);

export async function ot<T = unknown>(model: string, method: string, body: object = {}): Promise<T> {
  // Seguro: Tesorería no escribe en Odoo hasta habilitarlo explícitamente (base de prueba verificada)
  if (!LECTURA.has(method) && process.env.TESORERIA_ODOO_ESCRITURA !== "1") {
    throw new OdooTesoreriaError("La escritura de Tesorería en Odoo está deshabilitada (TESORERIA_ODOO_ESCRITURA).", false, `${model}.${method} bloqueado`);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${model}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ODOO_API_KEY}` },
      body: JSON.stringify({ context: { lang: "es_AR" }, ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const tecnico = `${model}.${method}: ${e instanceof Error ? e.message : String(e)}`;
    throw new OdooTesoreriaError("Odoo no respondió.", true, tecnico);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg: string = err?.message || `HTTP ${res.status}`;
    console.error(`[tesoreria] ${model}.${method} falló`, msg);
    throw new OdooTesoreriaError(msg, [502, 503, 504].includes(res.status), `${model}.${method}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

export const sr = <T>(model: string, domain: unknown[], fields: string[], options: object = {}) =>
  ot<T[]>(model, "search_read", { domain, fields, ...options });

type M2O = [number, string] | false;
const m2oId = (v: M2O) => (v ? v[0] : null);
const m2oName = (v: M2O) => (v ? v[1] : "");

// ─── Catálogos ──────────────────────────────────────────────────────────────

export type OdooDiario = { id: number; nombre: string; tipo: "EFECTIVO" | "BANCO" | "CHEQUES"; cuentaId: number | null };

/** Diarios de efectivo, banco y Cheques de Terceros en ARS (activos). */
export async function diariosOdoo(): Promise<OdooDiario[]> {
  const js = await sr<{ id: number; name: string; type: string; currency_id: M2O; default_account_id: M2O; inbound_payment_method_line_ids: number[] }>(
    "account.journal",
    [["type", "in", ["cash", "bank"]]],
    ["name", "type", "currency_id", "default_account_id", "inbound_payment_method_line_ids"],
    { order: "name asc" },
  );
  const lineas = await sr<{ id: number; code: string }>("account.payment.method.line", [["code", "=", "new_third_party_checks"]], ["code"]);
  const chequeLineas = new Set(lineas.map((l) => l.id));
  return js
    .filter((j) => !j.currency_id || j.currency_id[1] === "ARS")
    .filter((j) => !/rechazad/i.test(j.name))
    .map((j) => ({
      id: j.id,
      nombre: j.name,
      tipo: j.inbound_payment_method_line_ids.some((id) => chequeLineas.has(id)) ? "CHEQUES" : j.type === "cash" ? "EFECTIVO" : "BANCO",
      cuentaId: m2oId(j.default_account_id),
    }));
}

export type OdooCuenta = { id: number; codigo: string; nombre: string; tipo: string };

export async function cuentasOdoo(): Promise<OdooCuenta[]> {
  const cs = await sr<{ id: number; code: string; name: string; account_type: string }>(
    "account.account",
    [],
    ["code", "name", "account_type"],
    { order: "code asc" },
  );
  return cs.map((c) => ({ id: c.id, codigo: c.code, nombre: c.name, tipo: c.account_type }));
}

export async function diariosGenerales(): Promise<{ id: number; nombre: string; tipo: string }[]> {
  const js = await sr<{ id: number; name: string; type: string }>("account.journal", [["type", "in", ["general", "purchase"]]], ["name", "type"]);
  return js.map((j) => ({ id: j.id, nombre: j.name, tipo: j.type }));
}

/** Cuentas usadas como contrapartida en líneas de extracto de esos diarios (último año). */
export async function cuentasSugeridas(journalIds: number[], desde: string) {
  if (!journalIds.length) return { gasto: [] as number[], ingreso: [] as number[], socio: [] as number[] };
  const js = await sr<{ suspense_account_id: M2O }>("account.journal", [["id", "in", journalIds]], ["suspense_account_id"]);
  const suspenso = [...new Set(js.map((j) => m2oId(j.suspense_account_id)).filter((x): x is number => !!x))];
  const ls = await sr<{ account_id: M2O; balance: number; account_type: string }>(
    "account.move.line",
    [
      ["journal_id", "in", journalIds],
      ["move_id.statement_line_id", "!=", false],
      ["parent_state", "=", "posted"],
      ["date", ">=", desde],
      ["account_id.account_type", "not in", ["asset_cash", "liability_credit_card"]],
      ["account_id.reconcile", "=", false],
      ["account_id", "not in", suspenso],
    ],
    ["account_id", "balance", "account_type"],
    { limit: 5000 },
  );
  const gasto = new Set<number>(), ingreso = new Set<number>(), socio = new Set<number>();
  for (const l of ls) {
    const id = m2oId(l.account_id);
    if (!id) continue;
    if (l.account_type === "equity") socio.add(id);
    else if (l.balance > 0) gasto.add(id); // débito en la contrapartida = salió plata
    else ingreso.add(id);
  }
  return { gasto: [...gasto], ingreso: [...ingreso], socio: [...socio] };
}

// ─── Contactos ──────────────────────────────────────────────────────────────

export type Contacto = { id: number; nombre: string; cuit: string };

export async function buscarContactos(q: string): Promise<Contacto[]> {
  const t = q.trim();
  if (t.length < 2) return [];
  const digitos = t.replace(/\D/g, "");
  const domain = digitos.length >= 5 && digitos.length === t.replace(/[-\s]/g, "").length
    ? [["vat", "ilike", digitos]]
    : [["name", "ilike", t]];
  const ps = await sr<{ id: number; name: string; vat: string | false }>("res.partner", domain, ["name", "vat"], { limit: 20, order: "name asc" });
  return ps.map((p) => ({ id: p.id, nombre: p.name, cuit: p.vat || "" }));
}

export async function contactoPorCuit(cuit: string): Promise<Contacto | null> {
  const ps = await sr<{ id: number; name: string; vat: string | false }>("res.partner", [["vat", "in", [cuit, cuit.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3")]]], ["name", "vat"], { limit: 1 });
  return ps[0] ? { id: ps[0].id, nombre: ps[0].name, cuit: ps[0].vat || "" } : null;
}

export async function contactosActivos(ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const ps = await sr<{ id: number }>("res.partner", [["id", "in", ids]], ["id"]);
  return new Set(ps.map((p) => p.id));
}

export async function responsabilidadesIva() {
  const rs = await sr<{ id: number; name: string }>("l10n_ar.afip.responsibility.type", [], ["name"], { order: "name asc" });
  return rs.map((r) => ({ id: r.id, nombre: r.name }));
}

export async function tipoIdentificacionCuit(): Promise<number> {
  const ts = await sr<{ id: number }>("l10n_latam.identification.type", [["name", "=", "CUIT"]], ["id"], { limit: 1 });
  if (!ts[0]) throw new OdooTesoreriaError("Odoo no tiene el tipo de identificación CUIT.", false, "l10n_latam.identification.type CUIT");
  return ts[0].id;
}

// ─── Facturas con saldo (imputación en Pago / Cobro) ────────────────────────

/** Facturas y notas de crédito publicadas con saldo del contacto (y sus hijos), por vencimiento. */
export async function facturasPendientes(contactoId: number, tipo: "PAGO" | "COBRO"): Promise<FacturaPendiente[]> {
  const [p] = await sr<{ commercial_partner_id: M2O }>("res.partner", [["id", "=", contactoId]], ["commercial_partner_id"]);
  if (!p) return [];
  const tipos = tipo === "PAGO" ? ["in_invoice", "in_refund"] : ["out_invoice", "out_refund"];
  const ms = await sr<{ id: number; name: string; ref: string | false; l10n_latam_document_type_id: M2O; move_type: string; invoice_date: string | false; invoice_date_due: string | false; amount_total: number; amount_residual: number }>(
    "account.move",
    [["commercial_partner_id", "=", m2oId(p.commercial_partner_id) ?? contactoId], ["move_type", "in", tipos], ["state", "=", "posted"], ["payment_state", "in", ["not_paid", "partial"]], ["amount_residual", ">", 0]],
    ["name", "ref", "l10n_latam_document_type_id", "move_type", "invoice_date", "invoice_date_due", "amount_total", "amount_residual"],
    { order: "invoice_date_due asc, id asc", limit: 200 },
  );
  return ms.map((m) => {
    const s = m.move_type.endsWith("_refund") ? -1 : 1;
    // Sin comprobante (diario "Compras B"): el nombre es la secuencia; el número del proveedor está en ref
    const numero = !m.l10n_latam_document_type_id && m.ref ? `${m.ref} (${m.name})` : m.name;
    return { id: m.id, numero, fecha: m.invoice_date || "", vencimiento: m.invoice_date_due || "", total: s * m.amount_total, saldo: s * m.amount_residual };
  });
}

/** Tipos de comprobante de letra A usados en facturas de compra (más Factura A, código 1). */
export async function tiposComprobanteCompra(): Promise<TipoComprobante[]> {
  const usados = await sr<{ l10n_latam_document_type_id: M2O }>(
    "account.move",
    [["move_type", "=", "in_invoice"], ["state", "=", "posted"], ["l10n_latam_document_type_id", "!=", false]],
    ["l10n_latam_document_type_id"],
    { limit: 2000, order: "id desc" },
  );
  const ids = [...new Set(usados.map((m) => m2oId(m.l10n_latam_document_type_id)!))];
  const ts = await sr<{ id: number; name: string; doc_code_prefix: string | false }>(
    "l10n_latam.document.type",
    [["l10n_ar_letter", "=", "A"], ["internal_type", "=", "invoice"], "|", ["id", "in", ids], ["code", "=", "1"]],
    ["name", "doc_code_prefix"],
    { order: "code asc" },
  );
  return ts.filter((t) => t.doc_code_prefix).map((t) => ({ id: t.id, nombre: t.name, prefijo: t.doc_code_prefix as string }));
}

// ─── Bancos y cheques ───────────────────────────────────────────────────────

export async function bancos() {
  const bs = await sr<{ id: number; name: string }>("res.bank", [], ["name"], { order: "name asc" });
  return bs.map((b) => ({ id: b.id, nombre: b.name }));
}

type OdooCheque = {
  id: number; name: string; bank_id: M2O; issuer_vat: string | false; payment_date: string | false;
  amount: number; partner_id: M2O; payment_id: M2O; current_journal_id: M2O; issue_state: string | false;
};
const CHEQUE_FIELDS = ["name", "bank_id", "issuer_vat", "payment_date", "amount", "partner_id", "payment_id", "current_journal_id", "issue_state"];

/** Cheques de terceros en cartera (diario actual = Cheques de Terceros). */
export async function cartera(chequesJournalId: number): Promise<ChequeCartera[]> {
  const cs = await sr<OdooCheque>("l10n_latam.check", [["current_journal_id", "=", chequesJournalId]], CHEQUE_FIELDS, { order: "payment_date asc", limit: 500 });
  return cs.map((c) => ({
    id: c.id,
    numero: c.name,
    bancoNombre: m2oName(c.bank_id),
    librador: c.issuer_vat || "",
    fechaPago: c.payment_date || "",
    importe: c.amount,
  }));
}

/** Cheques propios entregados y no debitados de un banco (pago en proceso). */
export async function chequesPropiosPendientes(journalId: number): Promise<ChequeEmitido[]> {
  const cs = await sr<OdooCheque>(
    "l10n_latam.check",
    // Por cheque: con varios cheques el pago puede figurar pagado aunque sigan entregados
    [["original_journal_id", "=", journalId], ["payment_method_code", "=", "own_checks"], ["issue_state", "=", "handed"]],
    CHEQUE_FIELDS,
    { order: "payment_date asc", limit: 500 },
  );
  return cs
    .filter((c) => c.payment_id)
    .map((c) => ({
      id: c.id,
      numero: c.name,
      bancoNombre: "",
      librador: "",
      fechaPago: c.payment_date || "",
      importe: c.amount,
      paymentId: m2oId(c.payment_id)!,
      contacto: m2oName(c.partner_id),
    }));
}

export async function proximoNumeroCheque(journalId: number): Promise<string> {
  const cs = await sr<{ name: string }>(
    "l10n_latam.check",
    [["original_journal_id", "=", journalId], ["payment_method_code", "=", "own_checks"]],
    ["name"],
    { order: "id desc", limit: 20 },
  );
  const max = Math.max(0, ...cs.map((c) => Number(c.name)).filter((n) => Number.isFinite(n) && n < 1e8));
  return max ? String(max + 1).padStart(8, "0") : "";
}

export async function numeroPropioUsado(journalId: number, numero: string): Promise<boolean> {
  const n = await ot<number>("l10n_latam.check", "search_count", {
    domain: [["original_journal_id", "=", journalId], ["payment_method_code", "=", "own_checks"], ["name", "=", numero]],
  });
  return n > 0;
}

export async function chequeTerceroExiste(numero: string, bancoId: number, cuit: string): Promise<boolean> {
  const n = await ot<number>("l10n_latam.check", "search_count", {
    domain: [["name", "=", numero], ["bank_id", "=", bancoId], ["issuer_vat", "=", cuit.replace(/\D/g, "")], ["payment_method_code", "!=", "own_checks"]],
  });
  return n > 0;
}

export async function chequesEnDiario(ids: number[], journalId: number): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const cs = await sr<{ id: number }>("l10n_latam.check", [["id", "in", ids], ["current_journal_id", "=", journalId]], ["id"]);
  return new Set(cs.map((c) => c.id));
}

/** Líneas de método de pago por diario y código. */
export async function metodosPago(journalIds: number[]) {
  const ls = await sr<{ id: number; code: string; payment_type: string; journal_id: M2O; payment_account_id: M2O }>(
    "account.payment.method.line",
    [["journal_id", "in", journalIds]],
    ["code", "payment_type", "journal_id", "payment_account_id"],
  );
  return ls.map((l) => ({ id: l.id, code: l.code, tipo: l.payment_type as "inbound" | "outbound", diarioId: m2oId(l.journal_id)!, cuentaId: m2oId(l.payment_account_id) }));
}

export async function odooDisponible(): Promise<boolean> {
  try {
    await ot("res.company", "search_count", { domain: [] });
    return true;
  } catch {
    return false;
  }
}
