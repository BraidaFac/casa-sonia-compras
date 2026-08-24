import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

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

export const GET = withAuth(async () => {
  const promociones = await prisma.promocionBancaria.findMany({
    orderBy: [{ orden: "asc" }, { creadoEn: "desc" }],
    select: SELECT,
  });
  return NextResponse.json(promociones);
}, { roles: ["ADMIN", "MANAGER"] });

export const POST = withAuth(async (req: NextRequest, payload) => {
  const {
    titulo, bancoIds, marcaTarjeta, tipoBeneficio,
    cantidadCuotas, coeficienteInteres, valorPorcentaje, topeReintegro,
    descripcion, diasAplicables, vigenciaDesde, vigenciaHasta, activa, orden,
  } = await req.json();

  if (!titulo?.trim() || !bancoIds?.length || !tipoBeneficio || !vigenciaDesde) {
    return NextResponse.json(
      { error: "Faltan campos requeridos: titulo, bancoIds, tipoBeneficio, vigenciaDesde" },
      { status: 400 },
    );
  }
  if (!TIPOS_BENEFICIO.includes(tipoBeneficio)) {
    return NextResponse.json(
      { error: `tipoBeneficio debe ser uno de: ${TIPOS_BENEFICIO.join(", ")}` },
      { status: 400 },
    );
  }
  if (["cuotas_sin_interes", "cuotas_con_interes"].includes(tipoBeneficio) && !cantidadCuotas) {
    return NextResponse.json({ error: "cantidadCuotas es requerido para tipos de cuotas" }, { status: 400 });
  }
  if (tipoBeneficio === "cuotas_con_interes" && !coeficienteInteres) {
    return NextResponse.json({ error: "coeficienteInteres es requerido para cuotas_con_interes" }, { status: 400 });
  }
  if (["reintegro", "descuento_directo"].includes(tipoBeneficio) && valorPorcentaje === undefined) {
    return NextResponse.json({ error: "valorPorcentaje es requerido para reintegro y descuento_directo" }, { status: 400 });
  }
  if (vigenciaHasta && new Date(vigenciaDesde) > new Date(vigenciaHasta)) {
    return NextResponse.json({ error: "vigenciaDesde debe ser anterior a vigenciaHasta" }, { status: 400 });
  }

  const ids: number[] = (bancoIds as (string | number)[]).map((id) => parseInt(String(id), 10));

  const promo = await prisma.promocionBancaria.create({
    data: {
      titulo: titulo.trim(),
      bancos: { connect: ids.map((id) => ({ id })) },
      marcaTarjeta: marcaTarjeta?.trim() || null,
      tipoBeneficio,
      cantidadCuotas: cantidadCuotas ? parseInt(cantidadCuotas, 10) : null,
      coeficienteInteres: coeficienteInteres ?? null,
      valorPorcentaje: valorPorcentaje ?? null,
      topeReintegro: topeReintegro ?? null,
      descripcion: descripcion?.trim() || null,
      diasAplicables: diasAplicables ? JSON.stringify(diasAplicables) : null,
      vigenciaDesde: new Date(vigenciaDesde),
      vigenciaHasta: vigenciaHasta ? new Date(vigenciaHasta) : null,
      activa: activa !== false,
      orden: orden ?? null,
      creadoPorId: payload.employeeId,
    },
    select: SELECT,
  });
  return NextResponse.json(promo, { status: 201 });
}, { roles: ["ADMIN", "MANAGER"] });
