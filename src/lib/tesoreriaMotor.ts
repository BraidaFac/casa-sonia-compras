// Tesorería — motor de ejecución por pasos, dentro del request (R12).
// Cada paso se guarda antes y después de llamar a Odoo; si falla, la operación queda "Requiere atención".
import { prisma } from "@/lib/prisma";
import { Prisma } from "../../prisma/generated/client";
import { cargarConfig, contextoValidacion } from "@/lib/tesoreriaConfig";
import { OdooTesoreriaError } from "@/lib/odooTesoreria";
import {
  bloqueoAnulacion,
  ejecutarPaso,
  generarPasos,
  pasosAnulacion,
  revalidar,
  type CtxPaso,
  type OpEjec,
  type PasoDef,
} from "@/lib/tesoreriaPasos";
import { pasosAdjuntos } from "@/lib/tesoreriaAdjuntos";
import { chequesDe, totalOperacion, validar, type Datos } from "@/lib/tesoreria";

type Fase = "EJECUCION" | "ANULACION";
export type ResultadoMotor = { ok: true } | { ok: false; status: number; error: string; duplicado?: { id: number } };

/** Una operación que quedó PROCESANDO/ANULANDO sin actividad (proceso cortado) pasa a "Requiere atención". */
const HUERFANA_MS = 5 * 60_000;
export async function rescatarHuerfana(opId: number) {
  await prisma.tesoreriaOperacion.updateMany({
    where: { id: opId, estado: { in: ["PROCESANDO", "ANULANDO"] }, actualizadoEn: { lt: new Date(Date.now() - HUERFANA_MS) } },
    data: { estado: "REQUIERE_ATENCION", error: "La ejecución se interrumpió. Reanudá para continuar." },
  });
}

const aOpEjec = (o: { id: number; tipo: OpEjec["tipo"]; fechaContable: Date; contactoId: number | null; contactoNombre: string | null; observacion: string | null; datos: unknown }): OpEjec => ({
  id: o.id,
  tipo: o.tipo,
  fechaContable: o.fechaContable.toISOString().slice(0, 10),
  contactoId: o.contactoId,
  contactoNombre: o.contactoNombre,
  observacion: o.observacion,
  datos: o.datos as Datos,
});

const evento = (operacionId: number, empleadoId: number, tipo: string, detalle?: string) =>
  prisma.tesoreriaEvento.create({ data: { operacionId, empleadoId, tipo, detalle } });

// ─── Confirmar ──────────────────────────────────────────────────────────────

export async function confirmar(opId: number, empleado: { id: number; nombre: string }, aceptarDuplicado: boolean): Promise<ResultadoMotor> {
  const op = await prisma.tesoreriaOperacion.findUnique({ where: { id: opId } });
  if (!op) return { ok: false, status: 404, error: "No encontrada" };
  if (op.estado !== "BORRADOR") return { ok: false, status: 409, error: "La operación ya fue confirmada." };

  const cfg = await cargarConfig();
  const e = aOpEjec(op);
  const errorValidacion = validar(e, contextoValidacion(cfg));
  if (errorValidacion) return { ok: false, status: 400, error: errorValidacion };

  const total = totalOperacion(e.tipo, e.datos);
  if (!aceptarDuplicado) {
    const parecidas = await prisma.tesoreriaOperacion.findMany({
      where: { id: { not: op.id }, tipo: op.tipo, contactoId: op.contactoId, fechaContable: op.fechaContable, total, estado: { notIn: ["BORRADOR", "ANULADA"] } },
    });
    // Mismo importe con otro cheque (p. ej. dos cheques iguales al mismo proveedor) no es duplicado
    const cheques = chequesDe(e.datos);
    const dup = parecidas.find((p) => chequesDe(aOpEjec(p).datos) === cheques);
    if (dup) return { ok: false, status: 409, error: "Posible duplicado", duplicado: { id: dup.id } };
  }

  // Toma atómica: un solo request ejecuta (doble clic → el segundo no hace nada)
  const tomada = await prisma.tesoreriaOperacion.updateMany({ where: { id: op.id, estado: "BORRADOR" }, data: { estado: "PROCESANDO", total, error: null } });
  if (!tomada.count) return { ok: false, status: 409, error: "La operación ya se está procesando." };

  try {
    const motivo = await revalidar(e, cfg);
    if (motivo) {
      await prisma.tesoreriaOperacion.update({ where: { id: op.id }, data: { estado: "BORRADOR", error: motivo } });
      return { ok: false, status: 409, error: motivo };
    }
  } catch (err) {
    console.error("[tesoreria] revalidar falló", err instanceof OdooTesoreriaError ? err.tecnico : err);
    const msg = err instanceof OdooTesoreriaError && err.ambiguo ? "Odoo no está disponible. La operación sigue como borrador." : "No se pudo validar contra Odoo.";
    await prisma.tesoreriaOperacion.update({ where: { id: op.id }, data: { estado: "BORRADOR", error: msg } });
    return { ok: false, status: 503, error: msg };
  }

  if (aceptarDuplicado) await evento(op.id, empleado.id, "duplicado_aceptado");
  await prisma.tesoreriaOperacion.update({ where: { id: op.id }, data: { confirmadoPorId: empleado.id, confirmadoEn: new Date() } });
  await evento(op.id, empleado.id, "confirmada");

  const base = generarPasos(e, cfg);
  const adjuntos = await prisma.tesoreriaAdjunto.findMany({ where: { operacionId: op.id }, select: { id: true, diarioId: true, nombre: true }, orderBy: { id: "asc" } });
  const defs = [...base, ...pasosAdjuntos(base, adjuntos)];
  await prisma.tesoreriaPaso.deleteMany({ where: { operacionId: op.id } });
  await prisma.tesoreriaPaso.createMany({
    data: defs.map((d, orden) => ({ operacionId: op.id, fase: "EJECUCION", orden, tipo: d.tipo, payload: d as unknown as Prisma.InputJsonValue, referencia: `TES-${op.id}-${orden}` })),
  });
  return correr(op.id, "EJECUCION", empleado);
}

// ─── Reanudar ───────────────────────────────────────────────────────────────

export async function reanudar(opId: number, empleado: { id: number; nombre: string }): Promise<ResultadoMotor> {
  await rescatarHuerfana(opId);
  const op = await prisma.tesoreriaOperacion.findUnique({ where: { id: opId }, include: { pasos: { select: { fase: true } } } });
  if (!op) return { ok: false, status: 404, error: "No encontrada" };
  if (op.estado !== "REQUIERE_ATENCION") return { ok: false, status: 409, error: "La operación no requiere atención." };
  const fase: Fase = op.pasos.some((p) => p.fase === "ANULACION") ? "ANULACION" : "EJECUCION";
  const tomada = await prisma.tesoreriaOperacion.updateMany({
    where: { id: opId, estado: "REQUIERE_ATENCION" },
    data: { estado: fase === "ANULACION" ? "ANULANDO" : "PROCESANDO", error: null },
  });
  if (!tomada.count) return { ok: false, status: 409, error: "La operación ya se está procesando." };
  await evento(opId, empleado.id, "reanudada", fase === "ANULACION" ? "anulación" : undefined);
  return correr(opId, fase, empleado);
}

// ─── Anular ─────────────────────────────────────────────────────────────────

export async function anular(opId: number, empleado: { id: number; nombre: string }): Promise<ResultadoMotor> {
  const op = await prisma.tesoreriaOperacion.findUnique({ where: { id: opId }, include: { pasos: { where: { fase: "EJECUCION" }, orderBy: { orden: "asc" } } } });
  if (!op) return { ok: false, status: 404, error: "No encontrada" };
  if (op.estado !== "COMPLETADA" && op.estado !== "PENDIENTE_DEBITO") return { ok: false, status: 409, error: "Solo se anulan operaciones completadas." };

  const ok = op.pasos.filter((p) => p.estado === "OK").map((p) => ({ def: p.payload as unknown as PasoDef, odooModelo: p.odooModelo, odooId: p.odooId }));
  let bloqueo: string | null;
  try {
    bloqueo = await bloqueoAnulacion(ok);
  } catch {
    return { ok: false, status: 503, error: "Odoo no está disponible." };
  }
  if (bloqueo) return { ok: false, status: 409, error: bloqueo };

  const tomada = await prisma.tesoreriaOperacion.updateMany({ where: { id: opId, estado: op.estado }, data: { estado: "ANULANDO", error: null } });
  if (!tomada.count) return { ok: false, status: 409, error: "La operación cambió mientras tanto." };
  await evento(opId, empleado.id, "anulacion_iniciada");

  const defs = pasosAnulacion(ok);
  await prisma.tesoreriaPaso.deleteMany({ where: { operacionId: opId, fase: "ANULACION" } });
  await prisma.tesoreriaPaso.createMany({
    data: defs.map((d, orden) => ({ operacionId: opId, fase: "ANULACION", orden, tipo: d.tipo, payload: d as unknown as Prisma.InputJsonValue, referencia: `TES-${opId}-A${orden}` })),
  });
  return correr(opId, "ANULACION", empleado);
}

// ─── Ejecución de pasos ─────────────────────────────────────────────────────

async function correr(opId: number, fase: Fase, empleado: { id: number; nombre: string }): Promise<ResultadoMotor> {
  const op = await prisma.tesoreriaOperacion.findUniqueOrThrow({ where: { id: opId }, include: { pasos: { orderBy: { orden: "asc" } } } });
  const ejec = op.pasos.filter((p) => p.fase === "EJECUCION");
  const pasos = op.pasos.filter((p) => p.fase === fase);
  const ctxBase = {
    nota: `Registrado por: ${empleado.nombre} · Op: TES-${opId}`,
    fecha: op.fechaContable.toISOString().slice(0, 10),
    resultados: new Map(ejec.filter((p) => p.estado === "OK").map((p) => [p.orden, { odooModelo: p.odooModelo, odooId: p.odooId }])),
  };

  for (const paso of pasos) {
    if (paso.estado === "OK") continue;
    await prisma.tesoreriaPaso.update({ where: { id: paso.id }, data: { estado: "EN_CURSO", intentos: { increment: 1 }, iniciadoEn: new Date(), error: null, errorTecnico: null } });
    await prisma.tesoreriaOperacion.update({ where: { id: opId }, data: { actualizadoEn: new Date() } });
    const ctx: CtxPaso = { ...ctxBase, ref: paso.referencia };
    try {
      const r = await ejecutarPaso(paso.payload as unknown as PasoDef, ctx);
      await prisma.tesoreriaPaso.update({ where: { id: paso.id }, data: { estado: "OK", odooModelo: r.odooModelo, odooId: r.odooId, finalizadoEn: new Date() } });
      if (fase === "EJECUCION") ctxBase.resultados.set(paso.orden, r);
    } catch (err) {
      const e = err instanceof OdooTesoreriaError ? err : new OdooTesoreriaError("Error inesperado.", true, String(err));
      const nadaHecho = fase === "EJECUCION" && !e.ambiguo && paso.id === pasos[0].id && !pasos.some((p) => p.estado === "OK");
      const mensaje = mensajeUsuario(e, paso.orden, fase);
      await prisma.tesoreriaPaso.update({ where: { id: paso.id }, data: { estado: "ERROR", error: mensaje, errorTecnico: e.tecnico, finalizadoEn: new Date() } });
      if (nadaHecho) {
        // Falló el primer paso y Odoo no creó nada: vuelve a borrador
        await prisma.tesoreriaPaso.deleteMany({ where: { operacionId: opId } });
        await prisma.tesoreriaOperacion.update({ where: { id: opId }, data: { estado: "BORRADOR", error: mensaje, confirmadoPorId: null, confirmadoEn: null } });
        await evento(opId, empleado.id, "volvio_a_borrador", mensaje);
      } else {
        await evento(opId, empleado.id, "requiere_atencion", mensaje);
        await prisma.tesoreriaOperacion.update({ where: { id: opId }, data: { estado: "REQUIERE_ATENCION", error: mensaje } });
      }
      return { ok: false, status: 502, error: mensaje };
    }
  }

  if (fase === "ANULACION") {
    await prisma.tesoreriaOperacion.update({ where: { id: opId }, data: { estado: "ANULADA", anuladoPorId: empleado.id, anuladoEn: new Date() } });
    await evento(opId, empleado.id, "anulada");
  } else {
    const conPropio = ejec.some((p) => (p.payload as unknown as PasoDef).tipo === "pago" && (p.payload as { metodo?: string }).metodo === "own_checks");
    await prisma.tesoreriaOperacion.update({ where: { id: opId }, data: { estado: conPropio ? "PENDIENTE_DEBITO" : "COMPLETADA" } });
    await evento(opId, empleado.id, "completada");
  }
  return { ok: true };
}

function mensajeUsuario(e: OdooTesoreriaError, orden: number, fase: Fase): string {
  const que = fase === "ANULACION" ? "al anular" : `en el paso ${orden + 1}`;
  if (e.ambiguo) return `Odoo no respondió ${que}. Reanudá para continuar: no se duplica lo ya hecho.`;
  return `Odoo rechazó la operación ${que}: ${e.message}`;
}
