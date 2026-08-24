import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const SELECT = {
  id: true,
  nombre: true,
  medioPagoId: true,
  medioPago: { select: { id: true, nombre: true } },
  tipo: true,
  valor: true,
  alcance: true,
  categoriaOdooId: true,
  activo: true,
  vigenciaDesde: true,
  vigenciaHasta: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

export const PATCH = withAuth(async (req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const descId = parseInt(id, 10);
  if (isNaN(descId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const existing = await prisma.descuentoEspecial.findUnique({ where: { id: descId } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const { nombre, medioPagoId, tipo, valor, alcance, categoriaOdooId, activo, vigenciaDesde, vigenciaHasta } = body;

  if (tipo !== undefined && !["porcentaje", "monto_fijo"].includes(tipo)) {
    return NextResponse.json({ error: "tipo debe ser 'porcentaje' o 'monto_fijo'" }, { status: 400 });
  }
  const alcanceVal = alcance ?? existing.alcance;
  if (alcance !== undefined && !["global", "categoria"].includes(alcance)) {
    return NextResponse.json({ error: "alcance debe ser 'global' o 'categoria'" }, { status: 400 });
  }

  const resolvedVigDesde = vigenciaDesde !== undefined ? (vigenciaDesde ? new Date(vigenciaDesde) : null) : existing.vigenciaDesde;
  const resolvedVigHasta = vigenciaHasta !== undefined ? (vigenciaHasta ? new Date(vigenciaHasta) : null) : existing.vigenciaHasta;
  if (resolvedVigDesde && resolvedVigHasta && resolvedVigDesde > resolvedVigHasta) {
    return NextResponse.json({ error: "vigenciaDesde debe ser anterior a vigenciaHasta" }, { status: 400 });
  }

  // Verificar unicidad si se activa o cambia medio/alcance/categoría
  const willBeActive = activo !== undefined ? activo : existing.activo;
  if (willBeActive) {
    const resolvedMedioId = medioPagoId !== undefined ? parseInt(medioPagoId, 10) : existing.medioPagoId;
    const resolvedCatId = alcanceVal === "global" ? null : (categoriaOdooId !== undefined ? parseInt(categoriaOdooId, 10) : existing.categoriaOdooId);
    const conflict = await prisma.descuentoEspecial.findFirst({
      where: {
        id: { not: descId },
        medioPagoId: resolvedMedioId,
        alcance: alcanceVal,
        categoriaOdooId: resolvedCatId,
        activo: true,
      },
    });
    if (conflict) {
      return NextResponse.json(
        { error: "Ya existe un descuento activo para ese medio de pago y destino" },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.descuentoEspecial.update({
    where: { id: descId },
    data: {
      ...(nombre !== undefined && { nombre: nombre?.trim() || null }),
      ...(medioPagoId !== undefined && { medioPagoId: parseInt(medioPagoId, 10) }),
      ...(tipo !== undefined && { tipo }),
      ...(valor !== undefined && { valor }),
      ...(alcance !== undefined && { alcance }),
      ...(categoriaOdooId !== undefined && { categoriaOdooId: alcanceVal === "global" ? null : parseInt(categoriaOdooId, 10) }),
      ...(activo !== undefined && { activo }),
      ...(vigenciaDesde !== undefined && { vigenciaDesde: vigenciaDesde ? new Date(vigenciaDesde) : null }),
      ...(vigenciaHasta !== undefined && { vigenciaHasta: vigenciaHasta ? new Date(vigenciaHasta) : null }),
    },
    select: SELECT,
  });
  return NextResponse.json(updated);
}, { roles: ["ADMIN", "MANAGER"] });

export const DELETE = withAuth(async (_req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const descId = parseInt(id, 10);
  if (isNaN(descId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const existing = await prisma.descuentoEspecial.findUnique({ where: { id: descId } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await prisma.descuentoEspecial.delete({ where: { id: descId } });
  return new NextResponse(null, { status: 204 });
}, { roles: ["ADMIN", "MANAGER"] });
