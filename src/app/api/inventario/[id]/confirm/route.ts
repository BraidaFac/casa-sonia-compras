import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { odoo } from "@/lib/odoo";
import { buildConfirmationSummary } from "@/lib/inventoryConfirmationSummary";
import type { InventoryArticle } from "@/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const inv = await prisma.inventory.findUnique({ where: { id: parseInt(id) } });

  if (!inv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (inv.status !== "BORRADOR") {
    return NextResponse.json(
      { error: "Solo se puede confirmar un inventario en borrador" },
      { status: 400 },
    );
  }

  const articles = (inv.articles as unknown as InventoryArticle[]) ?? [];

  if (articles.length === 0) {
    return NextResponse.json(
      { error: "No se puede confirmar un inventario sin artículos" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    excludedCategoryIds?: number[];
    spawnNewDraft?: boolean;
  };

  const excludedSet = new Set<number>(body.excludedCategoryIds ?? []);
  const spawnNewDraft = body.spawnNewDraft ?? false;

  const includedArticles = articles.filter((a) => !excludedSet.has(a.categoryId));
  const excludedArticles = articles.filter((a) => excludedSet.has(a.categoryId));

  // Categories to process for uncounted-articles zeroing (only included ones)
  const includedCategoryIds = [...new Set(includedArticles.map((a) => a.categoryId))];

  try {
    // Get warehouse internal location
    const locations = await odoo.searchRead(
      "stock.location",
      [
        ["warehouse_id", "=", inv.warehouseId],
        ["usage", "=", "internal"],
        ["active", "=", true],
      ],
      ["id", "complete_name"],
    ) as { id: number; complete_name: string }[];

    if (locations.length === 0) {
      throw new Error(`No se encontró ubicación interna para el depósito ${inv.warehouseName}`);
    }

    const locationId = locations[0].id;
    const loadedProductIds = new Set(includedArticles.map((a) => a.varianteId));

    // ── Capture stock snapshot BEFORE applying any changes to Odoo ────────────
    const confirmationSummary = await buildConfirmationSummary(articles, inv.warehouseId);

    // ── Apply counted articles ────────────────────────────────────────────────
    for (const article of includedArticles) {
      const quants = await odoo.searchRead(
        "stock.quant",
        [
          ["product_id", "=", article.varianteId],
          ["location_id", "=", locationId],
        ],
        ["id"],
      ) as { id: number }[];

      const quantFields: Record<string, unknown> = {
        inventory_quantity: article.qty,
        inventory_quantity_set: true,
      };

      if (quants.length > 0) {
        await odoo.write("stock.quant", [quants[0].id], quantFields);
        await odoo.call("stock.quant", "action_apply_inventory", { ids: [quants[0].id] });
      } else {
        const quantId = await odoo.create("stock.quant", {
          product_id: article.varianteId,
          location_id: locationId,
          ...quantFields,
        });
        await odoo.call("stock.quant", "action_apply_inventory", { ids: [quantId] });
      }
    }

    // ── Zero out uncounted products in included categories ────────────────────
    if (includedCategoryIds.length > 0) {
      const allIncludedProducts = await odoo.searchRead(
        "product.product",
        [["categ_id", "in", includedCategoryIds]],
        ["id"],
      ) as { id: number }[];

      const notLoaded = allIncludedProducts.filter((p) => !loadedProductIds.has(p.id));

      for (const product of notLoaded) {
        const quants = await odoo.searchRead(
          "stock.quant",
          [
            ["product_id", "=", product.id],
            ["location_id", "=", locationId],
          ],
          ["id"],
        ) as { id: number }[];

        if (quants.length > 0) {
          const zeroFields: Record<string, unknown> = {
            inventory_quantity: 0,
            inventory_quantity_set: true,
          };
          await odoo.write("stock.quant", [quants[0].id], zeroFields);
          await odoo.call("stock.quant", "action_apply_inventory", { ids: [quants[0].id] });
        }
      }
    }

    // ── Mark confirmed + persist snapshot ────────────────────────────────────
    await prisma.inventory.update({
      where: { id: parseInt(id) },
      data: { status: "CONFIRMADO", errorDetail: null, confirmationSummary: JSON.parse(JSON.stringify(confirmationSummary)) },
    });

    // ── Optionally spawn new draft for excluded categories ────────────────────
    let newDraftId: number | null = null;
    if (spawnNewDraft && excludedArticles.length > 0) {
      const newDraft = await prisma.inventory.create({
        data: {
          warehouseId: inv.warehouseId,
          warehouseName: inv.warehouseName,
          countDate: inv.countDate,
          accountingDate: inv.accountingDate,
          articles: excludedArticles as unknown as object[],
        },
      });
      newDraftId = newDraft.id;
    }

    return NextResponse.json({ ok: true, newDraftId });
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    await prisma.inventory.update({
      where: { id: parseInt(id) },
      data: { errorDetail: detail },
    });
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
