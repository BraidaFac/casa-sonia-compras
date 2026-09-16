// src/app/api/pdf-promociones/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { odoo } from "@/lib/odoo";
import { getTodayBuenosAires, PROMO_SELECT } from "@/lib/vigentesHelpers";
import { generatePromosHTML } from "@/lib/htmlPromociones";
import type { PdfItemInput } from "@/lib/htmlPromociones";

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json() as { items: { kind: "promo" | "descuento"; id: number }[] };
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "sin_items" }, { status: 400 });
    }

    const { todayStr } = getTodayBuenosAires();

    const promoIds     = items.filter((i) => i.kind === "promo").map((i) => i.id);
    const descuentoIds = items.filter((i) => i.kind === "descuento").map((i) => i.id);

    const [promasRaw, descuentosRaw] = await Promise.all([
      promoIds.length > 0
        ? prisma.promocionBancaria.findMany({ where: { id: { in: promoIds } }, select: PROMO_SELECT })
        : [],
      descuentoIds.length > 0
        ? prisma.descuentoEspecial.findMany({
            where: { id: { in: descuentoIds } },
            select: {
              id: true,
              nombre: true,
              medioPagoId: true,
              medioPago: { select: { id: true, nombre: true } },
              tipo: true,
              valor: true,
              alcance: true,
              categoriaOdooId: true,
              vigenciaDesde: true,
              vigenciaHasta: true,
            },
          })
        : [],
    ]);

    const promoMap     = new Map(promasRaw.map((p) => [p.id, p]));
    const descuentoMap = new Map(descuentosRaw.map((d) => [d.id, d]));

    const orderedItems: PdfItemInput[] = [];
    for (const { kind, id } of items) {
      if (kind === "promo") {
        const p = promoMap.get(id);
        if (!p) continue;
        orderedItems.push({
          kind: "promo",
          id: p.id,
          titulo: p.titulo,
          bancos: p.bancos,
          marcaTarjeta: p.marcaTarjeta ?? null,
          tipoBeneficio: p.tipoBeneficio,
          cantidadCuotas: p.cantidadCuotas ?? null,
          coeficienteInteres: p.coeficienteInteres?.toString() ?? null,
          valorPorcentaje: p.valorPorcentaje?.toString() ?? null,
          topeReintegro: p.topeReintegro?.toString() ?? null,
          descripcion: p.descripcion ?? null,
          diasAplicables: p.diasAplicables ?? null,
        });
      } else {
        const d = descuentoMap.get(id);
        if (!d) continue;
        orderedItems.push({
          kind: "descuento",
          id: d.id,
          nombre: d.nombre ?? null,
          medioPago: d.medioPago,
          tipo: d.tipo,
          valor: d.valor.toString(),
          alcance: d.alcance,
          categoriaOdooId: d.categoriaOdooId ?? null,
          categoriaNombre: null, // se resuelve abajo
        });
      }
    }

    // Resolve category names for categoria descuentos
    const catIds = [...new Set(
      orderedItems.filter((i) => i.kind === "descuento" && (i as { categoriaOdooId: number | null }).categoriaOdooId)
        .map((i) => (i as { categoriaOdooId: number }).categoriaOdooId)
    )];
    const catNombres = new Map<number, string>();
    if (catIds.length > 0) {
      const cats = await odoo.read<{ id: number; complete_name: string }>("product.category", catIds, ["id", "complete_name"]);
      for (const c of cats) catNombres.set(c.id, c.complete_name);
    }
    for (const item of orderedItems) {
      if (item.kind === "descuento") {
        const d = item as { categoriaOdooId: number | null; categoriaNombre: string | null };
        if (d.categoriaOdooId) d.categoriaNombre = catNombres.get(d.categoriaOdooId) ?? null;
      }
    }

    if (orderedItems.length === 0) {
      return NextResponse.json({ error: "sin_items" }, { status: 400 });
    }

    const html = generatePromosHTML(orderedItems, todayStr);

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[pdf-promociones/preview] Error:", new Date().toISOString(), err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
});
