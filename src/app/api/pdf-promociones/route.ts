// src/app/api/pdf-promociones/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { getTodayBuenosAires, isPromoVigenteHoy, PROMO_SELECT } from "@/lib/vigentesHelpers";
import { generatePromosPDF } from "@/lib/pdfPromociones";

export const GET = withAuth(async () => {
  try {
    const { todayStr, dayName } = getTodayBuenosAires();

    const todasPromos = await prisma.promocionBancaria.findMany({
      select: PROMO_SELECT,
      orderBy: [{ orden: "asc" }, { vigenciaDesde: "asc" }],
    });

    const promosHoy = todasPromos.filter((p) => isPromoVigenteHoy(p, todayStr, dayName));

    if (promosHoy.length === 0) {
      return NextResponse.json({ error: "sin_promos" }, { status: 400 });
    }

    // Serializar Decimal → string/number y Date → ISO string (igual que vigentes/route.ts)
    const promos = promosHoy.map((p) => ({
      ...p,
      vigenciaDesde:       p.vigenciaDesde.toISOString(),
      vigenciaHasta:       p.vigenciaHasta?.toISOString() ?? null,
      coeficienteInteres:  p.coeficienteInteres?.toString() ?? null,
      valorPorcentaje:     p.valorPorcentaje?.toString()    ?? null,
      topeReintegro:       p.topeReintegro?.toString()      ?? null,
    }));

    const pdfBytes = await generatePromosPDF(promos, todayStr);

    // Filename: promos-bancarias-DD-MM-YYYY.pdf
    const [yyyy, mm, dd] = todayStr.split("-");
    const filename = `promos-bancarias-${dd}-${mm}-${yyyy}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[pdf-promociones] Error al generar PDF:", new Date().toISOString(), err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
});
