import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { cargarConfig } from "@/lib/tesoreriaConfig";
import { cuentasOdoo, cuentasSugeridas, diariosGenerales, diariosOdoo, OdooTesoreriaError } from "@/lib/odooTesoreria";
import { hoyAR, sumarDias } from "@/lib/tesoreria";

// GET: configuración vigente. Con ?odoo=1 (solo ADMIN) suma los catálogos de Odoo para editarla.
export const GET = withAuth(async (req: NextRequest, payload) => {
  const config = await cargarConfig();
  if (req.nextUrl.searchParams.get("odoo") !== "1" || payload.role !== "ADMIN") return NextResponse.json({ config });

  try {
    const [diarios, cuentas, generales] = await Promise.all([diariosOdoo(), cuentasOdoo(), diariosGenerales()]);
    const sinCuentas = !config.cuentas.GASTO.length && !config.cuentas.INGRESO.length && !config.cuentas.SOCIO.length;
    const habilitados = config.diarios.length ? config.diarios.map((d) => d.odooJournalId) : diarios.map((d) => d.id);
    const sugeridas = sinCuentas ? await cuentasSugeridas(habilitados, sumarDias(hoyAR(), -365)) : null;
    const porCodigo = (codigo: string) => cuentas.find((c) => c.codigo === codigo)?.id ?? null;
    const porNombre = (re: RegExp) => [...diarios, ...generales].find((d) => re.test(d.nombre))?.id ?? null;
    return NextResponse.json({
      config,
      odoo: { diarios, cuentas, generales },
      sugeridas,
      defaults: {
        cuentaPuenteId: porCodigo("6.1"),
        diarioAjustesId: porNombre(/operaciones miscel/i),
        diarioComprasId: generales.find((g) => g.tipo === "purchase" && /compras a|^purchases$/i.test(g.nombre))?.id ?? null,
        diarioComprasSinDocId: generales.find((g) => g.tipo === "purchase" && /compras b/i.test(g.nombre))?.id ?? null,
        diarioEfectivoDefaultId: porNombre(/efectivo administraci/i),
      },
    });
  } catch (e) {
    if (e instanceof OdooTesoreriaError) return NextResponse.json({ config, error: "Odoo no está disponible" }, { status: 503 });
    throw e;
  }
}, { roles: ["ADMIN", "TESORERO"] });

type Body = {
  diarios: number[]; // ids de Odoo en orden
  cuentas: { GASTO: number[]; INGRESO: number[]; SOCIO: number[] };
  fijos: Record<string, number | null>;
};

const FIJOS = ["cuentaGananciaId", "cuentaPerdidaId", "cuentaPuenteId", "diarioAjustesId", "diarioComprasId", "diarioComprasSinDocId", "diarioEfectivoDefaultId"] as const;

export const PUT = withAuth(async (req: NextRequest, payload) => {
  const body = (await req.json()) as Body;
  if (!Array.isArray(body?.diarios) || !body.cuentas || !body.fijos) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  let diarios, cuentas;
  try {
    [diarios, cuentas] = await Promise.all([diariosOdoo(), cuentasOdoo()]);
  } catch (e) {
    if (e instanceof OdooTesoreriaError) return NextResponse.json({ error: "Odoo no está disponible" }, { status: 503 });
    throw e;
  }
  const diarioDe = new Map(diarios.map((d) => [d.id, d]));
  const cuentaDe = new Map(cuentas.map((c) => [c.id, c]));
  if (body.diarios.some((id) => !diarioDe.has(id))) return NextResponse.json({ error: "Hay un diario que no existe en Odoo o no es en pesos" }, { status: 400 });
  const usos = ["GASTO", "INGRESO", "SOCIO"] as const;
  if (usos.some((u) => !Array.isArray(body.cuentas[u]) || body.cuentas[u].some((id) => !cuentaDe.has(id)))) {
    return NextResponse.json({ error: "Hay una cuenta que no existe en Odoo" }, { status: 400 });
  }
  const fijos = Object.fromEntries(FIJOS.map((k) => [k, typeof body.fijos[k] === "number" ? body.fijos[k] : null]));
  const creadoPorId = payload.employeeId;

  await prisma.$transaction([
    prisma.tesoreriaDiario.updateMany({ data: { activo: false } }),
    ...body.diarios.map((id, orden) => {
      const d = diarioDe.get(id)!;
      return prisma.tesoreriaDiario.upsert({
        where: { odooJournalId: id },
        create: { odooJournalId: id, nombre: d.nombre, tipo: d.tipo, orden, activo: true, creadoPorId },
        update: { nombre: d.nombre, tipo: d.tipo, orden, activo: true },
      });
    }),
    prisma.tesoreriaCuenta.deleteMany({}),
    prisma.tesoreriaCuenta.createMany({
      data: usos.flatMap((uso) =>
        [...new Set(body.cuentas[uso])].map((id) => {
          const c = cuentaDe.get(id)!;
          return { odooAccountId: id, codigo: c.codigo, nombre: c.nombre, uso, creadoPorId };
        }),
      ),
    }),
    prisma.tesoreriaConfig.upsert({ where: { id: 1 }, create: { id: 1, ...fijos, creadoPorId }, update: fijos }),
  ]);
  return NextResponse.json({ config: await cargarConfig() });
}, { roles: ["ADMIN"] });
