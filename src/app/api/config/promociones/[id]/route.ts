import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const TIPOS_BENEFICIO = ["cuotas_sin_interes", "cuotas_con_interes", "reintegro", "descuento_directo"] as const;

const SELECT = {
  id: true,
  titulo: true,
  bancos: { select: { id: true, nombre: true, icono: true } },
  marcaTarjeta: true,
  tipoBeneficio: true,
  cantidadCuotas: true,
  coeficienteInteres: true,
  valorPorcentaje: true,
  topeReintegro: true,
  descripcion: true,
  diasAplicables: true,
  vigenciaDesde: true,
  vigenciaHasta: true,
  activa: true,
  orden: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

export const PATCH = withAuth(async (req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const promoId = parseInt(id, 10);
  if (isNaN(promoId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const existing = await prisma.promocionBancaria.findUnique({ where: { id: promoId } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const {
    titulo, bancoIds, marcaTarjeta, tipoBeneficio,
    cantidadCuotas, coeficienteInteres, valorPorcentaje, topeReintegro,
    descripcion, diasAplicables, vigenciaDesde, vigenciaHasta, activa, orden,
  } = body;

  if (tipoBeneficio !== undefined && !TIPOS_BENEFICIO.includes(tipoBeneficio)) {
    return NextResponse.json(
      { error: `tipoBeneficio debe ser uno de: ${TIPOS_BENEFICIO.join(", ")}` },
      { status: 400 },
    );
  }

  const resolvedVigDesde = vigenciaDesde !== undefined ? new Date(vigenciaDesde) : existing.vigenciaDesde;
  const resolvedVigHasta = vigenciaHasta !== undefined ? (vigenciaHasta ? new Date(vigenciaHasta) : null) : existing.vigenciaHasta;
  if (resolvedVigHasta && resolvedVigDesde > resolvedVigHasta) {
    return NextResponse.json({ error: "vigenciaDesde debe ser anterior a vigenciaHasta" }, { status: 400 });
  }

  const updated = await prisma.promocionBancaria.update({
    where: { id: promoId },
    data: {
      ...(titulo !== undefined && { titulo: titulo.trim() }),
      ...(bancoIds !== undefined && {
        bancos: {
          set: (bancoIds as (string | number)[]).map((bid) => ({ id: parseInt(String(bid), 10) })),
        },
      }),
      ...(marcaTarjeta !== undefined && { marcaTarjeta: marcaTarjeta?.trim() || null }),
      ...(tipoBeneficio !== undefined && { tipoBeneficio }),
      ...(cantidadCuotas !== undefined && { cantidadCuotas: cantidadCuotas ? parseInt(cantidadCuotas, 10) : null }),
      ...(coeficienteInteres !== undefined && { coeficienteInteres: coeficienteInteres ?? null }),
      ...(valorPorcentaje !== undefined && { valorPorcentaje: valorPorcentaje ?? null }),
      ...(topeReintegro !== undefined && { topeReintegro: topeReintegro ?? null }),
      ...(descripcion !== undefined && { descripcion: descripcion?.trim() || null }),
      ...(diasAplicables !== undefined && { diasAplicables: diasAplicables ? JSON.stringify(diasAplicables) : null }),
      ...(vigenciaDesde !== undefined && { vigenciaDesde: new Date(vigenciaDesde) }),
      ...(vigenciaHasta !== undefined && { vigenciaHasta: vigenciaHasta ? new Date(vigenciaHasta) : null }),
      ...(activa !== undefined && { activa }),
      ...(orden !== undefined && { orden: orden ?? null }),
    },
    select: SELECT,
  });
  return NextResponse.json(updated);
}, { roles: ["ADMIN", "MANAGER"] });

export const DELETE = withAuth(async (_req: NextRequest, _payload, ctx) => {
  const { id } = await (ctx as Ctx).params;
  const promoId = parseInt(id, 10);
  if (isNaN(promoId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const existing = await prisma.promocionBancaria.findUnique({ where: { id: promoId } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await prisma.promocionBancaria.delete({ where: { id: promoId } });
  return new NextResponse(null, { status: 204 });
}, { roles: ["ADMIN", "MANAGER"] });
