import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { odoo } from "@/lib/odoo";
import { restorePreviewUrls, stripImagesForDB } from "@/lib/localOrders";
import { validateForConfirm } from "@/lib/orderValidation";
import { createOrderInOdoo } from "@/lib/odooOrderCreation";
import { deleteTempFolder } from "@/lib/imageStorage";
import { syncProductImages } from "@/lib/odooProducts";
import { readFile } from "fs/promises";
import { join } from "path";
import type { LocalArticle, Article } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }
  if (order.status === "CONFIRMED") {
    return NextResponse.json({ error: "Orden ya confirmada" }, { status: 409 });
  }

  // Restore articles with preview URLs
  const localArticles = order.articles as unknown as LocalArticle[];
  const articles = restorePreviewUrls(localArticles) as Article[];

  // Load base64 for temp images from filesystem
  for (const article of articles) {
    for (const images of Object.values(article.colorImages)) {
      for (const img of images) {
        const localImg = localArticles
          .flatMap((a) => Object.values(a.colorImages).flat())
          .find((li) => li.id === img.id);
        if (localImg?.tempPath && !img.isFromOdoo) {
          try {
            const absPath = join(process.cwd(), "public", localImg.tempPath);
            const buf = await readFile(absPath);
            img.base64 = buf.toString("base64");
            img.previewUrl = `data:${img.mimeType};base64,${img.base64}`;
          } catch {
            console.error(`Could not read temp image: ${localImg.tempPath}`);
          }
        }
      }
    }
  }

  // Strict validation
  const validation = validateForConfirm({
    ...order,
    compradoraIds: Array.isArray(order.compradoraIds)
      ? (order.compradoraIds as number[])
      : undefined,
    articles: localArticles,
  });
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Validación fallida", missing: validation.missing },
      { status: 422 },
    );
  }

  try {
    const warehouseIdList =
      Array.isArray(order.warehouseIds) &&
      (order.warehouseIds as number[]).length > 0
        ? (order.warehouseIds as number[])
        : [];
    const selectedWarehouses =
      warehouseIdList.length > 0
        ? await odoo.read("stock.warehouse", warehouseIdList, [
            "id",
            "name",
            "lot_stock_id",
          ])
        : [];

    const result = await createOrderInOdoo({
      supplierId: order.supplierId,
      date: order.date,
      articles,
      warehouseIds: warehouseIdList,
      printColumns: order.printColumns as never,
      printValues: order.printValues as never,
      selectedWarehouses,
      compradoraIds: (order.compradoraIds as number[]) ?? [],
    });

    // Sync images to Odoo (best-effort)
    for (const entry of result.imageSyncData) {
      const article = articles.find((a) => a.id === entry.articleId);
      if (!article) continue;
      try {
        await syncProductImages(
          entry.templateId,
          article,
          entry.resolvedColors,
          new Map(entry.variantMap),
        );
      } catch (imgErr) {
        console.error("Image sync error (non-fatal):", imgErr);
      }
    }

    // Cleanup temp files
    await deleteTempFolder(orderId);

    // Backfill existingProductId on articles that were newly created in Odoo.
    // Without this, the edit page can't fetch images from Odoo after confirmation.
    const templateIdByArticleId = new Map(
      result.imageSyncData.map((e) => [e.articleId, e.templateId]),
    );
    const updatedLocalArticles = stripImagesForDB(articles).map((a) => {
      const templateId = templateIdByArticleId.get(a.id);
      const withProductId =
        templateId && !a.existingProductId
          ? { ...a, existingProductId: templateId }
          : a;
      // Clear tempPath — temp files deleted by deleteTempFolder above.
      // Images are now in Odoo; edit page loads them via /api/products/[id]/images.
      return {
        ...withProductId,
        colorImages: Object.fromEntries(
          Object.entries(withProductId.colorImages).map(([color, imgs]) => [
            color,
            imgs.map((img) => ({ ...img, tempPath: undefined })),
          ]),
        ),
      };
    });

    // Update DB — CONFIRMED
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CONFIRMED",
        odooOrderId: result.purchaseOrderId,
        odooOrderName: result.purchaseOrderName,
        errorDetail: null,
        articles: updatedLocalArticles as unknown as object,
      },
    });

    return NextResponse.json({
      ok: true,
      odooOrderId: result.purchaseOrderId,
      odooOrderName: result.purchaseOrderName,
      id: updated.id,
      status: updated.status,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    await prisma.order.update({
      where: { id: orderId },
      data: { status: "ERROR", errorDetail: detail },
    });

    return NextResponse.json(
      { error: `Se revirtió la operación. Motivo: ${detail}`, status: "ERROR" },
      { status: 500 },
    );
  }
}
