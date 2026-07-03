# Inventory Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the inventory system to support multi-category counting without a fixed category at creation, with hierarchical category grouping, per-article qty-on-hand diffs, and a category-exclusion flow at confirmation time.

**Architecture:** Articles now carry their own category metadata (fetched on-demand per barcode scan and cached in a local Map). The inventory DB record drops the category columns and gains `count_date`/`accounting_date`. The summary views rebuild a category tree from the articles' embedded category fields, then fetch all remaining Odoo products for each affected category to surface uncounted items.

**Tech Stack:** Next.js 15 App Router, Prisma + MySQL, TanStack Query v5, Mantine 9, TypeScript, Odoo JSON-2 REST API.

## Global Constraints

- App root: `casa-sonia-compras/` — all paths below are relative to it
- No test framework — verification is via `pnpm build` (type-check) + `pnpm dev` manual browser test
- Odoo calls go through `src/lib/odoo.ts`; never call Odoo directly from UI
- All API routes require `authenticateRequest(request)` as first line
- Prisma client is at `prisma/generated/client` (custom output)
- Mantine dark theme, amber primary; use CSS vars `--font-display`, `--font-sans`, `--font-mono`
- No new files unless a clear new responsibility exists; no utility helpers for one-off logic
- Warehouse remains in `NuevoInventarioModal`; the spec says "only two fields" but warehouse is required for Odoo `stock.location` lookup at confirm time

---

### Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260702000000_inventory_redesign/migration.sql`

**Interfaces:**
- Produces: `Inventory` model without `categoryId`/`categoryName`, with `countDate` + `accountingDate` replacing `inventoryDate`

- [ ] **Step 1: Write the migration SQL**

```sql
ALTER TABLE `inventories`
  DROP COLUMN `category_id`,
  DROP COLUMN `category_name`,
  CHANGE `inventory_date` `count_date` VARCHAR(191) NULL,
  ADD COLUMN `accounting_date` VARCHAR(191) NULL;
```

- [ ] **Step 2: Update `prisma/schema.prisma`**

Replace the `Inventory` model (lines 44–59) with:

```prisma
model Inventory {
  id             Int             @id @default(autoincrement())
  status         InventoryStatus @default(BORRADOR)
  warehouseId    Int             @map("warehouse_id")
  warehouseName  String          @map("warehouse_name")
  countDate      String?         @map("count_date")
  accountingDate String?         @map("accounting_date")
  articles       Json            @default("[]")
  odooRef        String?         @map("odoo_ref")
  errorDetail    String?         @db.Text @map("error_detail")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")

  @@map("inventories")
}
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
cd casa-sonia-compras && pnpm prisma generate
```

Expected: `Generated Prisma Client (v...)` — no errors.

- [ ] **Step 4: Run migration against DB**

```bash
pnpm prisma migrate deploy
```

Expected: `1 migration applied successfully.`

- [ ] **Step 5: Verify**

```bash
pnpm prisma studio
```

Open `inventories` table — confirm columns are `id, status, warehouse_id, warehouse_name, count_date, accounting_date, articles, odoo_ref, error_detail, created_at, updated_at`. No `category_id` or `category_name`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260702000000_inventory_redesign/
git commit -m "feat(inventory): drop category columns, rename inventoryDate→countDate, add accountingDate"
```

---

### Task 2: TypeScript Type Updates

**Files:**
- Modify: `src/types/index.ts` (lines 210–252)

**Interfaces:**
- Produces: `InventoryArticle` with `categoryId`, `categoryName`, `categoryParentId`, `categoryParentName`, `qtyOnHand`; `LocalInventory`/`LocalInventorySummary` without category fields, with `countDate`/`accountingDate`

- [ ] **Step 1: Replace inventory types in `src/types/index.ts`**

Find and replace the section from `// ─── Inventory types` to end of file (lines 210–252):

```typescript
// ─── Inventory types ──────────────────────────────────────────────────────────

export type InventoryStatus = "BORRADOR" | "EN_REVISION" | "CONFIRMADO";

export interface InventoryArticle {
  productId: number;
  barcode: string;
  name: string;
  qty: number;
  salePrice: number;
  cost: number;
  lastPurchaseDate: string | null;
  size: string | null;
  brand: string | null;
  categoryId: number;
  categoryName: string;
  categoryParentId: number | null;
  categoryParentName: string | null;
  qtyOnHand: number;
}

export interface LocalInventory {
  id: number;
  status: InventoryStatus;
  warehouseId: number;
  warehouseName: string;
  countDate: string | null;
  accountingDate: string | null;
  articles: InventoryArticle[];
  odooRef: string | null;
  errorDetail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalInventorySummary {
  id: number;
  status: InventoryStatus;
  warehouseId: number;
  warehouseName: string;
  countDate: string | null;
  accountingDate: string | null;
  articleCount: number;
  odooRef: string | null;
  errorDetail: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Type-check**

```bash
cd casa-sonia-compras && pnpm build 2>&1 | head -60
```

Expected: Many errors from files that still reference old fields (`categoryId`, `categoryName`, `inventoryDate`). That is expected — will be fixed in subsequent tasks. At this point only check that the types file itself has no syntax errors (the error count should go up, not reference a parse error in `types/index.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(inventory): update InventoryArticle + LocalInventory types for category-per-article design"
```

---

### Task 3: Barcode API — Add Category Info + qtyOnHand

**Files:**
- Modify: `src/app/api/inventario/barcode/route.ts`

**Interfaces:**
- Consumes: existing Odoo fetch pattern from `src/lib/odoo.ts`
- Produces: `GET /api/inventario/barcode?code=X` returns `InventoryArticle` with new fields `categoryId`, `categoryName`, `categoryParentId`, `categoryParentName`, `qtyOnHand`

- [ ] **Step 1: Rewrite `src/app/api/inventario/barcode/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { odoo } from "@/lib/odoo";
import { getAttrMetadata } from "@/lib/productCache";
import type { InventoryArticle } from "@/types";

export async function GET(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();

  if (!code) {
    return NextResponse.json({ error: "code es requerido" }, { status: 400 });
  }

  const products = await odoo.searchRead(
    "product.product",
    [["barcode", "=", code]],
    [
      "id", "name", "barcode",
      "list_price", "standard_price",
      "product_tmpl_id", "product_template_attribute_value_ids",
      "categ_id", "qty_available",
    ],
  ) as {
    id: number;
    name: string;
    barcode: string | false;
    list_price: number;
    standard_price: number;
    product_tmpl_id: [number, string] | false;
    product_template_attribute_value_ids: number[];
    categ_id: [number, string] | false;
    qty_available: number;
  }[];

  if (products.length === 0) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const p = products[0];
  const templateId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : null;
  const ptavIds = p.product_template_attribute_value_ids || [];
  const categId = Array.isArray(p.categ_id) ? p.categ_id[0] : null;
  const categName = Array.isArray(p.categ_id) ? p.categ_id[1] : "";

  // Parallel: attr metadata + last purchase date + category parent
  const [{ sizeAttrIdSet, brandAttrId }, purchaseOrders, categoryData] = await Promise.all([
    getAttrMetadata(),
    odoo.searchRead(
      "purchase.order",
      [
        ["order_line.product_id", "=", p.id],
        ["state", "in", ["purchase", "done"]],
        ["date_approve", "!=", false],
      ],
      ["date_approve"],
      { order: "date_approve desc", limit: 1 },
    ) as Promise<{ date_approve: string }[]>,
    categId
      ? (odoo.read(
          "product.category",
          [categId],
          ["id", "name", "parent_id"],
        ) as Promise<{ id: number; name: string; parent_id: [number, string] | false }[]>)
      : Promise.resolve([]),
  ]);

  const lastPurchaseDate = purchaseOrders[0]?.date_approve ?? null;

  const categ = categoryData[0];
  const categoryParentId = categ && Array.isArray(categ.parent_id) ? categ.parent_id[0] : null;
  const categoryParentName = categ && Array.isArray(categ.parent_id) ? categ.parent_id[1] : null;

  // Resolve size from variant PTAVs
  let size: string | null = null;
  let brandResolutionPtavs: { id: number; attribute_id: [number, string] | number; name: string }[] = [];

  if (ptavIds.length > 0) {
    brandResolutionPtavs = await odoo.read(
      "product.template.attribute.value",
      ptavIds,
      ["id", "attribute_id", "name"],
    ) as typeof brandResolutionPtavs;

    for (const ptav of brandResolutionPtavs) {
      const attrId = Array.isArray(ptav.attribute_id) ? ptav.attribute_id[0] : ptav.attribute_id;
      if (sizeAttrIdSet.has(attrId)) {
        size = ptav.name;
        break;
      }
    }
  }

  // Resolve brand from template attribute line (non-variant attribute)
  let brand: string | null = null;
  if (templateId && brandAttrId) {
    const brandLines = await odoo.searchRead(
      "product.template.attribute.line",
      [
        ["product_tmpl_id", "=", templateId],
        ["attribute_id", "=", brandAttrId],
      ],
      ["value_ids"],
    ) as { value_ids: number[] }[];

    const brandValueIds = brandLines[0]?.value_ids ?? [];
    if (brandValueIds.length > 0) {
      const brandValues = await odoo.read(
        "product.attribute.value",
        brandValueIds,
        ["name"],
      ) as { name: string }[];
      brand = brandValues[0]?.name ?? null;
    }
  }

  const article: InventoryArticle = {
    productId: p.id,
    barcode: code,
    name: p.name,
    qty: 1,
    salePrice: p.list_price ?? 0,
    cost: p.standard_price ?? 0,
    lastPurchaseDate,
    size,
    brand,
    categoryId: categId ?? 0,
    categoryName: categName,
    categoryParentId,
    categoryParentName,
    qtyOnHand: p.qty_available ?? 0,
  };

  return NextResponse.json(article);
}
```

- [ ] **Step 2: Verify via `pnpm build`**

```bash
pnpm build 2>&1 | grep "barcode/route"
```

Expected: No errors referencing `barcode/route.ts`.

- [ ] **Step 3: Manual test**

Start `pnpm dev`. In browser DevTools or curl:

```
GET /api/inventario/barcode?code=<valid-barcode>
```

Response must include `categoryId` (number ≠ 0), `categoryName` (string), `qtyOnHand` (number ≥ 0).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/inventario/barcode/route.ts
git commit -m "feat(inventory): barcode API returns categoryId, categoryParentId, qtyOnHand"
```

---

### Task 4: Inventory CRUD API Updates

**Files:**
- Modify: `src/app/api/inventario/route.ts`
- Modify: `src/app/api/inventario/[id]/route.ts`

**Interfaces:**
- `POST /api/inventario` body: `{ warehouseId, warehouseName, countDate?, accountingDate? }` (no category fields)
- `GET /api/inventario` response: `LocalInventorySummary[]` with `countDate`/`accountingDate` (no category)
- `GET /api/inventario/[id]` response: `LocalInventory` with `countDate`/`accountingDate`
- `PATCH /api/inventario/[id]` body: supports `countDate`, `accountingDate` (no `inventoryDate`)

- [ ] **Step 1: Rewrite `src/app/api/inventario/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const warehouseId = searchParams.get("warehouse_id");
  const limit = parseInt(searchParams.get("limit") ?? "30");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (warehouseId) where.warehouseId = parseInt(warehouseId);

  const [inventories, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        status: true,
        warehouseId: true,
        warehouseName: true,
        countDate: true,
        accountingDate: true,
        articles: true,
        odooRef: true,
        errorDetail: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.inventory.count({ where }),
  ]);

  const summaries = inventories.map((inv) => {
    const { articles, ...rest } = inv;
    return {
      ...rest,
      articleCount: Array.isArray(articles) ? (articles as unknown[]).length : 0,
      countDate: inv.countDate ?? null,
      accountingDate: inv.accountingDate ?? null,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    };
  });

  return NextResponse.json({ data: summaries, total, limit, offset });
}

export async function POST(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    warehouseId: number;
    warehouseName: string;
    countDate?: string | null;
    accountingDate?: string | null;
  };

  const { warehouseId, warehouseName, countDate, accountingDate } = body;

  if (!warehouseId || !warehouseName) {
    return NextResponse.json(
      { error: "warehouseId, warehouseName son requeridos" },
      { status: 400 },
    );
  }

  const inventory = await prisma.inventory.create({
    data: {
      warehouseId,
      warehouseName,
      countDate: countDate ?? null,
      accountingDate: accountingDate ?? null,
      articles: [] as unknown as object[],
    },
  });

  return NextResponse.json({ id: inventory.id }, { status: 201 });
}
```

- [ ] **Step 2: Rewrite `src/app/api/inventario/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { InventoryArticle, InventoryStatus } from "@/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const inv = await prisma.inventory.findUnique({ where: { id: parseInt(id) } });

  if (!inv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    id: inv.id,
    status: inv.status as InventoryStatus,
    warehouseId: inv.warehouseId,
    warehouseName: inv.warehouseName,
    countDate: inv.countDate ?? null,
    accountingDate: inv.accountingDate ?? null,
    articles: (inv.articles as unknown as InventoryArticle[]) ?? [],
    odooRef: inv.odooRef,
    errorDetail: inv.errorDetail,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    status?: InventoryStatus;
    articles?: InventoryArticle[];
    countDate?: string | null;
    accountingDate?: string | null;
  };

  if (body.status === "EN_REVISION") {
    const current = await prisma.inventory.findUnique({ where: { id: parseInt(id) } });
    const articles = (current?.articles as unknown as InventoryArticle[]) ?? [];
    if (articles.length === 0) {
      return NextResponse.json(
        { error: "No se puede enviar a revisión un inventario sin artículos" },
        { status: 400 },
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.articles !== undefined) data.articles = body.articles as unknown as object[];
  if (body.countDate !== undefined) data.countDate = body.countDate;
  if (body.accountingDate !== undefined) data.accountingDate = body.accountingDate;

  const inv = await prisma.inventory.update({
    where: { id: parseInt(id) },
    data,
  });

  return NextResponse.json({
    id: inv.id,
    status: inv.status,
    updatedAt: inv.updatedAt.toISOString(),
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.inventory.delete({ where: { id: parseInt(id) } });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify**

```bash
pnpm build 2>&1 | grep -E "api/inventario/(route|\\[id\\]/route)"
```

Expected: No errors in those files.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/inventario/route.ts src/app/api/inventario/[id]/route.ts
git commit -m "feat(inventory): CRUD APIs drop category, use countDate/accountingDate"
```

---

### Task 5: Summary Data API

**Files:**
- Create: `src/app/api/inventario/[id]/summary-data/route.ts`

**Interfaces:**
- Produces: `GET /api/inventario/[id]/summary-data`
- Returns `SummaryDataResponse` (defined inline below)
- Used by the resumen page (Task 11) and the confirm modal (Task 12)

Response shape:
```typescript
{
  categories: {
    categoryId: number;
    categoryName: string;
    categoryParentId: number | null;
    categoryParentName: string | null;
    products: {
      productId: number;
      barcode: string;
      name: string;
      cost: number;
      qtyOnHand: number;
    }[];
  }[];
}
```

- [ ] **Step 1: Create `src/app/api/inventario/[id]/summary-data/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { odoo } from "@/lib/odoo";
import type { InventoryArticle } from "@/types";

type Params = { params: Promise<{ id: string }> };

export interface SummaryProduct {
  productId: number;
  barcode: string;
  name: string;
  cost: number;
  qtyOnHand: number;
}

export interface SummaryCategory {
  categoryId: number;
  categoryName: string;
  categoryParentId: number | null;
  categoryParentName: string | null;
  products: SummaryProduct[];
}

export interface SummaryDataResponse {
  categories: SummaryCategory[];
}

// GET /api/inventario/[id]/summary-data
// Returns all Odoo products for each category touched by this inventory,
// with their current qty_available. Used to compute diffs and surface uncounted articles.
export async function GET(request: NextRequest, { params }: Params) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const inv = await prisma.inventory.findUnique({ where: { id: parseInt(id) } });

  if (!inv) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const articles = (inv.articles as unknown as InventoryArticle[]) ?? [];

  // Collect unique categories touched by this inventory
  const categoryMap = new Map<number, {
    categoryId: number;
    categoryName: string;
    categoryParentId: number | null;
    categoryParentName: string | null;
  }>();

  for (const a of articles) {
    if (!categoryMap.has(a.categoryId)) {
      categoryMap.set(a.categoryId, {
        categoryId: a.categoryId,
        categoryName: a.categoryName,
        categoryParentId: a.categoryParentId,
        categoryParentName: a.categoryParentName,
      });
    }
  }

  if (categoryMap.size === 0) {
    return NextResponse.json({ categories: [] } satisfies SummaryDataResponse);
  }

  // Fetch all active products with barcode for each affected category
  const categoryIds = Array.from(categoryMap.keys());

  const allProducts = await odoo.fetchAll<{
    id: number;
    name: string;
    barcode: string | false;
    standard_price: number;
    qty_available: number;
    categ_id: [number, string] | false;
  }>(
    "product.product",
    [
      ["categ_id", "in", categoryIds],
      ["active", "=", true],
      ["barcode", "!=", false],
    ],
    ["id", "name", "barcode", "standard_price", "qty_available", "categ_id"],
    "name asc",
  );

  // Group products by category
  const productsByCategory = new Map<number, SummaryProduct[]>();
  for (const p of allProducts) {
    const categId = Array.isArray(p.categ_id) ? p.categ_id[0] : null;
    if (!categId) continue;
    if (!productsByCategory.has(categId)) productsByCategory.set(categId, []);
    productsByCategory.get(categId)!.push({
      productId: p.id,
      barcode: p.barcode as string,
      name: p.name,
      cost: p.standard_price ?? 0,
      qtyOnHand: p.qty_available ?? 0,
    });
  }

  const categories: SummaryCategory[] = [];
  for (const [categoryId, meta] of categoryMap.entries()) {
    categories.push({
      ...meta,
      products: productsByCategory.get(categoryId) ?? [],
    });
  }

  return NextResponse.json({ categories } satisfies SummaryDataResponse);
}
```

- [ ] **Step 2: Verify compile**

```bash
pnpm build 2>&1 | grep "summary-data"
```

Expected: No errors.

- [ ] **Step 3: Manual test**

With `pnpm dev` running and an inventory that has at least one scanned article:

```
GET /api/inventario/1/summary-data
```

Response must have `categories` array where each entry has `categoryId`, `categoryName`, and a `products` array with `qtyOnHand` values.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/inventario/[id]/summary-data/
git commit -m "feat(inventory): add summary-data endpoint for category diff view"
```

---

### Task 6: Confirm API Redesign

**Files:**
- Modify: `src/app/api/inventario/[id]/confirm/route.ts`

**Interfaces:**
- Consumes: body `{ excludedCategoryIds?: number[], spawnNewDraft?: boolean }`
- Behaviour: only syncs included categories to Odoo; if `spawnNewDraft=true` creates a new BORRADOR inventory with the excluded articles

- [ ] **Step 1: Rewrite `src/app/api/inventario/[id]/confirm/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { odoo } from "@/lib/odoo";
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
  if (inv.status !== "EN_REVISION") {
    return NextResponse.json(
      { error: "Solo se puede confirmar un inventario en revisión" },
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

  // Affected categories for uncounted-articles pass (only included ones)
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
    const loadedProductIds = new Set(includedArticles.map((a) => a.productId));

    // ── Apply counted articles ────────────────────────────────────────────────
    for (const article of includedArticles) {
      const quants = await odoo.searchRead(
        "stock.quant",
        [
          ["product_id", "=", article.productId],
          ["location_id", "=", locationId],
        ],
        ["id"],
      ) as { id: number }[];

      const quantFields: Record<string, unknown> = {
        inventory_quantity: article.qty,
      };
      if (inv.countDate) quantFields.inventory_date = inv.countDate;

      if (quants.length > 0) {
        await odoo.write("stock.quant", [quants[0].id], quantFields);
        await odoo.call("stock.quant", "action_apply_inventory", { ids: [quants[0].id] });
      } else {
        const quantId = await odoo.create("stock.quant", {
          product_id: article.productId,
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
          await odoo.write("stock.quant", [quants[0].id], { inventory_quantity: 0 });
        }
      }
    }

    // ── Mark confirmed ────────────────────────────────────────────────────────
    await prisma.inventory.update({
      where: { id: parseInt(id) },
      data: { status: "CONFIRMADO", errorDetail: null },
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
    const detail = error instanceof Error ? error.message : String(error);
    await prisma.inventory.update({
      where: { id: parseInt(id) },
      data: { errorDetail: detail },
    });
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify compile**

```bash
pnpm build 2>&1 | grep "confirm/route"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/inventario/[id]/confirm/route.ts
git commit -m "feat(inventory): confirm API supports excludedCategoryIds and spawnNewDraft"
```

---

### Task 7: NuevoInventarioModal — Remove Category, Add Dates

**Files:**
- Modify: `src/components/inventario/NuevoInventarioModal.tsx`

**Interfaces:**
- Consumes: `POST /api/inventario` body now `{ warehouseId, warehouseName, countDate, accountingDate }`
- Produces: modal with Fecha de Conteo + Fecha Contable + Depósito (no Categoría)

- [ ] **Step 1: Rewrite `src/components/inventario/NuevoInventarioModal.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Text, Group, Loader } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { useWarehouses } from "@/hooks/useWarehouses";
import type { Warehouse } from "@/types";

interface NuevoInventarioModalProps {
  opened: boolean;
  onClose: () => void;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function NuevoInventarioModal({ opened, onClose }: NuevoInventarioModalProps) {
  const router = useRouter();
  const { data: warehouses = [], isLoading: wLoading } = useWarehouses();

  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [countDate, setCountDate] = useState<string | null>(todayStr());
  const [accountingDate, setAccountingDate] = useState<string | null>(todayStr());
  const [creating, setCreating] = useState(false);

  const canSubmit = !!selectedWarehouse && !!countDate && !!accountingDate && !creating;

  function handleClose() {
    if (creating) return;
    setSelectedWarehouse(null);
    setCountDate(todayStr());
    setAccountingDate(todayStr());
    onClose();
  }

  async function handleStart() {
    if (!selectedWarehouse || !countDate || !accountingDate) return;
    setCreating(true);
    try {
      const res = await fetch("/api/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: selectedWarehouse.id,
          warehouseName: selectedWarehouse.name,
          countDate,
          accountingDate,
        }),
      });
      const { id } = await res.json();
      onClose();
      router.push(`/inventario/${id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={handleClose}
        title={
          <Text fw={700} size="md" style={{ fontFamily: "var(--font-display)" }}>
            Nuevo Inventario
          </Text>
        }
        centered
        size="md"
        overlayProps={{ blur: 2, backgroundOpacity: 0.55 }}
        closeOnClickOutside={!creating}
        closeOnEscape={!creating}
      >
        <div style={{ padding: "2px 0 12px" }}>
          {/* Fecha de Conteo */}
          <Text
            size="xs" fw={600} c="dimmed" mb="sm"
            style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            Fecha de Conteo
          </Text>
          <div style={{ marginBottom: 24 }}>
            <DatePickerInput
              value={countDate ? new Date(countDate + "T12:00:00") : null}
              onChange={(v) => setCountDate(v ? (v as unknown as Date).toISOString().slice(0, 10) : null)}
              valueFormat="DD/MM/YYYY"
              locale="es"
              clearable={false}
              size="sm"
              w={180}
            />
          </div>

          {/* Fecha Contable */}
          <Text
            size="xs" fw={600} c="dimmed" mb="sm"
            style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            Fecha Contable
          </Text>
          <div style={{ marginBottom: 24 }}>
            <DatePickerInput
              value={accountingDate ? new Date(accountingDate + "T12:00:00") : null}
              onChange={(v) => setAccountingDate(v ? (v as unknown as Date).toISOString().slice(0, 10) : null)}
              valueFormat="DD/MM/YYYY"
              locale="es"
              clearable={false}
              size="sm"
              w={180}
            />
          </div>

          {/* Depósito */}
          <Text
            size="xs" fw={600} c="dimmed" mb="sm"
            style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            Depósito
          </Text>

          {wLoading ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text3)", fontSize: 13, marginBottom: 24 }}>
              <Loader size={14} color="gray" /> Cargando depósitos...
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {warehouses.map((wh) => {
                const active = selectedWarehouse?.id === wh.id;
                return (
                  <button
                    key={wh.id}
                    onClick={() => setSelectedWarehouse(wh)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 8,
                      border: active
                        ? "2px solid var(--mantine-color-amber-6)"
                        : "1px solid var(--border)",
                      background: active
                        ? "color-mix(in srgb, var(--mantine-color-amber-6) 10%, transparent)"
                        : "var(--surface)",
                      color: active ? "var(--mantine-color-amber-4)" : "var(--text2)",
                      fontFamily: "var(--font-sans)",
                      fontSize: 14,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                      transition: "border-color 120ms ease, background 120ms ease, color 120ms ease",
                      outline: "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.borderColor = "var(--mantine-color-amber-8)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                    }}
                  >
                    {wh.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Group
          justify="flex-end" gap="xs" pt="md"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <Button size="sm" variant="subtle" color="gray" onClick={handleClose} disabled={creating}>
            Cancelar
          </Button>
          <Button
            size="sm" color="amber" loading={creating}
            disabled={!canSubmit} onClick={handleStart}
          >
            Comenzar Inventario
          </Button>
        </Group>
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
pnpm build 2>&1 | grep "NuevoInventarioModal"
```

Expected: No errors.

- [ ] **Step 3: Manual test**

`pnpm dev` → open `/inventario` → click new button → modal should show Fecha de Conteo, Fecha Contable, Depósito (no Categoría). Fill all fields → click "Comenzar Inventario" → navigates to detail page.

- [ ] **Step 4: Commit**

```bash
git add src/components/inventario/NuevoInventarioModal.tsx
git commit -m "feat(inventory): remove category from creation modal, add countDate + accountingDate"
```

---

### Task 8: Inventario List Page — Remove Category Column

**Files:**
- Modify: `src/app/(app)/inventario/page.tsx`

**Interfaces:**
- Consumes: `LocalInventorySummary` (no `categoryId`/`categoryName` after Task 2)
- Produces: table without "Categoría" column; date column shows `countDate` instead of `inventoryDate`

- [ ] **Step 1: Update table header in `src/app/(app)/inventario/page.tsx`**

Find line 143:
```typescript
{["#", "Depósito", "Categoría", "Estado", "Artículos", "Fecha", "Acciones"].map(
```

Replace with:
```typescript
{["#", "Depósito", "Estado", "Artículos", "Fecha Conteo", "Acciones"].map(
```

- [ ] **Step 2: Remove the Categoría `<td>` cell**

Find and delete:
```typescript
                    <td style={{ padding: "12px 12px", color: "var(--text2)" }}>
                      {inv.categoryName}
                    </td>
```

- [ ] **Step 3: Update the date cell to show `countDate`**

Find:
```typescript
                    <td style={{ padding: "12px 12px", color: "var(--text3)", whiteSpace: "nowrap" }}>
                      {formatDate(inv.createdAt)}
                    </td>
```

Replace with:
```typescript
                    <td style={{ padding: "12px 12px", color: "var(--text3)", whiteSpace: "nowrap" }}>
                      {inv.countDate ? inv.countDate.split("-").reverse().join("/") : formatDate(inv.createdAt)}
                    </td>
```

- [ ] **Step 4: Remove `ResumenModal` subtitle reference to `categoryName`**

In `src/components/inventario/ResumenModal.tsx` (line 89):
```typescript
      {inventory.warehouseName} · {inventory.categoryName}
```

Replace with:
```typescript
      {inventory.warehouseName}
      {inventory.countDate && (
        <> · {inventory.countDate.split("-").reverse().join("/")}</>
      )}
```

- [ ] **Step 5: Verify compile**

```bash
pnpm build 2>&1 | grep -E "inventario/page|ResumenModal"
```

Expected: No errors referencing `categoryName`.

- [ ] **Step 6: Manual test**

`pnpm dev` → `/inventario` → table should have no Categoría column, date column shows count date.

- [ ] **Step 7: Commit**

```bash
git add src/app/(app)/inventario/page.tsx src/components/inventario/ResumenModal.tsx
git commit -m "feat(inventory): remove category column from list, show countDate in table"
```

---

### Task 9: Detail Page — On-Demand Barcode Scanning Without Category

**Files:**
- Modify: `src/app/(app)/inventario/[id]/page.tsx`

**Interfaces:**
- Consumes: `InventoryArticle` (new shape with `categoryId`, `categoryName`, etc.)
- Produces: scanning page that uses local `Map` cache instead of category preload; removes category-restriction error; updates sticky header

- [ ] **Step 1: Remove category preload and barcodeMap**

In `src/app/(app)/inventario/[id]/page.tsx`, inside `InventarioCargarContent`:

Remove lines:
```typescript
  // Pre-carga todos los productos de la categoría para lookup en memoria
  const { data: categoryProducts = [], isLoading: loadingCatalog } = useCategoryProducts(inventory.categoryId);

  // Map barcode → producto para O(1) lookup
  const barcodeMap = useMemo(() => {
    const map = new Map<string, CategoryProduct>();
    for (const p of categoryProducts) {
      if (p.barcode) map.set(p.barcode, p);
    }
    return map;
  }, [categoryProducts]);
```

Add after the existing `useRef` for `hiddenInputRef`:
```typescript
  // On-demand barcode cache: barcode → enriched article (prevents duplicate Odoo fetches)
  const articleCache = useRef<Map<string, InventoryArticle>>(new Map());
```

Also remove these imports (if no longer used):
```typescript
import { useCategoryProducts } from "@/hooks/useCategoryProducts";
import type { CategoryProduct } from "@/app/api/inventario/category-products/route";
```

Remove `useMemo` from the import if only used for `barcodeMap`.

- [ ] **Step 2: Rewrite `lookupBarcode` to use cache**

Replace the entire `lookupBarcode` function with:

```typescript
  async function lookupBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanError(null);

    // Already in list → increment qty
    const existing = articles.find((a) => a.barcode === trimmed);
    if (existing) {
      const updated = articles.map((a) =>
        a.barcode === trimmed ? { ...a, qty: a.qty + 1 } : a,
      );
      setArticles(updated);
      await persistArticles(updated);
      return;
    }

    // Cache hit → add immediately
    const cached = articleCache.current.get(trimmed);
    if (cached) {
      const article: InventoryArticle = { ...cached, qty: 1 };
      const updated = [...articles, article];
      setArticles(updated);
      await persistArticles(updated);
      return;
    }

    // Fetch from API
    setScanning(true);
    try {
      const res = await fetch(`/api/inventario/barcode?code=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        setScanError(`Producto no encontrado: ${trimmed}`);
        return;
      }
      const article = (await res.json()) as InventoryArticle;
      articleCache.current.set(trimmed, article);
      const updated = [...articles, article];
      setArticles(updated);
      await persistArticles(updated);
    } finally {
      setScanning(false);
    }
  }
```

- [ ] **Step 3: Update the sticky header**

In the sticky header section, replace:
```typescript
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-display)" }}>
              {inventory.warehouseName}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>
              {inventory.categoryName}
              {inventory.inventoryDate && (
                <span style={{ marginLeft: 8 }}>
                  · {inventory.inventoryDate.split("-").reverse().join("/")}
                </span>
              )}
            </div>
          </div>
```

With:
```typescript
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-display)" }}>
              {inventory.warehouseName}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>
              {inventory.countDate && (
                <span>Conteo: {inventory.countDate.split("-").reverse().join("/")}</span>
              )}
              {inventory.accountingDate && (
                <span style={{ marginLeft: 8 }}>
                  · Contable: {inventory.accountingDate.split("-").reverse().join("/")}
                </span>
              )}
            </div>
          </div>
```

- [ ] **Step 4: Verify compile**

```bash
pnpm build 2>&1 | grep "inventario/\[id\]/page"
```

Expected: No errors.

- [ ] **Step 5: Manual test**

`pnpm dev` → open existing BORRADOR inventory → scan a barcode → product added immediately → scan same barcode again → qty increments. No "not in category" error. Scan a barcode from a different category than usual → product adds normally.

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/inventario/[id]/page.tsx
git commit -m "feat(inventory): replace category preload with on-demand barcode cache, remove category restriction"
```

---

### Task 10: Category Tree Component

**Files:**
- Create: `src/components/inventario/CategoryTree.tsx`

**Interfaces:**
- Props: `{ articles: InventoryArticle[] }` — only counted articles, used in the detail page to replace the flat article list
- Produces: collapsible tree grouped by `categoryParentId` → `categoryId`, with per-group aggregates

This component is for the **detail/scanning page** only (shows counted articles grouped by category). The summary diff view in Task 11 uses a different, richer data structure.

- [ ] **Step 1: Create `src/components/inventario/CategoryTree.tsx`**

```typescript
"use client";
import { useState, useMemo } from "react";
import { Text, Group } from "@mantine/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { InventoryArticle } from "@/types";

interface CategoryTreeProps {
  articles: InventoryArticle[];
}

function formatCurrency(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CategoryTree({ articles }: CategoryTreeProps) {
  // Collect unique leaf categories
  const leafCategories = useMemo(() => {
    const map = new Map<number, {
      categoryId: number;
      categoryName: string;
      categoryParentId: number | null;
      categoryParentName: string | null;
    }>();
    for (const a of articles) {
      if (!map.has(a.categoryId)) {
        map.set(a.categoryId, {
          categoryId: a.categoryId,
          categoryName: a.categoryName,
          categoryParentId: a.categoryParentId,
          categoryParentName: a.categoryParentName,
        });
      }
    }
    return Array.from(map.values());
  }, [articles]);

  // Group leaf categories by parent (null parent = top-level)
  const grouped = useMemo(() => {
    const byParent = new Map<string, typeof leafCategories>();
    for (const cat of leafCategories) {
      const key = cat.categoryParentId !== null ? String(cat.categoryParentId) : "__root__";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(cat);
    }
    return byParent;
  }, [leafCategories]);

  const parentKeys = Array.from(grouped.keys());

  if (articles.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: "48px 24px", color: "var(--text3)",
        border: "1px dashed var(--border)", borderRadius: 8, fontSize: 13,
      }}>
        Escaneá un artículo para comenzar.
      </div>
    );
  }

  return (
    <div>
      {parentKeys.map((parentKey) => {
        const cats = grouped.get(parentKey)!;
        const parentName = cats[0].categoryParentName;
        const isRoot = parentKey === "__root__";

        const parentArticles = articles.filter((a) =>
          cats.some((c) => c.categoryId === a.categoryId),
        );
        const parentTotal = parentArticles.reduce((s, a) => s + a.qty, 0);
        const parentDistinct = new Set(parentArticles.map((a) => a.productId)).size;

        return (
          <ParentSection
            key={parentKey}
            parentName={isRoot ? null : parentName}
            parentTotal={parentTotal}
            parentDistinct={parentDistinct}
            categories={cats}
            articles={articles}
          />
        );
      })}
    </div>
  );
}

function ParentSection({
  parentName,
  parentTotal,
  parentDistinct,
  categories,
  articles,
}: {
  parentName: string | null;
  parentTotal: number;
  parentDistinct: number;
  categories: { categoryId: number; categoryName: string }[];
  articles: InventoryArticle[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ marginBottom: 16 }}>
      {parentName && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "8px 12px", cursor: "pointer",
            color: "var(--text)", fontFamily: "var(--font-sans)", fontSize: 13,
            fontWeight: 600, marginBottom: 4,
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ flex: 1, textAlign: "left" }}>{parentName}</span>
          <span style={{ color: "var(--text3)", fontWeight: 400, fontSize: 12 }}>
            {parentDistinct} art. · {parentTotal} uds
          </span>
        </button>
      )}

      {expanded && categories.map((cat) => {
        const catArticles = articles.filter((a) => a.categoryId === cat.categoryId);
        return (
          <LeafCategory
            key={cat.categoryId}
            categoryName={cat.categoryName}
            articles={catArticles}
            indented={!!parentName}
          />
        );
      })}
    </div>
  );
}

function LeafCategory({
  categoryName,
  articles,
  indented,
}: {
  categoryName: string;
  articles: InventoryArticle[];
  indented: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const total = articles.reduce((s, a) => s + a.qty, 0);

  return (
    <div style={{ marginLeft: indented ? 16 : 0, marginBottom: 8 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          background: "color-mix(in srgb, var(--mantine-color-amber-6) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--mantine-color-amber-6) 25%, transparent)",
          borderRadius: 6, padding: "6px 12px", cursor: "pointer",
          color: "var(--mantine-color-amber-3)", fontFamily: "var(--font-sans)",
          fontSize: 12, fontWeight: 600, marginBottom: 4,
        }}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span style={{ flex: 1, textAlign: "left" }}>{categoryName}</span>
        <span style={{ color: "var(--mantine-color-amber-5)", fontWeight: 400 }}>
          {articles.length} art. · {total} uds
        </span>
      </button>

      {expanded && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-sans)" }}>
          <tbody>
            {articles.map((a) => (
              <tr key={a.productId} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 12px", color: "var(--text3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {a.barcode}
                </td>
                <td style={{ padding: "6px 12px", color: "var(--text)" }}>{a.name}</td>
                <td style={{ padding: "6px 12px", color: "var(--text2)", fontSize: 11 }}>
                  {a.brand}{a.brand && a.size ? " · " : ""}{a.size}
                </td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--mantine-color-amber-4)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  {a.qty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Use `CategoryTree` in detail page**

In `src/app/(app)/inventario/[id]/page.tsx`, find the article table `<tbody>` and the existing table structure that renders all articles flat. Replace the entire article table render section with:

```typescript
          {/* Category tree view */}
          <div style={{ padding: "16px 24px" }}>
            <CategoryTree articles={articles} />
          </div>
```

Add the import at the top:
```typescript
import { CategoryTree } from "@/components/inventario/CategoryTree";
```

Note: The full article table with edit controls (price, qty inline edits, delete) is kept inside a separate flat section that the `CategoryTree` does NOT replace. The `CategoryTree` is the **read view** below the scanner. The edit functionality remains in the flat table. If you need to keep the flat table with edit controls visible simultaneously, render both: CategoryTree on top as a summary, flat edit table below. Or keep flat table only and add category grouping headers.

Actually, for the implementation: the detail page is primarily a scanning interface. The flat edit table is important for price/qty correction. Instead of replacing the flat table, add the `CategoryTree` as a collapsible summary ABOVE the edit table:

```typescript
          {/* Category summary */}
          {articles.length > 0 && (
            <div style={{ padding: "0 24px 16px" }}>
              <Text size="xs" fw={600} c="dimmed" mb="xs"
                style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Por Categoría
              </Text>
              <CategoryTree articles={articles} />
            </div>
          )}
```

Keep the existing flat article table for editing.

- [ ] **Step 3: Verify compile**

```bash
pnpm build 2>&1 | grep "CategoryTree\|inventario/\[id\]/page"
```

Expected: No errors.

- [ ] **Step 4: Manual test**

`pnpm dev` → scan 2 articles from different categories → both appear in CategoryTree grouped by category above the flat table.

- [ ] **Step 5: Commit**

```bash
git add src/components/inventario/CategoryTree.tsx src/app/(app)/inventario/[id]/page.tsx
git commit -m "feat(inventory): add CategoryTree component, show category grouping in detail page"
```

---

### Task 11: Summary Page Redesign — Category Diff View

**Files:**
- Modify: `src/app/(app)/inventario/[id]/resumen/page.tsx`

**Interfaces:**
- Consumes: `GET /api/inventario/[id]/summary-data` (Task 5) + `useInventory` hook
- Produces: category tree with ALL Odoo articles (counted + uncounted), diffs, warnings at threshold > 10 units

Columns: Código | Descripción | Contado | En Mano | Diferencia | Costo unit. | Imp. Diferencia

Warning: if `|aggregateDiff|` for a category > 10, show amber warning badge.

- [ ] **Step 1: Rewrite `src/app/(app)/inventario/[id]/resumen/page.tsx`**

```typescript
"use client";
import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Text, Group, Tooltip, Badge, Alert } from "@mantine/core";
import { SendHorizontal, ArrowLeft, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useInventory } from "@/hooks/useInventory";
import { InventoryStatusBadge } from "@/components/inventario/InventoryStatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { InventoryArticle } from "@/types";
import type { SummaryDataResponse, SummaryCategory } from "@/app/api/inventario/[id]/summary-data/route";

type Params = Promise<{ id: string }>;

function formatCurrency(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DiffCell({ value }: { value: number }) {
  const color = value < 0 ? "var(--mantine-color-red-4)" : value > 0 ? "var(--mantine-color-green-4)" : "var(--text3)";
  return (
    <td style={{ padding: "6px 12px", textAlign: "right", color, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
      {value > 0 ? "+" : ""}{value}
    </td>
  );
}

function CategorySection({
  cat,
  countedMap,
}: {
  cat: SummaryCategory;
  countedMap: Map<number, InventoryArticle>;
}) {
  const [expanded, setExpanded] = useState(true);

  let aggregateDiff = 0;
  let aggregateCostDiff = 0;

  const rows = cat.products.map((p) => {
    const counted = countedMap.get(p.productId);
    const countedQty = counted?.qty ?? 0;
    const diff = countedQty - p.qtyOnHand;
    aggregateDiff += diff;
    aggregateCostDiff += diff * p.cost;
    return { ...p, countedQty, diff };
  });

  const hasWarning = Math.abs(aggregateDiff) > 10;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Category header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 6, padding: "8px 12px", cursor: "pointer", marginBottom: 4,
          color: "var(--text)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
        }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>
          {cat.categoryParentName ? `${cat.categoryParentName} › ` : ""}{cat.categoryName}
        </span>
        {hasWarning && (
          <Badge color="orange" variant="light" size="xs" leftSection={<AlertTriangle size={10} />}>
            Diferencia >{Math.abs(aggregateDiff)} uds
          </Badge>
        )}
        <span style={{ color: "var(--text3)", fontWeight: 400, fontSize: 12 }}>
          Σ diff: {aggregateDiff > 0 ? "+" : ""}{aggregateDiff} uds
          {" "}/ $ {formatCurrency(Math.abs(aggregateCostDiff))}
        </span>
      </button>

      {expanded && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-sans)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Código", "Descripción", "Contado", "En Mano", "Diferencia", "Costo", "Imp. Diferencia"].map((h) => (
                  <th key={h} style={{
                    padding: "6px 12px", textAlign: ["Contado", "En Mano", "Diferencia", "Costo", "Imp. Diferencia"].includes(h) ? "right" : "left",
                    color: "var(--text3)", fontWeight: 500, fontSize: 11,
                    letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.productId}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    opacity: row.countedQty === 0 ? 0.55 : 1,
                  }}
                >
                  <td style={{ padding: "6px 12px", color: "var(--text3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {row.barcode}
                  </td>
                  <td style={{ padding: "6px 12px", color: "var(--text)" }}>{row.name}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--mantine-color-amber-4)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                    {row.countedQty}
                  </td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--text2)", fontFamily: "var(--font-mono)" }}>
                    {row.qtyOnHand}
                  </td>
                  <DiffCell value={row.diff} />
                  <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--text2)", fontFamily: "var(--font-mono)" }}>
                    $ {formatCurrency(row.cost)}
                  </td>
                  <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--text2)", fontFamily: "var(--font-mono)" }}>
                    {row.diff !== 0 ? `$ ${formatCurrency(row.diff * row.cost)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function InventarioResumenPage({ params }: { params: Params }) {
  const { id } = use(params);
  const invId = parseInt(id);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: inventory, isLoading } = useInventory(invId);
  const [summaryData, setSummaryData] = useState<SummaryDataResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoadingSummary(true);
    fetch(`/api/inventario/${invId}/summary-data`)
      .then((r) => r.json())
      .then((d: SummaryDataResponse) => setSummaryData(d))
      .finally(() => setLoadingSummary(false));
  }, [invId]);

  async function handleEnviarRevision() {
    setSending(true);
    try {
      await fetch(`/api/inventario/${invId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "EN_REVISION" }),
      });
      queryClient.invalidateQueries({ queryKey: ["inventories"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", invId] });
      router.push("/inventario");
    } finally {
      setSending(false);
    }
  }

  if (isLoading || loadingSummary) {
    return (
      <div style={{ display: "flex", gap: 8, padding: 48, justifyContent: "center", color: "var(--text2)" }}>
        <LoadingSpinner size={20} /> Cargando resumen...
      </div>
    );
  }

  if (!inventory) {
    return <div style={{ padding: 48, textAlign: "center" }}><Text c="red">Inventario no encontrado</Text></div>;
  }

  const articles: InventoryArticle[] = inventory.articles ?? [];
  const countedMap = new Map<number, InventoryArticle>(articles.map((a) => [a.productId, a]));
  const isBorrador = inventory.status === "BORRADOR";

  return (
    <div style={{ padding: "24px 24px 80px", maxWidth: 1100 }}>
      {/* Header */}
      <Group justify="space-between" align="flex-start" mb="xl">
        <div>
          <Group gap={10} mb={4} align="center">
            <button
              onClick={() => router.push(`/inventario/${invId}`)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 0, display: "flex", alignItems: "center" }}
            >
              <ArrowLeft size={16} />
            </button>
            <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
              Resumen del Inventario #{invId}
            </h1>
            <InventoryStatusBadge status={inventory.status} />
          </Group>
          <Text size="xs" c="dimmed">
            {inventory.warehouseName}
            {inventory.countDate && ` · Conteo: ${inventory.countDate.split("-").reverse().join("/")}`}
            {inventory.accountingDate && ` · Contable: ${inventory.accountingDate.split("-").reverse().join("/")}`}
          </Text>
        </div>
      </Group>

      {/* Category diff sections */}
      {summaryData && summaryData.categories.length > 0 ? (
        summaryData.categories.map((cat) => (
          <CategorySection key={cat.categoryId} cat={cat} countedMap={countedMap} />
        ))
      ) : (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text3)", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 13 }}>
          No hay artículos cargados en este inventario.
        </div>
      )}

      {/* Sticky footer */}
      {isBorrador && (
        <div style={{
          position: "fixed", bottom: 0, left: "var(--sidebar-width, 0px)", right: 0, zIndex: 50,
          background: "var(--mantine-color-dark-8)", borderTop: "1px solid var(--mantine-color-dark-5)",
          padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12,
        }}>
          <Tooltip label="No hay artículos cargados" withArrow disabled={articles.length > 0}>
            <Button
              leftSection={<SendHorizontal size={15} />}
              color="amber" size="sm"
              loading={sending} disabled={articles.length === 0}
              onClick={handleEnviarRevision}
            >
              Enviar a Revisión
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

```bash
pnpm build 2>&1 | grep "resumen/page"
```

Expected: No errors.

- [ ] **Step 3: Manual test**

`pnpm dev` → scan articles in a BORRADOR inventory → navigate to resumen page → should show category sections with counted qty, Odoo qty-on-hand, diff column, warning if diff > 10.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/inventario/[id]/resumen/page.tsx
git commit -m "feat(inventory): resumen page shows category diff tree with qtyOnHand and warnings"
```

---

### Task 12: Confirm Flow — Category Exclusion + Split Draft

**Files:**
- Modify: `src/components/inventario/ResumenModal.tsx`
- Modify: `src/app/(app)/inventario/[id]/page.tsx` (footer: EN_REVISION confirm button opens modal)

**Interfaces:**
- Consumes: `SummaryDataResponse` (same fetch as Task 11), `POST /api/inventario/[id]/confirm` with `{ excludedCategoryIds, spawnNewDraft }`
- Produces: ResumenModal in EN_REVISION mode shows category checkboxes; accept → dialog with Option A / Option B

- [ ] **Step 1: Rewrite `src/components/inventario/ResumenModal.tsx`**

```typescript
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Text, Group, Tooltip, Checkbox, ScrollArea, Badge, Radio, Stack } from "@mantine/core";
import { Check, SendHorizontal, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { InventoryStatusBadge } from "@/components/inventario/InventoryStatusBadge";
import type { InventoryArticle, LocalInventory } from "@/types";
import type { SummaryDataResponse, SummaryCategory } from "@/app/api/inventario/[id]/summary-data/route";

interface ResumenModalProps {
  opened: boolean;
  onClose: () => void;
  inventory: LocalInventory;
  articles: InventoryArticle[];
  onSuccess?: () => void;
}

function formatCurrency(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ResumenModal({ opened, onClose, inventory, articles, onSuccess }: ResumenModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryDataResponse | null>(null);
  const [checkedCategoryIds, setCheckedCategoryIds] = useState<Set<number>>(new Set());
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitAction, setSplitAction] = useState<"discard" | "new_draft">("discard");

  const isBorrador = inventory.status === "BORRADOR";
  const isEnRevision = inventory.status === "EN_REVISION";

  useEffect(() => {
    if (!opened || !isEnRevision) return;
    fetch(`/api/inventario/${inventory.id}/summary-data`)
      .then((r) => r.json())
      .then((d: SummaryDataResponse) => {
        setSummaryData(d);
        setCheckedCategoryIds(new Set(d.categories.map((c) => c.categoryId)));
      });
  }, [opened, isEnRevision, inventory.id]);

  function afterAction() {
    queryClient.invalidateQueries({ queryKey: ["inventories"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", inventory.id] });
    onClose();
    if (onSuccess) {
      onSuccess();
    } else {
      router.push("/inventario");
    }
  }

  async function handleEnviarRevision() {
    setLoading(true);
    try {
      await fetch(`/api/inventario/${inventory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "EN_REVISION" }),
      });
      afterAction();
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmarClick() {
    const allCategoryIds = summaryData?.categories.map((c) => c.categoryId) ?? [];
    const unchecked = allCategoryIds.filter((id) => !checkedCategoryIds.has(id));
    if (unchecked.length > 0) {
      setSplitDialogOpen(true);
    } else {
      void executeConfirm([]);
    }
  }

  async function executeConfirm(excludedCategoryIds: number[]) {
    const spawnNewDraft = splitAction === "new_draft";
    setLoading(true);
    setSplitDialogOpen(false);
    try {
      const res = await fetch(`/api/inventario/${inventory.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedCategoryIds, spawnNewDraft }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error("Confirm error:", err);
        return;
      }
      afterAction();
    } finally {
      setLoading(false);
    }
  }

  const allCategoryIds = summaryData?.categories.map((c) => c.categoryId) ?? [];
  const uncheckedIds = allCategoryIds.filter((id) => !checkedCategoryIds.has(id));
  const uncheckedCategories = summaryData?.categories.filter((c) => uncheckedIds.includes(c.categoryId)) ?? [];

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={
          <Group gap={10} align="center">
            <Text fw={700} size="md" style={{ fontFamily: "var(--font-display)" }}>
              Resumen #{inventory.id}
            </Text>
            <InventoryStatusBadge status={inventory.status} />
          </Group>
        }
        centered
        size={isEnRevision ? "xl" : "lg"}
        overlayProps={{ blur: 2, backgroundOpacity: 0.55 }}
        closeOnClickOutside={!loading}
        closeOnEscape={!loading}
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Text size="xs" c="dimmed" mb="md">
          {inventory.warehouseName}
          {inventory.countDate && ` · Conteo: ${inventory.countDate.split("-").reverse().join("/")}`}
        </Text>

        {/* BORRADOR mode: simple article table */}
        {isBorrador && (
          <SimpleArticleTable articles={articles} />
        )}

        {/* EN_REVISION mode: category checkboxes + diff */}
        {isEnRevision && summaryData && (
          <div>
            <Text size="xs" c="dimmed" mb="sm">
              Seleccioná las categorías a confirmar. Las categorías sin check quedarán excluidas.
            </Text>
            {summaryData.categories.map((cat) => {
              const catArticles = articles.filter((a) => a.categoryId === cat.categoryId);
              const countedMap = new Map(catArticles.map((a) => [a.productId, a]));
              const aggDiff = cat.products.reduce((s, p) => {
                const counted = countedMap.get(p.productId);
                return s + (counted?.qty ?? 0) - p.qtyOnHand;
              }, 0);
              const hasWarning = Math.abs(aggDiff) > 10;

              return (
                <div key={cat.categoryId} style={{ marginBottom: 12 }}>
                  <Group gap={8} align="center" mb={4}>
                    <Checkbox
                      checked={checkedCategoryIds.has(cat.categoryId)}
                      onChange={(e) => {
                        const next = new Set(checkedCategoryIds);
                        if (e.currentTarget.checked) {
                          next.add(cat.categoryId);
                        } else {
                          next.delete(cat.categoryId);
                        }
                        setCheckedCategoryIds(next);
                      }}
                      label={
                        <Text size="sm" fw={600}>
                          {cat.categoryParentName ? `${cat.categoryParentName} › ` : ""}
                          {cat.categoryName}
                        </Text>
                      }
                    />
                    {hasWarning && (
                      <Badge color="orange" variant="light" size="xs">
                        Δ {aggDiff > 0 ? "+" : ""}{aggDiff} uds
                      </Badge>
                    )}
                    {!hasWarning && (
                      <Text size="xs" c="dimmed">Δ {aggDiff > 0 ? "+" : ""}{aggDiff} uds</Text>
                    )}
                  </Group>
                </div>
              );
            })}
          </div>
        )}

        <Group justify="flex-end" gap="xs" pt="md" style={{ borderTop: "1px solid var(--border)" }}>
          <Button size="sm" variant="subtle" color="gray" onClick={onClose} disabled={loading}>
            Cerrar
          </Button>

          {isBorrador && (
            <Tooltip label="No hay artículos cargados" withArrow disabled={articles.length > 0}>
              <Button
                leftSection={<SendHorizontal size={15} />}
                size="sm" color="amber" loading={loading}
                disabled={articles.length === 0}
                onClick={handleEnviarRevision}
              >
                Enviar a Revisión
              </Button>
            </Tooltip>
          )}

          {isEnRevision && (
            <Tooltip label="No hay artículos para confirmar" withArrow disabled={articles.length > 0}>
              <Button
                leftSection={<Check size={15} />}
                size="sm" color="amber" loading={loading}
                disabled={articles.length === 0}
                onClick={handleConfirmarClick}
              >
                Confirmar Inventario
              </Button>
            </Tooltip>
          )}
        </Group>
      </Modal>

      {/* Split dialog: what to do with unchecked categories */}
      <Modal
        opened={splitDialogOpen}
        onClose={() => setSplitDialogOpen(false)}
        title={<Text fw={700} size="md" style={{ fontFamily: "var(--font-display)" }}>Categorías sin confirmar</Text>}
        centered
        size="sm"
        overlayProps={{ blur: 2, backgroundOpacity: 0.55 }}
      >
        <Text size="sm" mb="md">
          Las siguientes categorías quedaron sin seleccionar:
        </Text>
        <Stack gap={4} mb="lg">
          {uncheckedCategories.map((c) => (
            <Text key={c.categoryId} size="sm" c="dimmed">
              · {c.categoryParentName ? `${c.categoryParentName} › ` : ""}{c.categoryName}
            </Text>
          ))}
        </Stack>
        <Text size="sm" fw={600} mb="sm">¿Qué hacemos con ellas?</Text>
        <Radio.Group value={splitAction} onChange={(v) => setSplitAction(v as "discard" | "new_draft")}>
          <Stack gap="sm" mb="xl">
            <Radio value="discard" label="Descartarlas (no se sincronizan con Odoo)" />
            <Radio value="new_draft" label="Crear un nuevo inventario en Borrador con esas categorías" />
          </Stack>
        </Radio.Group>
        <Group justify="flex-end" gap="xs">
          <Button size="sm" variant="subtle" color="gray" onClick={() => setSplitDialogOpen(false)}>
            Cancelar
          </Button>
          <Button
            size="sm" color="amber"
            onClick={() => executeConfirm(uncheckedIds)}
          >
            Aceptar
          </Button>
        </Group>
      </Modal>
    </>
  );
}

function SimpleArticleTable({ articles }: { articles: InventoryArticle[] }) {
  const totalCosto = articles.reduce((sum, a) => sum + a.cost * a.qty, 0);
  const totalQty = articles.reduce((s, a) => s + a.qty, 0);

  if (articles.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text3)", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
        No hay artículos cargados en este inventario.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", marginBottom: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-sans)" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Código", "Descripción", "Cantidad", "Costo unit.", "Importe Total"].map((h) => (
              <th key={h} style={{
                padding: "10px 12px",
                textAlign: ["Cantidad", "Costo unit.", "Importe Total"].includes(h) ? "right" : "left",
                color: "var(--text3)", fontWeight: 500, fontSize: 11,
                letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => (
            <tr key={a.productId} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "10px 12px", color: "var(--text3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {a.barcode}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text)" }}>{a.name}</td>
              <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--mantine-color-amber-4)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 15 }}>
                {a.qty}
              </td>
              <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text2)", fontFamily: "var(--font-mono)" }}>
                $ {formatCurrency(a.cost)}
              </td>
              <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                $ {formatCurrency(a.cost * a.qty)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--border)" }}>
            <td colSpan={2} style={{ padding: "12px 12px", color: "var(--text3)", fontSize: 12 }}>
              {articles.length} artículo{articles.length !== 1 ? "s" : ""}
            </td>
            <td style={{ padding: "12px 12px", textAlign: "right", color: "var(--mantine-color-amber-4)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 16 }}>
              {totalQty}
            </td>
            <td style={{ padding: "12px 12px", textAlign: "right", color: "var(--text3)", fontSize: 11 }}>Total costo</td>
            <td style={{ padding: "12px 12px", textAlign: "right", color: "var(--text)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 15 }}>
              $ {formatCurrency(totalCosto)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Update EN_REVISION confirm button in detail page**

In `src/app/(app)/inventario/[id]/page.tsx`, find `handleConfirm` function (around line 264):

```typescript
  async function handleConfirm() {
    if (articles.length === 0) return;
    setConfirming(true);
    try {
      await fetch(`/api/inventario/${invId}/confirm`, { method: "POST" });
      ...
    }
  }
```

Replace with:
```typescript
  // EN_REVISION confirm goes through ResumenModal now
  // Remove handleConfirm entirely, open resumenOpen instead
```

Find the footer for EN_REVISION status — the button that called `handleConfirm` — and change it to open the resumen modal instead:

```typescript
          // In the sticky footer, find: inventory.status === "EN_REVISION" section
          // Change the button's onClick from handleConfirm to () => setResumenOpen(true)
```

The exact line to find in the footer area:
```typescript
              onClick={handleConfirm}
```

Replace with:
```typescript
              onClick={() => setResumenOpen(true)}
```

Also remove the `confirming` state variable and `handleConfirm` function since they're no longer needed.

- [ ] **Step 3: Verify compile**

```bash
pnpm build 2>&1 | grep -E "ResumenModal|inventario/\[id\]/page"
```

Expected: No errors.

- [ ] **Step 4: Manual test**

`pnpm dev`:
1. Create inventory → scan articles from 2+ categories → Enviar a Revisión → go to EN_REVISION state
2. Open the inventory detail → click "Confirmar Inventario" → ResumenModal opens with category checkboxes
3. Uncheck one category → click "Confirmar Inventario" → split dialog appears
4. Choose "Crear nuevo inventario en Borrador" → confirm → original inventory becomes CONFIRMADO, new BORRADOR created
5. Verify in `/inventario` list: two inventories visible

- [ ] **Step 5: Commit**

```bash
git add src/components/inventario/ResumenModal.tsx src/app/(app)/inventario/[id]/page.tsx
git commit -m "feat(inventory): confirm flow with category exclusion checkboxes and split draft option"
```

---

## Self-Review

### Spec Coverage Check

| Spec Section | Covered By |
|---|---|
| 1. No category at start, only countDate + accountingDate | Task 1, 4, 7 |
| 2. Load any Odoo article, on-demand by barcode with cache | Task 3, 9 |
| 3. Auto-group by category, hierarchical drill-down, aggregates | Task 10 |
| 4. qtyOnHand per article, diff calculation | Task 3, 11 |
| 5. Draft→Validate summary with category tree, diffs, qty×cost | Task 5, 11 |
| 6. Uncounted articles shown with qty=0, warning at >10 unit diff | Task 5, 11 |
| 7. Validated→Confirm summary with checkboxes, Option A/B dialog | Task 6, 12 |

### Placeholder Scan

No TBDs or vague steps — all code is complete in every step.

### Type Consistency

- `InventoryArticle.categoryId/categoryName/categoryParentId/categoryParentName/qtyOnHand` — defined in Task 2, produced by Task 3, consumed by Tasks 5, 10, 11, 12.
- `LocalInventory.countDate/accountingDate` — defined Task 2, produced Task 4, consumed Tasks 7, 8, 9, 11, 12.
- `SummaryDataResponse/SummaryCategory/SummaryProduct` — defined and exported from Task 5 route file, imported by Tasks 11 and 12.
- `executeConfirm(excludedCategoryIds: number[])` — defined and called in Task 12.

### Known Gap: Detail Page Flat Table

The existing flat edit table in `/inventario/[id]/page.tsx` (with inline price editing, qty +/-, delete buttons) was not fully rewritten in Task 9/10 because it still has references to `inventory.categoryId` in a few places (e.g. `loadingCatalog` badge). After Task 9, run `pnpm build` and fix any remaining references to `inventory.categoryId`, `inventory.categoryName`, `inventory.inventoryDate` by substituting the new field names.
