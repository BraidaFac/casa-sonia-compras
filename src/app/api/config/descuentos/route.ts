import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

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

export const GET = withAuth(async () => {
  const descuentos = await prisma.descuentoEspecial.findMany({
    orderBy: [{ medioPagoId: "asc" }, { alcance: "asc" }, { creadoEn: "desc" }],
    select: SELECT,
  });
  return NextResponse.json(descuentos);
}, { roles: ["ADMIN", "MANAGER"] });

export const POST = withAuth(async (req: NextRequest, payload) => {
  const { nombre, medioPagoId, tipo, valor, alcance, categoriaOdooId, activo, vigenciaDesde, vigenciaHasta } =
    await req.json();

  if (!medioPagoId || !tipo || valor === undefined || valor === null) {
    return NextResponse.json({ error: "Faltan campos requeridos: medioPagoId, tipo, valor" }, { status: 400 });
  }
  if (!["porcentaje", "monto_fijo"].includes(tipo)) {
    return NextResponse.json({ error: "tipo debe ser 'porcentaje' o 'monto_fijo'" }, { status: 400 });
  }
  const alcanceVal = alcance ?? "global";
  if (!["global", "categoria"].includes(alcanceVal)) {
    return NextResponse.json({ error: "alcance debe ser 'global' o 'categoria'" }, { status: 400 });
  }
  if (alcanceVal === "categoria" && !categoriaOdooId) {
    return NextResponse.json({ error: "categoriaOdooId es requerido cuando alcance es 'categoria'" }, { status: 400 });
  }
  if (vigenciaDesde && vigenciaHasta && new Date(vigenciaDesde) > new Date(vigenciaHasta)) {
    return NextResponse.json({ error: "vigenciaDesde debe ser anterior a vigenciaHasta" }, { status: 400 });
  }

  // Unicidad: un solo descuento ACTIVO por (medioPagoId + alcance + categoriaOdooId)
  if (activo !== false) {
    const destino = alcanceVal === "global" ? null : (categoriaOdooId ?? null);
    const conflict = await prisma.descuentoEspecial.findFirst({
      where: {
        medioPagoId: parseInt(medioPagoId, 10),
        alcance: alcanceVal,
        categoriaOdooId: destino,
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

  const descuento = await prisma.descuentoEspecial.create({
    data: {
      nombre: nombre?.trim() || null,
      medioPagoId: parseInt(medioPagoId, 10),
      tipo,
      valor,
      alcance: alcanceVal,
      categoriaOdooId: alcanceVal === "categoria" ? parseInt(categoriaOdooId, 10) : null,
      activo: activo !== false,
      vigenciaDesde: vigenciaDesde ? new Date(vigenciaDesde) : null,
      vigenciaHasta: vigenciaHasta ? new Date(vigenciaHasta) : null,
      creadoPorId: payload.employeeId,
    },
    select: SELECT,
  });
  return NextResponse.json(descuento, { status: 201 });
}, { roles: ["ADMIN", "MANAGER"] });
