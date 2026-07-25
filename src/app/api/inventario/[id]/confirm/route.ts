import { NextRequest, NextResponse } from "next/server";
import { getRequestPayload, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { odoo } from "@/lib/odoo";
import { buildConfirmationSummary } from "@/lib/inventoryConfirmationSummary";
import type { InventoryArticle } from "@/types";

// Run async tasks in batches to avoid hammering Odoo's rate limiter
async function runInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  batchSize = 10,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
  }
}

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const payload = await getRequestPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = requireRole(payload, ["ADMIN", "MANAGER"]);
  if (denied) return denied;

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
    zeroUncounted?: boolean;
  };

  const excludedSet = new Set<number>(body.excludedCategoryIds ?? []);
  const spawnNewDraft = body.spawnNewDraft ?? false;
  const zeroUncounted = body.zeroUncounted ?? true;

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
    if (includedArticles.length > 0) {
      // 1. Batch-fetch all quants for included articles in a single call
      const includedVarianteIds = includedArticles.map((a) => a.varianteId);
      const existingQuants = await odoo.searchRead(
        "stock.quant",
        [
          ["product_id", "in", includedVarianteIds],
          ["location_id", "=", locationId],
        ],
        ["id", "product_id"],
      ) as { id: number; product_id: [number, string] | number }[];

      const quantByProductId = new Map<number, number>();
      for (const q of existingQuants) {
        const pid = Array.isArray(q.product_id) ? q.product_id[0] : q.product_id;
        quantByProductId.set(pid, q.id);
      }

      // 2. Separate articles into update vs create
      const toUpdate: Array<{ quantId: number; qty: number }> = [];
      const toCreate: Array<{ varianteId: number; qty: number }> = [];
      for (const article of includedArticles) {
        if (quantByProductId.has(article.varianteId)) {
          toUpdate.push({ quantId: quantByProductId.get(article.varianteId)!, qty: article.qty });
        } else {
          toCreate.push({ varianteId: article.varianteId, qty: article.qty });
        }
      }

      // 3. Write existing quants in batches (10 at a time) to avoid 429, then apply in one call
      if (toUpdate.length > 0) {
        await runInBatches(toUpdate, ({ quantId, qty }) =>
          odoo.write("stock.quant", [quantId], {
            inventory_quantity: qty,
            inventory_quantity_set: true,
          }),
        );
        await odoo.call("stock.quant", "action_apply_inventory", {
          ids: toUpdate.map((u) => u.quantId),
        });
      }

      // 4. Create missing quants in batches (10 at a time) to avoid 429, then apply in one call
      if (toCreate.length > 0) {
        const createdIds: number[] = [];
        await runInBatches(toCreate, async ({ varianteId, qty }) => {
          const id = await odoo.create("stock.quant", {
            product_id: varianteId,
            location_id: locationId,
            inventory_quantity: qty,
            inventory_quantity_set: true,
          });
          createdIds.push(id);
        });
        await odoo.call("stock.quant", "action_apply_inventory", { ids: createdIds });
      }
    }

    // ── Zero out uncounted products in included categories ────────────────────
    if (zeroUncounted && includedCategoryIds.length > 0) {
      const allIncludedProducts = await odoo.searchRead(
        "product.product",
        [["categ_id", "in", includedCategoryIds]],
        ["id"],
      ) as { id: number }[];

      const notLoadedIds = allIncludedProducts
        .filter((p) => !loadedProductIds.has(p.id))
        .map((p) => p.id);

      if (notLoadedIds.length > 0) {
        // Single batch fetch for all uncounted quants
        const uncountedQuants = await odoo.searchRead(
          "stock.quant",
          [
            ["product_id", "in", notLoadedIds],
            ["location_id", "=", locationId],
          ],
          ["id"],
        ) as { id: number }[];

        if (uncountedQuants.length > 0) {
          const uncountedQuantIds = uncountedQuants.map((q) => q.id);
          // Single write + single apply for all uncounted quants
          await odoo.write("stock.quant", uncountedQuantIds, {
            inventory_quantity: 0,
            inventory_quantity_set: true,
          });
          await odoo.call("stock.quant", "action_apply_inventory", { ids: uncountedQuantIds });
        }
      }
    }

    // ── Mark confirmed + persist snapshot ────────────────────────────────────
    await prisma.inventory.update({
      where: { id: parseInt(id) },
      data: { status: "CONFIRMADO", errorDetail: null, confirmationSummary: JSON.parse(JSON.stringify(confirmationSummary)), confirmedById: payload.employeeId },
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
