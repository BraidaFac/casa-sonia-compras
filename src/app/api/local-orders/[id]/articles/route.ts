import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { updateArticleInOdoo } from "@/lib/odooArticleUpdate";
import { stripImagesForDB } from "@/lib/localOrders";
import type { Article } from "@/types";

export const PATCH = withAuth(
  async (req: NextRequest, _payload, ctx) => {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = (await req.json()) as {
      articleIndex: number;
      article: Article;
      colorAttributeId: number;
      sizeAttributeId: number;
    };
    const { articleIndex, article, colorAttributeId, sizeAttributeId } = body;

    if (
      !Number.isInteger(colorAttributeId) ||
      colorAttributeId <= 0 ||
      !Number.isInteger(sizeAttributeId) ||
      sizeAttributeId <= 0
    ) {
      return NextResponse.json(
        { error: "IDs de atributo inválidos" },
        { status: 400 },
      );
    }

    if (!article.existingProductId) {
      return NextResponse.json(
        { error: "El artículo no tiene producto Odoo vinculado" },
        { status: 400 },
      );
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json(
        { error: "Orden no encontrada" },
        { status: 404 },
      );
    }
    if (order.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "La orden no está confirmada" },
        { status: 400 },
      );
    }

    const articles = order.articles as unknown as Article[];
    if (articleIndex < 0 || articleIndex >= articles.length) {
      return NextResponse.json(
        { error: "Índice de artículo inválido" },
        { status: 400 },
      );
    }

    try {
      await updateArticleInOdoo(article, colorAttributeId, sizeAttributeId);
    } catch (err) {
      console.error("Error actualizando artículo en Odoo:", err);
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Error al sincronizar con Odoo",
        },
        { status: 500 },
      );
    }

    const stripped = stripImagesForDB([article]);
    const updatedArticles = [...articles];
    updatedArticles[articleIndex] = stripped[0] as unknown as Article;

    await prisma.order.update({
      where: { id: orderId },
      data: { articles: JSON.parse(JSON.stringify(updatedArticles)) },
    });

    return NextResponse.json({ article });
  },
  { roles: ["ADMIN", "MANAGER", "EMPLEADO"] },
);
