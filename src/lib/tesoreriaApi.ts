// Helpers compartidos por las rutas /api/tesoreria/**
import { NextResponse } from "next/server";
import type { Role } from "@/lib/auth";
import { TIPOS, type Datos, type Tipo } from "@/lib/tesoreria";
import type { ResultadoMotor } from "@/lib/tesoreriaMotor";

export const ROLES_TESORERIA: Role[] = ["ADMIN", "TESORERO"];

export const idDe = async (ctx: object) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const n = parseInt(id, 10);
  return Number.isNaN(n) ? null : n;
};

export const respuestaMotor = (r: ResultadoMotor) =>
  r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error, duplicado: r.duplicado }, { status: r.status });

export type BorradorBody = {
  tipo: Tipo;
  fechaContable: string;
  contactoId: number | null;
  contactoNombre: string | null;
  observacion: string | null;
  datos: Datos;
};

/** Valida la forma del cuerpo de un borrador (el contenido se valida al confirmar). */
export function leerBorrador(b: unknown): BorradorBody | NextResponse {
  const x = b as Partial<BorradorBody>;
  if (!x || !TIPOS.includes(x.tipo as Tipo)) return NextResponse.json({ error: "Tipo de operación inválido" }, { status: 400 });
  if (typeof x.fechaContable !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.fechaContable)) return NextResponse.json({ error: "Fecha contable inválida" }, { status: 400 });
  if (typeof x.datos !== "object" || x.datos === null) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  return {
    tipo: x.tipo as Tipo,
    fechaContable: x.fechaContable,
    contactoId: typeof x.contactoId === "number" ? x.contactoId : null,
    contactoNombre: typeof x.contactoNombre === "string" ? x.contactoNombre : null,
    observacion: typeof x.observacion === "string" ? x.observacion.slice(0, 500) : null,
    datos: x.datos as Datos,
  };
}
