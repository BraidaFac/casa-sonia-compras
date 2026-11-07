// Tesorería — adjuntos por medio de pago (R55). Odoo es la fuente de verdad: en la app solo quedan
// los de borradores hasta que el paso "adjunto" los sube como ir.attachment.
import { prisma } from "@/lib/prisma";
import { OdooTesoreriaError, ot, sr } from "@/lib/odooTesoreria";
import type { PasoDef } from "@/lib/tesoreriaPasos";

export const MAX_ADJUNTO = 10 * 1024 * 1024;
// SVG queda afuera: puede llevar scripts y se muestra en línea
// Lista cerrada sobre el tipo sin parámetros: "image/svg+xml; x" no debe pasar (se serviría inline → XSS).
export const esencia = (m: string) => m.split(";")[0].trim().toLowerCase();
const PERMITIDOS = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/heif"]);
export const mimeValido = (m: string) => PERMITIDOS.has(esencia(m));

type M2O = [number, string] | false;

/** Pasos destino de una ranura: los pagos de ese diario; si no hay, sus líneas de extracto; null = la factura. */
export function destinosDeRanura(defs: PasoDef[], diarioId: number | null): number[] {
  const idx = (f: (p: PasoDef) => boolean) => defs.flatMap((p, i) => (f(p) ? [i] : []));
  if (diarioId === null) return idx((p) => p.tipo === "factura");
  const pagos = idx((p) => p.tipo === "pago" && p.diarioId === diarioId);
  return pagos.length ? pagos : idx((p) => (p.tipo === "linea" || p.tipo === "conciliar_pago") && p.diarioId === diarioId);
}

export function pasosAdjuntos(defs: PasoDef[], adjuntos: { id: number; diarioId: number | null; nombre: string }[]): PasoDef[] {
  return adjuntos.map((a) => ({ tipo: "adjunto", adjuntoId: a.id, nombre: a.nombre, pasos: destinosDeRanura(defs, a.diarioId) }));
}

export type Registro = { model: "account.payment" | "account.move"; id: number };

/** Registro de Odoo que lleva el adjunto: el pago, la factura o el asiento de la línea de extracto. */
export async function registroAdjuntable(odooModelo: string | null, odooId: number | null): Promise<Registro | null> {
  if (!odooId) return null;
  if (odooModelo === "account.payment" || odooModelo === "account.move") return { model: odooModelo, id: odooId };
  if (odooModelo === "account.bank.statement.line") {
    const [l] = await sr<{ move_id: M2O }>("account.bank.statement.line", [["id", "=", odooId]], ["move_id"]);
    return l?.move_id ? { model: "account.move", id: l.move_id[0] } : null;
  }
  return null;
}

export async function subirAdjunto(reg: Registro, a: { nombre: string; mimetype: string; contenido: Uint8Array }, descripcion: string) {
  const ya = await sr<{ id: number }>("ir.attachment", [["res_model", "=", reg.model], ["res_id", "=", reg.id], ["description", "=", descripcion]], ["id"], { limit: 1 });
  if (ya.length) return;
  await ot("ir.attachment", "create", {
    vals_list: [{ name: a.nombre, datas: Buffer.from(a.contenido).toString("base64"), mimetype: a.mimetype, res_model: reg.model, res_id: reg.id, description: descripcion }],
  });
}

/** Registros de Odoo de una operación (pasos OK de la ejecución) con la ranura de cada uno. */
export async function registrosOperacion(opId: number): Promise<(Registro & { diarioId: number | null })[]> {
  const pasos = await prisma.tesoreriaPaso.findMany({ where: { operacionId: opId, fase: "EJECUCION", estado: "OK", odooId: { not: null } }, orderBy: { orden: "asc" } });
  const out: (Registro & { diarioId: number | null })[] = [];
  for (const p of pasos) {
    const def = p.payload as unknown as PasoDef;
    if (def.tipo !== "pago" && def.tipo !== "linea" && def.tipo !== "conciliar_pago" && def.tipo !== "factura") continue;
    const reg = await registroAdjuntable(p.odooModelo, p.odooId);
    if (reg && !out.some((x) => x.model === reg.model && x.id === reg.id)) out.push({ ...reg, diarioId: def.tipo === "factura" ? null : def.diarioId });
  }
  return out;
}

export type AdjuntoOdoo = { id: number; nombre: string; mimetype: string; tamano: number; diarioId: number | null };

export async function adjuntosOdoo(regs: (Registro & { diarioId: number | null })[]): Promise<AdjuntoOdoo[]> {
  const out: AdjuntoOdoo[] = [];
  for (const model of ["account.payment", "account.move"] as const) {
    const ids = regs.filter((r) => r.model === model).map((r) => r.id);
    if (!ids.length) continue;
    const as = await sr<{ id: number; name: string; mimetype: string; file_size: number; res_id: number }>(
      "ir.attachment", [["res_model", "=", model], ["res_id", "in", ids]], ["name", "mimetype", "file_size", "res_id"], { order: "id asc" },
    );
    for (const a of as) out.push({ id: a.id, nombre: a.name, mimetype: a.mimetype, tamano: a.file_size, diarioId: regs.find((r) => r.model === model && r.id === a.res_id)!.diarioId });
  }
  return out;
}

/** Contenido de un adjunto de Odoo, solo si pertenece a un registro de la operación. */
export async function descargarAdjuntoOdoo(regs: Registro[], attId: number) {
  const [a] = await sr<{ name: string; mimetype: string; datas: string | false; res_model: string; res_id: number }>("ir.attachment", [["id", "=", attId]], ["name", "mimetype", "datas", "res_model", "res_id"]);
  if (!a || !regs.some((r) => r.model === a.res_model && r.id === a.res_id)) return null;
  if (!a.datas) throw new OdooTesoreriaError("El adjunto no tiene contenido en Odoo.", false, `ir.attachment ${attId}`);
  return { nombre: a.name, mimetype: a.mimetype, contenido: Buffer.from(a.datas, "base64") };
}
