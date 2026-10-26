# Local DB Orders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct-Odoo OC creation/edit with a local MySQL DB layer; "Confirmar Orden" is the only action that touches Odoo.

**Architecture:** MySQL via Prisma v7 stores orders as scalar header fields + `articles JSON`. A shared lib (`odooOrderCreation.ts`) encapsulates all Odoo calls, called only from the `/confirm` endpoint. The UI gets a persistent sidebar layout and AG Grid lists.

**Tech Stack:** Next.js 16 App Router · Prisma v7 · MySQL 8 · AG Grid Community v35 · Mantine 9 · TypeScript 5

## Global Constraints

- Prisma v7: datasource in `prisma.config.ts`, not in `schema.prisma`
- Generated client output: `prisma/generated/client` (import from there, not `@prisma/client`)
- No test framework — verification via `pnpm build` (TypeScript) + `curl` for APIs + browser for UI
- AG Grid Community (no enterprise license needed)
- All new API routes verify JWT via `src/lib/auth.ts:verifyToken()` — same pattern as existing routes
- `Article[]` persisted in DB **without** `base64` and `previewUrl` on `ProductImage` fields
- Existing types in `src/types/index.ts` are extended, never broken
- Lucide React for icons (already installed)
- Dark theme (Mantine dark + amber primary) — follow existing CSS vars `--bg`, `--surface`, `--border`, `--text`

---

## File Map

### New files
```
prisma/
  schema.prisma                          — Prisma model (no datasource block)
  config.ts  →  prisma.config.ts         — datasource + migrations config
  generated/client/                      — auto-generated, never edit

src/
  lib/
    prisma.ts                            — PrismaClient singleton
    odooOrderCreation.ts                 — extracted Odoo creation logic (from POST /api/orders)
    orderValidation.ts                   — strict validation for confirm (shared lib+UI)
    localOrders.ts                       — DB helpers: stripImagesForDB, restorePreviewUrls
    imageStorage.ts                      — temp file upload/delete on VPS filesystem

  app/
    (app)/
      layout.tsx                         — NEW: sidebar + content layout (replaces per-page headers)
      orders/
        page.tsx                         — REWRITE: AG Grid list from local DB
        [id]/edit/page.tsx               — REWRITE: edit local draft (not Odoo)
      odoo-orders/
        page.tsx                         — NEW: AG Grid Odoo read-only list

    api/
      local-orders/
        route.ts                         — GET list, POST create
        [id]/
          route.ts                       — GET, PUT, DELETE
          confirm/route.ts               — POST confirm → Odoo
          duplicate/route.ts             — POST duplicate → new DRAFT
          images/route.ts                — POST upload temp images

  components/
    layout/
      Sidebar.tsx                        — sidebar nav (items, collapse, active state)
    orders/
      OrdersTable.tsx                    — shared AG Grid wrapper (used by /orders + /odoo-orders)
      OrderFormFooter.tsx                — sticky footer: Guardar borrador + Confirmar Orden
      OrderProgressModal.tsx             — progress + result modals (shared new/edit)
      DraftWarningModal.tsx              — "campos incompletos" modal con "Guardar igual"
      ErrorDetailModal.tsx               — modal muestra error_detail de orden ERROR
```

### Modified files
```
src/
  types/index.ts                         — add LocalOrder, OrderStatus, LocalProductImage types
  app/(app)/orders/new/page.tsx          — debounce 1500→5000ms, use OrderFormFooter
  app/api/orders/[id]/route.ts           — REMOVE PATCH export
  components/orders/OrderGrid.tsx        — add onSaveDraft prop, remove onSaveChanges (Odoo edit)
```

### Deleted logic (not files — just exports)
```
src/app/api/orders/[id]/route.ts         — export async function PATCH (remove)
```

---

## Task 1: Prisma v7 setup + MySQL connection

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma.config.ts`
- Create: `src/lib/prisma.ts`
- Modify: `package.json` (add deps)
- Modify: `.env` (add DATABASE_URL)

**Interfaces:**
- Produces: `prisma` export from `src/lib/prisma.ts` — used by all API routes

- [ ] **Step 1: Install Prisma v7**

```bash
pnpm add prisma@latest @prisma/client@latest
```

- [ ] **Step 2: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "./generated/client"
}

enum OrderStatus {
  DRAFT
  CONFIRMED
  ERROR
}

model Order {
  id            Int         @id @default(autoincrement())
  status        OrderStatus @default(DRAFT)
  odooOrderId   Int?        @map("odoo_order_id")
  odooOrderName String?     @map("odoo_order_name")
  errorDetail   String?     @db.Text @map("error_detail")
  supplierId    Int         @map("supplier_id")
  supplierName  String      @map("supplier_name")
  date          String
  warehouseIds  Json        @map("warehouse_ids")
  articles      Json
  printColumns  Json        @map("print_columns")
  printValues   Json        @map("print_values")
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  @@map("orders")
}
```

- [ ] **Step 3: Create `prisma.config.ts`**

```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

- [ ] **Step 4: Add DATABASE_URL to `.env`**

```
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/casa_sonia_compras"
```

Replace USER/PASSWORD/HOST with the VPS MySQL container values.

- [ ] **Step 5: Run migration**

```bash
pnpm prisma migrate dev --name init
```

Expected: `✔ Generated Prisma Client` + migration file created in `prisma/migrations/`.

- [ ] **Step 6: Create `src/lib/prisma.ts`**

```typescript
import { PrismaClient } from "../../prisma/generated/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no errors related to Prisma imports.

- [ ] **Step 8: Commit**

```bash
git add prisma/ prisma.config.ts src/lib/prisma.ts package.json pnpm-lock.yaml
git commit -m "feat: add Prisma v7 + MySQL schema for local orders"
```

---

## Task 2: Type extensions

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `LocalOrder`, `LocalProductImage`, `OrderStatus` — used by API routes and UI

- [ ] **Step 1: Add types to `src/types/index.ts`**

Append at the end of the file (do not modify existing types):

```typescript
// ─── Local DB order types ─────────────────────────────────────────────────────

export type OrderStatus = "DRAFT" | "CONFIRMED" | "ERROR";

// ProductImage as stored in DB: no base64/previewUrl for new images
export interface LocalProductImage {
  id: string;
  fileName: string;
  mimeType: string;
  isFromOdoo: boolean;
  odooId?: number;
  tempPath?: string;   // "/uploads/temp/[orderId]/[uuid].ext" — set after explicit save
  // base64 and previewUrl are NEVER stored in DB
}

export type LocalColorImages = Record<string, LocalProductImage[]>;

// Article as stored in DB — same as Article but colorImages uses LocalProductImage
export interface LocalArticle extends Omit<Article, "colorImages"> {
  colorImages: LocalColorImages;
}

export interface LocalOrder {
  id: number;
  status: OrderStatus;
  odooOrderId: number | null;
  odooOrderName: string | null;
  errorDetail: string | null;
  supplierId: number;
  supplierName: string;
  date: string;
  warehouseIds: number[];
  articles: LocalArticle[];
  printColumns: PrintColumn[];
  printValues: PrintValues;
  createdAt: string;
  updatedAt: string;
}

export interface LocalOrderSummary {
  id: number;
  status: OrderStatus;
  odooOrderId: number | null;
  odooOrderName: string | null;
  errorDetail: string | null;
  supplierId: number;
  supplierName: string;
  date: string;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add LocalOrder, LocalArticle, OrderStatus types"
```

---

## Task 3: Shared libs — image stripping, validation, temp storage

**Files:**
- Create: `src/lib/localOrders.ts`
- Create: `src/lib/orderValidation.ts`
- Create: `src/lib/imageStorage.ts`

**Interfaces:**
- Produces:
  - `stripImagesForDB(articles: Article[]): LocalArticle[]`
  - `restorePreviewUrls(articles: LocalArticle[]): Article[]` (best-effort, no Odoo calls)
  - `validateForDraft(order): ValidationResult` — returns missing fields list
  - `validateForConfirm(order): ValidationResult` — strict, must pass for confirm
  - `saveTempImages(orderId, files): Promise<string[]>` — saves to `/uploads/temp/[id]/`
  - `deleteTempFolder(orderId): Promise<void>`

- [ ] **Step 1: Create `src/lib/localOrders.ts`**

```typescript
import type { Article, LocalArticle, LocalProductImage, ProductImage } from "@/types";

/**
 * Strip base64 and previewUrl from ProductImage before saving to DB.
 * Preserves isFromOdoo, odooId, tempPath, fileName, mimeType, id.
 */
export function stripImagesForDB(articles: Article[]): LocalArticle[] {
  return articles.map((article) => ({
    ...article,
    colorImages: Object.fromEntries(
      Object.entries(article.colorImages).map(([colorName, images]) => [
        colorName,
        images.map(
          (img): LocalProductImage => ({
            id: img.id,
            fileName: img.fileName,
            mimeType: img.mimeType,
            isFromOdoo: img.isFromOdoo ?? false,
            odooId: img.odooId,
            tempPath: (img as LocalProductImage).tempPath,
          }),
        ),
      ]),
    ),
  }));
}

/**
 * Restore previewUrl for isFromOdoo images using their odooId.
 * New images (not isFromOdoo, no tempPath) have no preview until re-uploaded.
 * This runs client-side or in GET handler — no Odoo calls here.
 */
export function restorePreviewUrls(articles: LocalArticle[]): Article[] {
  return articles.map((article) => ({
    ...article,
    colorImages: Object.fromEntries(
      Object.entries(article.colorImages).map(([colorName, images]) => [
        colorName,
        images.map(
          (img): ProductImage => ({
            id: img.id,
            fileName: img.fileName,
            mimeType: img.mimeType,
            isFromOdoo: img.isFromOdoo,
            odooId: img.odooId,
            base64: "",        // empty — UI will show placeholder
            previewUrl: "",    // empty — UI will show placeholder
          }),
        ),
      ]),
    ),
  }));
}
```

- [ ] **Step 2: Create `src/lib/orderValidation.ts`**

```typescript
import type { LocalArticle } from "@/types";

export interface ValidationResult {
  valid: boolean;
  missing: string[];   // human-readable list of missing fields
}

interface OrderData {
  supplierId: number | null;
  date: string | null;
  articles: LocalArticle[];
}

/**
 * Draft validation — permissive. Returns list of missing fields for UI warning modal.
 * An empty missing[] means the order is complete.
 */
export function validateForDraft(order: OrderData): ValidationResult {
  const missing: string[] = [];

  if (!order.supplierId) missing.push("Proveedor no seleccionado");
  if (!order.date) missing.push("Fecha no seleccionada");
  if (order.articles.length === 0) missing.push("Sin artículos");

  for (const article of order.articles) {
    const label = article.name || "(artículo sin nombre)";
    if (!article.category) missing.push(`"${label}": falta categoría`);
    if (!article.sizeAttributeId) missing.push(`"${label}": falta tipo de talle`);
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Strict validation for confirm — must pass 100% or confirm is blocked.
 */
export function validateForConfirm(order: OrderData): ValidationResult {
  const base = validateForDraft(order);
  const missing = [...base.missing];

  for (const article of order.articles) {
    const label = article.name || "(artículo sin nombre)";

    if (!article.name) missing.push(`Artículo sin nombre`);

    const hasQty = article.rows.some((row) =>
      article.sizes.some((size) => parseInt(row.quantities[size.name] || "0") > 0),
    );
    if (!hasQty) missing.push(`"${label}": sin cantidades cargadas`);

    for (const row of article.rows) {
      if (!row.color) continue;
      if (row.color.isNew) {
        if (!row.color.colorBase)
          missing.push(`"${label}" color "${row.color.name}": falta Color Base`);
        if (!row.color.hexColor)
          missing.push(`"${label}" color "${row.color.name}": falta color HEX`);
      }
    }
  }

  return { valid: missing.length === 0, missing };
}
```

- [ ] **Step 3: Create `src/lib/imageStorage.ts`**

```typescript
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";

const TEMP_BASE = join(process.cwd(), "uploads", "temp");

export function getTempDir(orderId: number): string {
  return join(TEMP_BASE, String(orderId));
}

export function getTempPublicPath(orderId: number, filename: string): string {
  return `/uploads/temp/${orderId}/${filename}`;
}

/**
 * Save a single image file to /uploads/temp/[orderId]/[filename].
 * Returns the server path stored in LocalProductImage.tempPath.
 */
export async function saveTempImage(
  orderId: number,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = getTempDir(orderId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return getTempPublicPath(orderId, filename);
}

/**
 * Delete the entire temp folder for an order (called after successful confirm).
 */
export async function deleteTempFolder(orderId: number): Promise<void> {
  try {
    await rm(getTempDir(orderId), { recursive: true, force: true });
  } catch {
    // best-effort: log but don't throw
    console.error(`Failed to delete temp folder for order ${orderId}`);
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/localOrders.ts src/lib/orderValidation.ts src/lib/imageStorage.ts
git commit -m "feat: add shared libs for local order DB ops, validation, temp image storage"
```

---

## Task 4: Extract Odoo order creation to shared lib

**Files:**
- Create: `src/lib/odooOrderCreation.ts`

**Interfaces:**
- Consumes: `Article[]`, `supplierId`, `date`, `warehouseIds`, `selectedWarehouses`, `printColumns`, `printValues` from caller
- Produces: `createOrderInOdoo(params): Promise<OdooCreationResult>`

```typescript
export interface OdooCreationResult {
  purchaseOrderId: number;
  purchaseOrderName: string;
  imageSyncData: ImageSyncEntry[];
}

export interface ImageSyncEntry {
  articleId: string;
  templateId: number;
  resolvedColors: ResolvedAttributeValue[];
  variantMap: [string, number][];
}
```

- [ ] **Step 1: Create `src/lib/odooOrderCreation.ts`**

Extract the creation logic from `src/app/api/orders/route.ts` (POST handler, lines ~95–449). The function receives all inputs and returns `OdooCreationResult` or throws on error. Keep rollback logic inside.

The key improvement vs current code: **if `button_confirm` fails, unlink the just-created `purchase.order`.**

```typescript
import { odoo } from "@/lib/odoo";
import { generateGridPDF } from "@/lib/pdf";
import type { Article, ArticleRow, PrintColumn, PrintValues, Warehouse } from "@/types";
import {
  resolveAttributeValues,
  resolveOrCreateColors,
  createOrUpdateSupplierInfo,
  createOrUpdatePricelistItem,
  getOrCreateProduct,
  getVariants,
  mapVariantToColorSize,
  type ResolvedAttributeValue,
} from "@/lib/odooProducts";

export interface OdooCreationResult {
  purchaseOrderId: number;
  purchaseOrderName: string;
  imageSyncData: ImageSyncEntry[];
}

export interface ImageSyncEntry {
  articleId: string;
  templateId: number;
  resolvedColors: ResolvedAttributeValue[];
  variantMap: [string, number][];
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function createOrderInOdoo(params: {
  supplierId: number;
  date: string;
  articles: Article[];
  warehouseIds: number[];
  printColumns: PrintColumn[];
  printValues: PrintValues;
  selectedWarehouses: Warehouse[];
}): Promise<OdooCreationResult> {
  const { supplierId, date, articles, warehouseIds, printColumns, printValues, selectedWarehouses } = params;

  // Normalize names
  for (const article of articles) {
    article.name = toTitleCase(article.name);
    for (const row of article.rows) {
      if (row.color?.name) row.color.name = toTitleCase(row.color.name);
    }
  }

  // Resolve color attribute ID
  const colorAttrs = await odoo.searchRead("product.attribute", [["name", "ilike", "Color"]], ["id", "name"]);
  const colorAttr = colorAttrs.find((a: { name: string }) => a.name.toLowerCase().includes("color"));
  if (!colorAttr) throw new Error('Atributo "Color" no encontrado en Odoo');
  const colorAttributeId: number = colorAttr.id;

  // Validation + resolution pass
  const resolvedArticles: { article: Article; resolvedColors: ResolvedAttributeValue[]; resolvedSizes: ResolvedAttributeValue[] }[] = [];

  for (const article of articles) {
    if (!article.sizeAttributeId)
      throw new Error(`"${article.name}": sin tipo de talle seleccionado`);

    for (const row of article.rows) {
      if (!row.color?.isNew) continue;
      if (!row.color.colorBase) throw new Error(`Color "${row.color.name}" en "${article.name}": falta Color Base`);
      if (!row.color.hexColor) throw new Error(`Color "${row.color.name}" en "${article.name}": falta color HEX`);
    }

    const colorIdMap = await resolveOrCreateColors(article.rows, colorAttributeId);
    const resolvedColors: ResolvedAttributeValue[] = [...colorIdMap.entries()].map(([name, id]) => ({ id, name }));
    const { resolved: resolvedSizes } = await resolveAttributeValues(article.sizes, article.sizeAttributeId);

    resolvedArticles.push({ article, resolvedColors, resolvedSizes });
  }

  // Creation pass
  const createdProductIds: number[] = [];
  const createdSupplierInfoIds: number[] = [];
  const createdPricelistItemIds: number[] = [];
  const allOrderLines: [number, number, object][] = [];
  const articleVariantMaps = new Map<string, { variantMap: Map<string, number>; resolvedColors: ResolvedAttributeValue[]; templateId: number }>();

  try {
    for (const { article, resolvedColors, resolvedSizes } of resolvedArticles) {
      const templateId = await getOrCreateProduct(article, resolvedColors, resolvedSizes, colorAttributeId, article.sizeAttributeId!);
      if (!article.existingProductId) createdProductIds.push(templateId);

      const costPrice = parseFloat(article.price) || 0;
      const salePrice = parseFloat(article.salePrice) || 0;
      const totalQty = article.rows.reduce(
        (sum, row) => sum + article.sizes.reduce((s2, size) => {
          const q = warehouseIds.length > 0
            ? warehouseIds.reduce((ws, wId) => ws + (parseInt(row.warehouseQuantities?.[`${wId}:${size.name}`] || "0") || 0), 0)
            : parseInt(row.quantities[size.name] || "0");
          return s2 + (isNaN(q) ? 0 : q);
        }, 0),
        0,
      );

      const supplierInfoId = await createOrUpdateSupplierInfo(templateId, supplierId, costPrice, totalQty);
      if (supplierInfoId) createdSupplierInfoIds.push(supplierInfoId);
      const pricelistItemId = await createOrUpdatePricelistItem(templateId, salePrice);
      if (pricelistItemId) createdPricelistItemIds.push(pricelistItemId);

      const variants = await getVariants(templateId);
      const variantMap = await mapVariantToColorSize(variants, resolvedColors, resolvedSizes, colorAttributeId, article.sizeAttributeId!);
      articleVariantMaps.set(article.id, { variantMap, resolvedColors, templateId });

      for (const row of article.rows as ArticleRow[]) {
        for (const size of article.sizes) {
          const qty = warehouseIds.length > 0
            ? warehouseIds.reduce((sum, wId) => sum + (parseInt(row.warehouseQuantities?.[`${wId}:${size.name}`] || "0") || 0), 0)
            : parseInt(row.quantities[size.name] || "0");
          if (qty <= 0) continue;

          const resolvedSize = resolvedSizes.find((s) => s.name === size.name);
          if (!resolvedSize) continue;
          const resolvedColor = row.color ? resolvedColors.find((c) => c.name === row.color!.name) : null;
          const key = resolvedColor ? `${resolvedColor.id}:${resolvedSize.id}` : `:${resolvedSize.id}`;
          const variantId = variantMap.get(key);
          if (!variantId) continue;

          const priceUnit = article.priceGranular && row.prices?.[size.name]
            ? parseFloat(row.prices[size.name])
            : parseFloat(article.price) || 0;

          allOrderLines.push([0, 0, { product_id: variantId, product_qty: qty, price_unit: priceUnit }]);
        }
      }
    }

    if (allOrderLines.length === 0) throw new Error("Sin variantes para las cantidades ingresadas");

    // Create purchase.order
    const purchaseOrderId = await odoo.create("purchase.order", {
      partner_id: supplierId,
      date_order: date,
      order_line: allOrderLines,
      ...(warehouseIds.length > 0 ? { x_studio_sucursal: [[6, 0, warehouseIds]] } : {}),
    });

    // Confirm — if this fails, unlink the order (improvement over original code)
    try {
      await odoo.call("purchase.order", "button_confirm", { ids: purchaseOrderId });
    } catch (confirmErr) {
      try { await odoo.unlink("purchase.order", [purchaseOrderId]); } catch { /* best-effort */ }
      throw confirmErr;
    }

    const orderData = await odoo.searchRead("purchase.order", [["id", "=", purchaseOrderId]], ["name", "partner_id", "date_order"]);

    // PDFs — best-effort, don't fail confirm
    try {
      const safeName = `OC-${String(orderData[0].name).replace(/\//g, "-")}`;
      const [supplierPdf, internalPdf] = await Promise.all([
        generateGridPDF({ order: orderData[0], articles, printColumns, printValues, selectedWarehouses, supplierMode: true }),
        generateGridPDF({ order: orderData[0], articles, printColumns, printValues, selectedWarehouses, supplierMode: false }),
      ]);
      await Promise.all([
        odoo.create("ir.attachment", { name: `${safeName}.pdf`, type: "binary", datas: Buffer.from(supplierPdf).toString("base64"), res_model: "purchase.order", res_id: purchaseOrderId, mimetype: "application/pdf" }),
        odoo.create("ir.attachment", { name: `${safeName}-INT.pdf`, type: "binary", datas: Buffer.from(internalPdf).toString("base64"), res_model: "purchase.order", res_id: purchaseOrderId, mimetype: "application/pdf" }),
      ]);
    } catch (pdfErr) {
      console.error("PDF generation failed (non-fatal):", pdfErr);
    }

    const imageSyncData: ImageSyncEntry[] = resolvedArticles
      .map(({ article }) => {
        const maps = articleVariantMaps.get(article.id);
        if (!maps) return null;
        return { articleId: article.id, templateId: maps.templateId, resolvedColors: maps.resolvedColors, variantMap: [...maps.variantMap.entries()] };
      })
      .filter(Boolean) as ImageSyncEntry[];

    return { purchaseOrderId, purchaseOrderName: orderData[0]?.name || `P/${purchaseOrderId}`, imageSyncData };

  } catch (error) {
    // Rollback products/supplier info/pricelist
    if (createdPricelistItemIds.length > 0) {
      try { await odoo.unlink("product.pricelist.item", createdPricelistItemIds); } catch { /* log */ }
    }
    if (createdSupplierInfoIds.length > 0) {
      try { await odoo.unlink("product.supplierinfo", createdSupplierInfoIds); } catch { /* log */ }
    }
    if (createdProductIds.length > 0) {
      try { await odoo.unlink("product.template", createdProductIds); } catch { /* log */ }
    }
    throw error;
  }
}
```

- [ ] **Step 2: Simplify `src/app/api/orders/route.ts` POST handler**

Replace the POST body with a call to `createOrderInOdoo`:

```typescript
// src/app/api/orders/route.ts — POST handler (replace existing POST function body)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { supplierId, date, articles, warehouseIds = [], printColumns = [], printValues = {}, selectedWarehouses = [] } = body;

  try {
    const result = await createOrderInOdoo({ supplierId, date, articles, warehouseIds, printColumns, printValues, selectedWarehouses });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error creating order" },
      { status: 500 },
    );
  }
}
```

Add import at top of that file:

```typescript
import { createOrderInOdoo } from "@/lib/odooOrderCreation";
```

Remove all the inlined creation logic that was previously in POST (now in the lib).

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm build
```

Expected: no errors. POST /api/orders still works the same way externally.

- [ ] **Step 4: Verify POST /api/orders still works**

```bash
# Quick smoke test — expects a real Odoo connection
curl -s -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"supplierId":1,"date":"2026-06-27","articles":[]}' | jq .
```

Expected: `{"error":"Sin variantes para las cantidades ingresadas"}` (correct — empty articles)

- [ ] **Step 5: Commit**

```bash
git add src/lib/odooOrderCreation.ts src/app/api/orders/route.ts
git commit -m "refactor: extract Odoo order creation to shared lib, improve button_confirm rollback"
```

---

## Task 5: Local orders CRUD API

**Files:**
- Create: `src/app/api/local-orders/route.ts`
- Create: `src/app/api/local-orders/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/prisma.ts`, `stripImagesForDB` from `src/lib/localOrders.ts`
- Produces: REST endpoints consumed by UI

- [ ] **Step 1: Create `src/app/api/local-orders/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripImagesForDB } from "@/lib/localOrders";
import type { Article, PrintColumn, PrintValues } from "@/types";

export async function GET(request: NextRequest) {
  if (!await verifyToken(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const supplierId = searchParams.get("supplier_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const limit = parseInt(searchParams.get("limit") || "30");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (supplierId) where.supplierId = parseInt(supplierId);
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true, status: true, odooOrderId: true, odooOrderName: true,
        errorDetail: true, supplierId: true, supplierName: true, date: true,
        articles: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.order.count({ where }),
  ]);

  // Compute articleCount from JSON
  const summaries = orders.map((o) => ({
    ...o,
    articleCount: Array.isArray(o.articles) ? (o.articles as unknown[]).length : 0,
    articles: undefined, // strip from list response
    errorDetail: o.status === "ERROR" ? o.errorDetail : null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }));

  return NextResponse.json({ orders: summaries, total });
}

export async function POST(request: NextRequest) {
  if (!await verifyToken(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    supplierId: number;
    supplierName: string;
    date: string;
    articles: Article[];
    warehouseIds: number[];
    printColumns: PrintColumn[];
    printValues: PrintValues;
  };

  const order = await prisma.order.create({
    data: {
      supplierId: body.supplierId,
      supplierName: body.supplierName,
      date: body.date,
      warehouseIds: body.warehouseIds ?? [],
      articles: stripImagesForDB(body.articles) as unknown as object,
      printColumns: (body.printColumns ?? []) as unknown as object,
      printValues: (body.printValues ?? {}) as unknown as object,
    },
  });

  return NextResponse.json({ id: order.id }, { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/local-orders/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripImagesForDB, restorePreviewUrls } from "@/lib/localOrders";
import type { Article, LocalArticle, PrintColumn, PrintValues } from "@/types";

async function getOrder(id: number) {
  return prisma.order.findUnique({ where: { id } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await verifyToken(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const order = await getOrder(orderId);
  if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

  const articles = restorePreviewUrls(order.articles as unknown as LocalArticle[]);

  return NextResponse.json({
    ...order,
    articles,
    warehouseIds: order.warehouseIds as number[],
    printColumns: order.printColumns as PrintColumn[],
    printValues: order.printValues as PrintValues,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await verifyToken(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const order = await getOrder(orderId);
  if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  if (order.status === "CONFIRMED") return NextResponse.json({ error: "No se puede editar una orden confirmada" }, { status: 409 });

  const body = await request.json() as {
    supplierId?: number;
    supplierName?: string;
    date?: string;
    articles?: Article[];
    warehouseIds?: number[];
    printColumns?: PrintColumn[];
    printValues?: PrintValues;
  };

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      // Reset ERROR to DRAFT on any edit
      status: order.status === "ERROR" ? "DRAFT" : order.status,
      errorDetail: order.status === "ERROR" ? null : order.errorDetail,
      ...(body.supplierId !== undefined ? { supplierId: body.supplierId } : {}),
      ...(body.supplierName !== undefined ? { supplierName: body.supplierName } : {}),
      ...(body.date !== undefined ? { date: body.date } : {}),
      ...(body.articles !== undefined ? { articles: stripImagesForDB(body.articles) as unknown as object } : {}),
      ...(body.warehouseIds !== undefined ? { warehouseIds: body.warehouseIds as unknown as object } : {}),
      ...(body.printColumns !== undefined ? { printColumns: body.printColumns as unknown as object } : {}),
      ...(body.printValues !== undefined ? { printValues: body.printValues as unknown as object } : {}),
    },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await verifyToken(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const order = await getOrder(orderId);
  if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  if (order.status === "CONFIRMED") return NextResponse.json({ error: "No se puede eliminar una orden confirmada" }, { status: 409 });

  await prisma.order.delete({ where: { id: orderId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Test endpoints**

```bash
# Start dev server
pnpm dev

# Create draft
curl -s -X POST http://localhost:3000/api/local-orders \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<your-jwt>" \
  -d '{"supplierId":1,"supplierName":"Test","date":"2026-06-27","articles":[],"warehouseIds":[],"printColumns":[],"printValues":{}}' | jq .
# Expected: {"id":1}

# List
curl -s http://localhost:3000/api/local-orders \
  -H "Cookie: token=<your-jwt>" | jq .orders[0].status
# Expected: "DRAFT"

# Get by id
curl -s http://localhost:3000/api/local-orders/1 \
  -H "Cookie: token=<your-jwt>" | jq .status
# Expected: "DRAFT"

# Update
curl -s -X PUT http://localhost:3000/api/local-orders/1 \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<your-jwt>" \
  -d '{"date":"2026-07-01"}' | jq .
# Expected: {"id":1,"status":"DRAFT"}

# Delete
curl -s -X DELETE http://localhost:3000/api/local-orders/1 \
  -H "Cookie: token=<your-jwt>" | jq .
# Expected: {"ok":true}
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/local-orders/
git commit -m "feat: add local-orders CRUD API (GET list, POST create, GET/PUT/DELETE by id)"
```

---

## Task 6: Confirm, Duplicate, Images endpoints

**Files:**
- Create: `src/app/api/local-orders/[id]/confirm/route.ts`
- Create: `src/app/api/local-orders/[id]/duplicate/route.ts`
- Create: `src/app/api/local-orders/[id]/images/route.ts`

**Interfaces:**
- Consumes: `createOrderInOdoo` from `src/lib/odooOrderCreation.ts`, `validateForConfirm` from `src/lib/orderValidation.ts`, `deleteTempFolder` from `src/lib/imageStorage.ts`

- [ ] **Step 1: Create `src/app/api/local-orders/[id]/confirm/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { restorePreviewUrls } from "@/lib/localOrders";
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
  if (!await verifyToken(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  if (order.status === "CONFIRMED") return NextResponse.json({ error: "Orden ya confirmada" }, { status: 409 });

  // Restore articles with base64 from tempPath for new images
  const localArticles = order.articles as unknown as LocalArticle[];
  const articles = restorePreviewUrls(localArticles) as Article[];

  // Load base64 for temp images from VPS filesystem
  for (const article of articles) {
    for (const images of Object.values(article.colorImages)) {
      for (const img of images) {
        const localImg = localArticles
          .flatMap((a) => Object.values(a.colorImages).flat())
          .find((li) => li.id === img.id);
        if (localImg?.tempPath && !img.isFromOdoo) {
          try {
            const absPath = join(process.cwd(), localImg.tempPath);
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
    supplierId: order.supplierId,
    date: order.date,
    articles: localArticles,
  });
  if (!validation.valid) {
    return NextResponse.json({ error: "Validación fallida", missing: validation.missing }, { status: 422 });
  }

  try {
    const result = await createOrderInOdoo({
      supplierId: order.supplierId,
      date: order.date,
      articles,
      warehouseIds: order.warehouseIds as number[],
      printColumns: order.printColumns as never,
      printValues: order.printValues as never,
      selectedWarehouses: [],
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

    // Update DB — CONFIRMED
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CONFIRMED",
        odooOrderId: result.purchaseOrderId,
        odooOrderName: result.purchaseOrderName,
        errorDetail: null,
      },
    });

    return NextResponse.json({ ok: true, odooOrderId: result.purchaseOrderId, odooOrderName: result.purchaseOrderName });

  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    await prisma.order.update({
      where: { id: orderId },
      data: { status: "ERROR", errorDetail: detail },
    });

    return NextResponse.json({ error: detail, status: "ERROR" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `src/app/api/local-orders/[id]/duplicate/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripImagesForDB } from "@/lib/localOrders";
import type { LocalArticle } from "@/types";
import { randomUUID } from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await verifyToken(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const source = await prisma.order.findUnique({ where: { id: orderId } });
  if (!source) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

  // Reset article IDs and row IDs so duplicate is fully independent
  const sourceArticles = source.articles as unknown as LocalArticle[];
  const freshArticles = sourceArticles.map((a) => ({
    ...a,
    id: randomUUID(),
    rows: a.rows.map((r) => ({
      ...r,
      id: randomUUID(),
      odooLineIds: undefined, // no Odoo line links in new draft
    })),
    deletedOdooImageIds: [],
    clearedPrimaryColorNames: [],
    // strip tempPath — images need re-upload in new draft
    colorImages: Object.fromEntries(
      Object.entries(a.colorImages).map(([color, imgs]) => [
        color,
        imgs.map((img) => ({ ...img, tempPath: undefined })),
      ]),
    ),
  }));

  const newOrder = await prisma.order.create({
    data: {
      supplierId: source.supplierId,
      supplierName: source.supplierName,
      date: source.date,
      warehouseIds: source.warehouseIds,
      articles: freshArticles as unknown as object,
      printColumns: source.printColumns,
      printValues: source.printValues,
    },
  });

  return NextResponse.json({ id: newOrder.id }, { status: 201 });
}
```

- [ ] **Step 3: Create `src/app/api/local-orders/[id]/images/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveTempImage } from "@/lib/imageStorage";
import { randomUUID } from "crypto";
import { extname } from "path";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await verifyToken(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } });
  if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  if (order.status === "CONFIRMED") return NextResponse.json({ error: "Orden confirmada" }, { status: 409 });

  const formData = await request.formData();
  const results: { imageId: string; tempPath: string }[] = [];

  for (const [, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    const ext = extname(value.name) || ".jpg";
    const filename = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await value.arrayBuffer());
    const tempPath = await saveTempImage(orderId, filename, buffer);
    results.push({ imageId: randomUUID(), tempPath });
  }

  return NextResponse.json({ results });
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

- [ ] **Step 5: Test confirm endpoint (manual)**

```bash
# Create a draft first, then confirm
curl -s -X POST http://localhost:3000/api/local-orders/1/confirm \
  -H "Cookie: token=<your-jwt>" | jq .
# With empty articles will get validation error
# Expected: {"error":"Validación fallida","missing":["Sin artículos"]}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/local-orders/[id]/confirm/ src/app/api/local-orders/[id]/duplicate/ src/app/api/local-orders/[id]/images/
git commit -m "feat: add confirm, duplicate, images endpoints for local orders"
```

---

## Task 7: Remove old PATCH endpoint

**Files:**
- Modify: `src/app/api/orders/[id]/route.ts` — remove `export async function PATCH`

- [ ] **Step 1: Delete PATCH export from `src/app/api/orders/[id]/route.ts`**

Remove lines from `export async function PATCH(` through the closing `}` of that function (lines ~576–957 in the current file). Keep `GET` and `buildOrderHeader` intact.

Also remove imports only used by PATCH:
- `watermarkPDF` from `@/lib/pdf`
- `resolveAttributeValues`, `resolveOrCreateColors`, `getOrCreateProduct`, `getVariants`, `mapVariantToColorSize`, `syncProductImages` from `@/lib/odooProducts`

(Those are only needed by PATCH. GET only uses `buildOrderHeader` and `odoo.read`.)

Also remove helper function `processNewArticle` which was only used by PATCH.

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: no errors. No remaining references to `PATCH /api/orders/[id]` in the codebase.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/orders/[id]/route.ts
git commit -m "chore: remove PATCH /api/orders/[id] — Odoo direct edit replaced by local DB + confirm"
```

---

## Task 8: Sidebar layout

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/app/(app)/layout.tsx`

**Interfaces:**
- Produces: layout wrapper consumed by all `(app)` routes

- [ ] **Step 1: Create `src/components/layout/Sidebar.tsx`**

```typescript
"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Tooltip } from "@mantine/core";
import { ClipboardList, Store, Package, Plus, ChevronLeft, ChevronRight } from "lucide-react";

const NAV_ITEMS = [
  { href: "/orders", label: "Órdenes", icon: ClipboardList },
  { href: "/odoo-orders", label: "Historial Odoo", icon: Store },
] as const;

const FUTURE_ITEMS = [
  { href: "/inventory", label: "Inventario", icon: Package, soon: true },
] as const;

const COLLAPSED_KEY = "sidebar_collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch {}
  }

  const width = collapsed ? 56 : 220;

  return (
    <aside
      style={{
        width,
        minHeight: "100vh",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        transition: "width 200ms ease",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        overflow: "hidden",
      }}
    >
      {/* Logo + toggle */}
      <div style={{ padding: collapsed ? "16px 8px" : "16px", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", borderBottom: "1px solid var(--border)" }}>
        {!collapsed && (
          <img src="/CS.png" alt="Casa Sonia" style={{ height: 28, width: "auto" }} />
        )}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 4, borderRadius: 4, display: "flex" }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nueva Orden button */}
      <div style={{ padding: collapsed ? "12px 8px" : "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <Tooltip label="Nueva Orden" disabled={!collapsed} position="right">
          <button
            onClick={() => router.push("/orders/new")}
            style={{
              width: "100%",
              background: "var(--mantine-color-amber-6)",
              color: "#000",
              border: "none",
              borderRadius: 6,
              padding: collapsed ? "8px" : "8px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: 8,
              fontWeight: 600,
              fontSize: 13,
              fontFamily: "var(--font-sans)",
            }}
          >
            <Plus size={16} />
            {!collapsed && "Nueva Orden"}
          </button>
        </Tooltip>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: collapsed ? "8px 4px" : "8px 8px" }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Tooltip key={href} label={label} disabled={!collapsed} position="right">
              <button
                onClick={() => router.push(href)}
                style={{
                  width: "100%",
                  background: active ? "color-mix(in srgb, var(--mantine-color-amber-6) 12%, transparent)" : "none",
                  border: "none",
                  borderLeft: active ? "2px solid var(--mantine-color-amber-6)" : "2px solid transparent",
                  borderRadius: active ? "0 6px 6px 0" : 6,
                  padding: collapsed ? "10px" : "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: collapsed ? "center" : "flex-start",
                  gap: 10,
                  color: active ? "var(--mantine-color-amber-4)" : "var(--text2)",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  fontFamily: "var(--font-sans)",
                  marginBottom: 2,
                  transition: "background 150ms, color 150ms",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--surface2, rgba(255,255,255,0.05))"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "none"; }}
              >
                <Icon size={16} />
                {!collapsed && label}
              </button>
            </Tooltip>
          );
        })}

        <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />

        {FUTURE_ITEMS.map(({ href, label, icon: Icon, soon }) => (
          <Tooltip key={href} label={soon ? `${label} — Próximamente` : label} disabled={!collapsed} position="right">
            <button
              disabled
              style={{
                width: "100%",
                background: "none",
                border: "none",
                borderLeft: "2px solid transparent",
                borderRadius: 6,
                padding: collapsed ? "10px" : "10px 12px",
                cursor: "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: collapsed ? "center" : "space-between",
                gap: 10,
                color: "var(--text3)",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                opacity: 0.5,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon size={16} />
                {!collapsed && label}
              </span>
              {!collapsed && soon && (
                <span style={{ fontSize: 10, background: "var(--border)", borderRadius: 4, padding: "1px 5px", color: "var(--text3)" }}>
                  Próximamente
                </span>
              )}
            </button>
          </Tooltip>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create `src/app/(app)/layout.tsx`**

```typescript
import { Sidebar } from "@/components/layout/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Remove per-page logo+nav from existing pages**

In `src/app/(app)/orders/page.tsx` and `src/app/(app)/orders/[id]/edit/page.tsx`, remove the `<img src="/CS.png">` and back-navigation from page headers since sidebar now handles navigation. Keep page-level headers for title + page-specific actions only.

- [ ] **Step 4: Verify in browser**

```bash
pnpm dev
```

Navigate to `http://localhost:3000/orders`. Expected: sidebar visible with "Órdenes" active, "Nueva Orden" button, Historial Odoo item, Inventario (disabled).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/app/(app)/layout.tsx
git commit -m "feat: add persistent sidebar layout with collapsible nav"
```

---

## Task 9: Shared UI components

**Files:**
- Create: `src/components/orders/OrderFormFooter.tsx`
- Create: `src/components/orders/OrderProgressModal.tsx`
- Create: `src/components/orders/DraftWarningModal.tsx`
- Create: `src/components/orders/ErrorDetailModal.tsx`

- [ ] **Step 1: Create `src/components/orders/OrderFormFooter.tsx`**

Sticky footer with "Guardar borrador" + "Confirmar Orden":

```typescript
"use client";
import { Button, Group, Text } from "@mantine/core";
import { Save, Send } from "lucide-react";

interface Props {
  onSaveDraft: () => void;
  onConfirm: () => void;
  isSaving: boolean;
  isConfirming: boolean;
  onBack: () => void;
}

export function OrderFormFooter({ onSaveDraft, onConfirm, isSaving, isConfirming, onBack }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 30,
      }}
    >
      <Button variant="subtle" color="gray" onClick={onBack} size="sm">
        ← Volver
      </Button>

      <Group gap="sm" align="center">
        <Button
          variant="outline"
          color="amber"
          size="sm"
          leftSection={<Save size={14} />}
          onClick={onSaveDraft}
          loading={isSaving}
          disabled={isConfirming}
        >
          Guardar borrador
        </Button>

        <div style={{ width: 1, height: 24, background: "var(--border)" }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <Button
            color="amber"
            size="sm"
            leftSection={<Send size={14} />}
            onClick={onConfirm}
            loading={isConfirming}
            disabled={isSaving}
          >
            Confirmar Orden
          </Button>
          <Text size="xs" c="dimmed" mt={2}>Envía a Odoo</Text>
        </div>
      </Group>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/orders/DraftWarningModal.tsx`**

```typescript
"use client";
import { Modal, Stack, Text, List, Button, Group } from "@mantine/core";

interface Props {
  opened: boolean;
  missing: string[];
  onSaveAnyway: () => void;
  onFix: () => void;
}

export function DraftWarningModal({ opened, missing, onSaveAnyway, onFix }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onFix}
      title={<Text fw={600}>Algunos campos están incompletos</Text>}
      centered
      size="sm"
    >
      <Stack gap="md">
        <List size="sm" spacing="xs">
          {missing.map((m, i) => (
            <List.Item key={i}>
              <Text size="sm" c="dimmed">{m}</Text>
            </List.Item>
          ))}
        </List>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onFix}>Corregir</Button>
          <Button color="amber" variant="outline" onClick={onSaveAnyway}>Guardar igual</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 3: Create `src/components/orders/OrderProgressModal.tsx`**

```typescript
"use client";
import { Modal, Stack, Group, Text, ThemeIcon } from "@mantine/core";
import { CheckCircle, Clock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  opened: boolean;
  title?: string;
  steps: string[];
}

export function OrderProgressModal({ opened, title = "Procesando...", steps }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!opened) { setStep(0); return; }
    const timers = steps.map((_, i) =>
      setTimeout(() => setStep(i + 1), (i + 1) * 3500),
    );
    return () => timers.forEach(clearTimeout);
  }, [opened, steps.length]);

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      centered
      size="sm"
      title={<Text fw={600}>{title}</Text>}
    >
      <Stack gap="md" py="sm">
        {steps.map((label, i) => {
          const done = step > i;
          const active = step === i;
          return (
            <Group key={i} gap="sm">
              {done ? (
                <ThemeIcon color="green" variant="light" size="sm" radius="xl"><CheckCircle size={12} /></ThemeIcon>
              ) : active ? (
                <ThemeIcon color="amber" variant="light" size="sm" radius="xl">
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                </ThemeIcon>
              ) : (
                <ThemeIcon color="gray" variant="light" size="sm" radius="xl"><Clock size={12} /></ThemeIcon>
              )}
              <Text size="sm" c={done ? "dimmed" : active ? undefined : "dimmed"}>{label}</Text>
            </Group>
          );
        })}
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 4: Create `src/components/orders/ErrorDetailModal.tsx`**

```typescript
"use client";
import { Modal, Stack, Text, Button, Code } from "@mantine/core";

interface Props {
  opened: boolean;
  onClose: () => void;
  errorDetail: string | null;
}

export function ErrorDetailModal({ opened, onClose, errorDetail }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={600} c="red">Error al confirmar</Text>}
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Esta orden falló al intentar enviarse a Odoo. Detalle del error:
        </Text>
        <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
          {errorDetail || "Sin detalle disponible"}
        </Code>
        <Button color="amber" onClick={onClose}>Cerrar</Button>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/orders/OrderFormFooter.tsx src/components/orders/OrderProgressModal.tsx src/components/orders/DraftWarningModal.tsx src/components/orders/ErrorDetailModal.tsx
git commit -m "feat: add shared form footer, progress modal, draft warning, error detail components"
```

---

## Task 10: Shared AG Grid table component

**Files:**
- Create: `src/components/orders/OrdersTable.tsx`

**Interfaces:**
- Consumes: row data array, column defs, action renderer
- Produces: reusable AG Grid wrapper used by `/orders` and `/odoo-orders`

- [ ] **Step 1: Create `src/components/orders/OrdersTable.tsx`**

```typescript
"use client";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridOptions } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

interface Props<T> {
  rowData: T[];
  columnDefs: ColDef<T>[];
  height?: number | string;
  onRowClicked?: (row: T) => void;
}

export function OrdersTable<T>({ rowData, columnDefs, height = 500, onRowClicked }: Props<T>) {
  const gridOptions: GridOptions<T> = {
    defaultColDef: {
      sortable: true,
      resizable: true,
      suppressMovable: false,
    },
    animateRows: true,
    rowHeight: 48,
    headerHeight: 40,
    suppressCellFocus: true,
    onRowClicked: onRowClicked ? (e) => e.data && onRowClicked(e.data) : undefined,
  };

  return (
    <div
      className="ag-theme-alpine-dark"
      style={{
        height,
        width: "100%",
        "--ag-background-color": "var(--surface)",
        "--ag-odd-row-background-color": "var(--bg)",
        "--ag-header-background-color": "var(--surface)",
        "--ag-border-color": "var(--border)",
        "--ag-row-hover-color": "color-mix(in srgb, var(--mantine-color-amber-6) 8%, transparent)",
        "--ag-font-family": "var(--font-sans)",
        "--ag-font-size": "13px",
        "--ag-foreground-color": "var(--text)",
        "--ag-header-foreground-color": "var(--text2)",
      } as React.CSSProperties}
    >
      <AgGridReact rowData={rowData} columnDefs={columnDefs} gridOptions={gridOptions} />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/OrdersTable.tsx
git commit -m "feat: add shared AG Grid OrdersTable wrapper"
```

---

## Task 11: Orders list page (local DB)

**Files:**
- Modify: `src/app/(app)/orders/page.tsx` — full rewrite

- [ ] **Step 1: Rewrite `src/app/(app)/orders/page.tsx`**

```typescript
"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Text, Group, Select, Modal, Stack } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { Send, Copy, Trash2, Edit2, AlertTriangle, Eye } from "lucide-react";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { ErrorDetailModal } from "@/components/orders/ErrorDetailModal";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { LocalOrderSummary, OrderStatus, Supplier } from "@/types";
import type { ColDef, ICellRendererParams } from "ag-grid-community";

const PAGE_SIZE = 30;

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  DRAFT: { label: "Borrador", color: "gray" },
  CONFIRMED: { label: "Confirmada", color: "green" },
  ERROR: { label: "Error", color: "red" },
};

function formatDate(d: string) {
  if (!d) return "-";
  return d.split("T")[0].split("-").reverse().join("/");
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<LocalOrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  const [errorModal, setErrorModal] = useState<{ open: boolean; detail: string | null }>({ open: false, detail: null });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (supplier) params.set("supplier_id", String(supplier.id));
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("date_from", dateFrom.toISOString().split("T")[0]);
      if (dateTo) params.set("date_to", dateTo.toISOString().split("T")[0]);
      const res = await fetch(`/api/local-orders?${params}`);
      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [supplier, statusFilter, dateFrom, dateTo, offset]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function handleDuplicate(id: number) {
    setDuplicating(id);
    try {
      const res = await fetch(`/api/local-orders/${id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (res.ok) router.push(`/orders/${data.id}/edit`);
    } finally {
      setDuplicating(null);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await fetch(`/api/local-orders/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      fetchOrders();
    } finally {
      setDeleting(null);
    }
  }

  const columnDefs: ColDef<LocalOrderSummary>[] = [
    {
      headerName: "Creada",
      field: "createdAt",
      width: 120,
      valueFormatter: (p) => formatDate(p.value),
    },
    {
      headerName: "Proveedor",
      field: "supplierName",
      flex: 1,
      minWidth: 160,
    },
    {
      headerName: "Estado",
      field: "status",
      width: 130,
      cellRenderer: (p: ICellRendererParams<LocalOrderSummary>) => {
        const cfg = STATUS_CONFIG[p.value as OrderStatus] ?? { label: p.value, color: "gray" };
        return (
          <Badge color={cfg.color} variant="light" size="sm">{cfg.label}</Badge>
        );
      },
    },
    {
      headerName: "Artículos",
      field: "articleCount",
      width: 100,
      type: "numericColumn",
    },
    {
      headerName: "Fecha OC",
      field: "date",
      width: 120,
      valueFormatter: (p) => p.value ? p.value.split("-").reverse().join("/") : "-",
    },
    {
      headerName: "N° Odoo",
      field: "odooOrderName",
      width: 120,
      valueFormatter: (p) => p.value ?? "-",
    },
    {
      headerName: "Acciones",
      width: 280,
      sortable: false,
      cellRenderer: (p: ICellRendererParams<LocalOrderSummary>) => {
        const row = p.data!;
        return (
          <Group gap={4} wrap="nowrap" align="center" h="100%">
            {row.status === "ERROR" && (
              <Button size="xs" variant="subtle" color="red" leftSection={<AlertTriangle size={12} />}
                onClick={() => setErrorModal({ open: true, detail: row.errorDetail })}>
                Ver error
              </Button>
            )}
            {(row.status === "DRAFT" || row.status === "ERROR") && (
              <Button size="xs" variant="subtle" color="amber" leftSection={<Edit2 size={12} />}
                onClick={() => router.push(`/orders/${row.id}/edit`)}>
                Editar
              </Button>
            )}
            {row.status === "DRAFT" && (
              <Button size="xs" color="amber" leftSection={<Send size={12} />}
                onClick={() => router.push(`/orders/${row.id}/edit?confirm=1`)}>
                Confirmar
              </Button>
            )}
            {row.status === "CONFIRMED" && (
              <Button size="xs" variant="subtle" color="gray" leftSection={<Eye size={12} />}
                onClick={() => router.push(`/orders/${row.id}/edit`)}>
                Ver
              </Button>
            )}
            <Button size="xs" variant="subtle" color="gray" leftSection={<Copy size={12} />}
              loading={duplicating === row.id}
              onClick={() => handleDuplicate(row.id)}>
              Duplicar
            </Button>
            {(row.status === "DRAFT" || row.status === "ERROR") && (
              <Button size="xs" variant="subtle" color="red" leftSection={<Trash2 size={12} />}
                onClick={() => setDeleteConfirm(row.id)}>
                Eliminar
              </Button>
            )}
          </Group>
        );
      },
    },
  ];

  return (
    <div style={{ padding: "24px 24px 80px" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <h1 style={{ margin: "0 0 20px", fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>
        Órdenes de Compra
      </h1>

      {/* Filters */}
      <Group mb="lg" gap="md" align="flex-end" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed" fw={500} mb={4}>Proveedor</Text>
          <SupplierSearch value={supplier} onChange={setSupplier} />
        </div>
        <Select
          label={<Text size="xs" c="dimmed" fw={500}>Estado</Text>}
          placeholder="Todos"
          data={[
            { value: "DRAFT", label: "Borrador" },
            { value: "CONFIRMED", label: "Confirmada" },
            { value: "ERROR", label: "Error" },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
          clearable w={160} size="sm"
        />
        <DatePickerInput label={<Text size="xs" c="dimmed" fw={500}>Desde</Text>}
          value={dateFrom} onChange={(v) => setDateFrom(v as Date | null)}
          valueFormat="DD/MM/YYYY" locale="es" clearable w={150} size="sm" />
        <DatePickerInput label={<Text size="xs" c="dimmed" fw={500}>Hasta</Text>}
          value={dateTo} onChange={(v) => setDateTo(v as Date | null)}
          valueFormat="DD/MM/YYYY" locale="es" clearable w={150} size="sm" />
      </Group>

      {loading ? (
        <div style={{ display: "flex", gap: 8, padding: 48, justifyContent: "center", color: "var(--text2)" }}>
          <LoadingSpinner size={20} /> Cargando...
        </div>
      ) : (
        <>
          <OrdersTable rowData={orders} columnDefs={columnDefs} height={520} />
          <Group justify="space-between" mt="md">
            <Text size="xs" c="dimmed">{total} orden{total !== 1 ? "es" : ""}</Text>
            <Group gap="xs">
              <Button variant="subtle" color="gray" size="xs" disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                ← Anterior
              </Button>
              <Button variant="subtle" color="gray" size="xs" disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}>
                Siguiente →
              </Button>
            </Group>
          </Group>
        </>
      )}

      <ErrorDetailModal
        opened={errorModal.open}
        errorDetail={errorModal.detail}
        onClose={() => setErrorModal({ open: false, detail: null })}
      />

      <Modal opened={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}
        title={<Text fw={600}>Eliminar borrador</Text>} centered size="sm">
        <Stack gap="md">
          <Text size="sm">¿Eliminás este borrador? Esta acción no se puede deshacer.</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button color="red" loading={deleting !== null}
              onClick={() => deleteConfirm !== null && handleDelete(deleteConfirm)}>
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/orders`. Expected: AG Grid table with sidebar, filters, empty state or orders from DB.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/orders/page.tsx
git commit -m "feat: rewrite orders list page with AG Grid + local DB"
```

---

## Task 12: Odoo orders read-only page

**Files:**
- Create: `src/app/(app)/odoo-orders/page.tsx`

- [ ] **Step 1: Create `src/app/(app)/odoo-orders/page.tsx`**

Move and adapt the existing logic from `src/app/(app)/orders/page.tsx` (the old Odoo version):

```typescript
"use client";
import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Group, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Supplier } from "@/types";
import type { ColDef } from "ag-grid-community";

const PAGE_SIZE = 30;

interface OCSummary {
  id: number;
  name: string;
  partner_id: [number, string];
  state: string;
  date_order: string;
  amount_total: number;
}

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Borrador", color: "gray" },
  sent: { label: "Enviada", color: "yellow" },
  purchase: { label: "Confirmada", color: "green" },
};

function formatDate(d: string) {
  if (!d) return "-";
  return d.split(" ")[0].split("-").reverse().join("/");
}

export default function OdooOrdersPage() {
  const [orders, setOrders] = useState<OCSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (supplier) params.set("supplier_id", String(supplier.id));
      if (stateFilter) params.set("state", stateFilter);
      if (dateFrom) params.set("date_from", dateFrom.toISOString().split("T")[0]);
      if (dateTo) params.set("date_to", dateTo.toISOString().split("T")[0]);
      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [supplier, stateFilter, dateFrom, dateTo, offset]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const columnDefs: ColDef<OCSummary>[] = [
    { headerName: "N° Orden", field: "name", width: 130 },
    {
      headerName: "Proveedor",
      flex: 1,
      minWidth: 160,
      valueGetter: (p) => Array.isArray(p.data?.partner_id) ? p.data.partner_id[1] : "",
    },
    {
      headerName: "Estado",
      field: "state",
      width: 130,
      cellRenderer: (p: { value: string }) => {
        const cfg = STATE_LABELS[p.value] ?? { label: p.value, color: "gray" };
        return <Badge color={cfg.color} variant="light" size="sm">{cfg.label}</Badge>;
      },
    },
    { headerName: "Fecha", field: "date_order", width: 120, valueFormatter: (p) => formatDate(p.value) },
    {
      headerName: "Total",
      field: "amount_total",
      width: 140,
      type: "numericColumn",
      valueFormatter: (p) => `$${(p.value as number).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
    },
  ];

  return (
    <div style={{ padding: "24px 24px 80px" }}>
      <h1 style={{ margin: "0 0 20px", fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>
        Historial Odoo
      </h1>
      <Text size="sm" c="dimmed" mb="lg">Vista de solo lectura de órdenes en Odoo.</Text>

      <Group mb="lg" gap="md" align="flex-end" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed" fw={500} mb={4}>Proveedor</Text>
          <SupplierSearch value={supplier} onChange={setSupplier} />
        </div>
        <Select
          label={<Text size="xs" c="dimmed" fw={500}>Estado</Text>}
          placeholder="Todos"
          data={[
            { value: "draft", label: "Borrador" },
            { value: "sent", label: "Enviada" },
            { value: "purchase", label: "Confirmada" },
          ]}
          value={stateFilter} onChange={setStateFilter} clearable w={160} size="sm"
        />
        <DatePickerInput label={<Text size="xs" c="dimmed" fw={500}>Desde</Text>}
          value={dateFrom} onChange={(v) => setDateFrom(v as Date | null)}
          valueFormat="DD/MM/YYYY" locale="es" clearable w={150} size="sm" />
        <DatePickerInput label={<Text size="xs" c="dimmed" fw={500}>Hasta</Text>}
          value={dateTo} onChange={(v) => setDateTo(v as Date | null)}
          valueFormat="DD/MM/YYYY" locale="es" clearable w={150} size="sm" />
      </Group>

      {loading ? (
        <div style={{ display: "flex", gap: 8, padding: 48, justifyContent: "center", color: "var(--text2)" }}>
          <LoadingSpinner size={20} /> Cargando desde Odoo...
        </div>
      ) : (
        <>
          <OrdersTable rowData={orders} columnDefs={columnDefs} height={520} />
          <Group justify="space-between" mt="md">
            <Text size="xs" c="dimmed">{total} orden{total !== 1 ? "es" : ""}</Text>
            <Group gap="xs">
              <Button variant="subtle" color="gray" size="xs" disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                ← Anterior
              </Button>
              <Button variant="subtle" color="gray" size="xs" disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}>
                Siguiente →
              </Button>
            </Group>
          </Group>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/odoo-orders/
git commit -m "feat: add Odoo orders read-only page with AG Grid"
```

---

## Task 13: OrderGrid — add save draft + update confirm flow

**Files:**
- Modify: `src/components/orders/OrderGrid.tsx`

**Changes:**
- Add `onSaveDraft?: (articles: Article[], meta: DraftMeta) => Promise<void>` prop
- Remove `onSaveChanges` prop (was Odoo edit — now obsolete)
- Change debounce from 1500ms → 5000ms
- Remove edit-mode `originalSnapshot` tracking (no longer needed — edit mode is local draft)
- Keep all article management logic intact

- [ ] **Step 1: Update Props interface in `OrderGrid.tsx`**

```typescript
// Replace the Props interface (around line 23)
interface Props {
  supplier: Supplier | null;
  date: string;
  onTotalsChange?: (units: number, amount: number) => void;
  mode?: "create" | "edit";
  initialArticles?: Article[];
  orderId?: number;                              // local DB order ID (not Odoo)
  onSaveDraft?: (articles: Article[]) => Promise<void>;
  onDraftCleared?: () => void;
  initialWarehouseIds?: number[];
}
```

- [ ] **Step 2: Change debounce constant**

Find line: `}, 1500);`  
Replace with: `}, 5000);`

- [ ] **Step 3: Remove `orderWriteDate` and `originalSnapshot` from edit mode**

Remove:
- `orderWriteDate?: string` from Props
- `originalSnapshot` ref (the edit snapshot tracking was for Odoo diff — no longer needed)
- Any remaining reference to `onSaveChanges`

The `orderId` prop is kept for the parent page to pass the local DB order ID.

- [ ] **Step 4: Expose `getArticles()` via ref or pass articles up via callback**

Add a submit handler that calls `onSaveDraft` with current articles:

```typescript
// Add inside OrderGrid, exposed via the onSaveDraft prop call
async function handleSaveDraft() {
  if (!onSaveDraft) return;
  await onSaveDraft(articles);
}
```

The footer buttons (`OrderFormFooter`) are rendered by the **parent page**, not OrderGrid. OrderGrid exposes `articles` and `handleSaveDraft` up via a prop callback pattern. The simplest approach: add a `onArticlesChange?: (articles: Article[]) => void` prop so the parent page always has the current articles.

Add to Props:
```typescript
onArticlesChange?: (articles: Article[]) => void;
```

Call it inside the `setArticles` wrapper:
```typescript
// Wrap setArticles calls to also notify parent
function updateArticles(updater: Article[] | ((prev: Article[]) => Article[])) {
  setArticles((prev) => {
    const next = typeof updater === "function" ? updater(prev) : updater;
    onArticlesChange?.(next);
    return next;
  });
}
```

Replace all `setArticles(` calls in the component with `updateArticles(`.

- [ ] **Step 5: Verify build**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/orders/OrderGrid.tsx
git commit -m "refactor: OrderGrid — add onArticlesChange, remove Odoo edit props, debounce 5s"
```

---

## Task 14: New order page — wire save draft

**Files:**
- Modify: `src/app/(app)/orders/new/page.tsx`

- [ ] **Step 1: Rewrite `src/app/(app)/orders/new/page.tsx`**

```typescript
"use client";
import { useState, useCallback, useRef } from "react";
import { Group, Text, Badge, Alert } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { useRouter } from "next/navigation";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { OrderGrid } from "@/components/orders/OrderGrid";
import { OrderFormFooter } from "@/components/orders/OrderFormFooter";
import { DraftWarningModal } from "@/components/orders/DraftWarningModal";
import { OrderProgressModal } from "@/components/orders/OrderProgressModal";
import { validateForDraft, validateForConfirm } from "@/lib/orderValidation";
import type { Article, Supplier } from "@/types";

const ORDER_DRAFT_KEY = "order_new_draft";

export default function NewOrderPage() {
  const router = useRouter();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState<Date | null>(() => new Date());
  const [draftBanner, setDraftBanner] = useState(false);
  const [gridKey, setGridKey] = useState(0);
  const [articles, setArticles] = useState<Article[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [draftWarning, setDraftWarning] = useState<{ open: boolean; missing: string[] }>({ open: false, missing: [] });
  const [totals, setTotals] = useState({ units: 0, amount: 0 });
  const pendingSaveRef = useRef<"draft" | null>(null);

  const handleTotalsChange = useCallback((units: number, amount: number) => {
    setTotals({ units, amount });
  }, []);

  const dateStr = date ? date.toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

  async function doSaveDraft() {
    if (!supplier) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/local-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier.id,
          supplierName: supplier.name,
          date: dateStr,
          articles,
          warehouseIds: [],
          printColumns: [],
          printValues: {},
        }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.removeItem(ORDER_DRAFT_KEY);
        router.push(`/orders/${data.id}/edit`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveDraft() {
    const validation = validateForDraft({ supplierId: supplier?.id ?? null, date: dateStr, articles });
    if (!validation.valid) {
      pendingSaveRef.current = "draft";
      setDraftWarning({ open: true, missing: validation.missing });
      return;
    }
    doSaveDraft();
  }

  function handleConfirm() {
    const validation = validateForConfirm({ supplierId: supplier?.id ?? null, date: dateStr, articles });
    if (!validation.valid) {
      setDraftWarning({ open: true, missing: validation.missing });
      return;
    }
    // Save as draft first, then redirect to edit with confirm=1
    doSaveDraft().then(() => {
      // redirect happens in doSaveDraft with ?confirm=1
    });
  }

  function discardDraft() {
    localStorage.removeItem(ORDER_DRAFT_KEY);
    setSupplier(null);
    setDate(new Date());
    setDraftBanner(false);
    setGridKey((k) => k + 1);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", paddingBottom: 80 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 0" }}>
        <h1 style={{ margin: "0 0 20px", fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>
          Nueva Orden de Compra
        </h1>

        {draftBanner && (
          <Alert color="amber" variant="light" mb="md" title="Borrador restaurado" withCloseButton onClose={() => setDraftBanner(false)}>
            <Group gap="sm" align="center">
              <Text size="sm">Se recuperaron datos de una sesión anterior.</Text>
              <button onClick={discardDraft} style={{ background: "none", border: "1px solid var(--mantine-color-amber-5)", borderRadius: 4, cursor: "pointer", color: "var(--mantine-color-amber-5)", fontSize: 12, padding: "2px 10px" }}>
                Descartar
              </button>
            </Group>
          </Alert>
        )}

        <Group gap="xl" mb="xs" align="flex-end" wrap="wrap">
          <div>
            <Text size="xs" c="dimmed" fw={500} mb={6}>Proveedor</Text>
            <SupplierSearch value={supplier} onChange={setSupplier} />
          </div>
          <DatePickerInput
            label={<Text size="xs" c="dimmed" fw={500}>Fecha</Text>}
            value={date} onChange={(v) => setDate(v as Date | null)}
            valueFormat="DD/MM/YYYY" locale="es" w={180}
          />
          {supplier && (
            <Badge color="amber" variant="outline" size="lg" style={{ marginLeft: "auto" }}>
              {totals.units > 0 && `${totals.units} u. · `}
              {supplier.name}
            </Badge>
          )}
        </Group>

        <OrderGrid
          key={gridKey}
          supplier={supplier}
          date={dateStr}
          onTotalsChange={handleTotalsChange}
          onArticlesChange={setArticles}
          onDraftCleared={() => setDraftBanner(false)}
        />
      </div>

      <OrderFormFooter
        onSaveDraft={handleSaveDraft}
        onConfirm={handleConfirm}
        onBack={() => router.push("/orders")}
        isSaving={isSaving}
        isConfirming={isConfirming}
      />

      <DraftWarningModal
        opened={draftWarning.open}
        missing={draftWarning.missing}
        onFix={() => setDraftWarning({ open: false, missing: [] })}
        onSaveAnyway={() => {
          setDraftWarning({ open: false, missing: [] });
          doSaveDraft();
        }}
      />

      <OrderProgressModal
        opened={isConfirming}
        title="Confirmando orden..."
        steps={["Creando productos y variantes", "Enviando orden a Odoo", "Generando PDFs"]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build + browser test**

```bash
pnpm build
pnpm dev
```

Navigate to `/orders/new`. Create a draft. Expected: "Guardar borrador" creates record in DB and redirects to `/orders/[id]/edit`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/orders/new/page.tsx
git commit -m "feat: new order page saves draft to local DB, uses shared footer + modals"
```

---

## Task 15: Edit order page — local draft

**Files:**
- Modify: `src/app/(app)/orders/[id]/edit/page.tsx` — full rewrite

- [ ] **Step 1: Rewrite `src/app/(app)/orders/[id]/edit/page.tsx`**

```typescript
"use client";
import { useState, useCallback, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Group, Text, Badge, Alert } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { AlertTriangle } from "lucide-react";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { OrderGrid } from "@/components/orders/OrderGrid";
import { OrderFormFooter } from "@/components/orders/OrderFormFooter";
import { DraftWarningModal } from "@/components/orders/DraftWarningModal";
import { OrderProgressModal } from "@/components/orders/OrderProgressModal";
import { ErrorDetailModal } from "@/components/orders/ErrorDetailModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { validateForDraft, validateForConfirm } from "@/lib/orderValidation";
import type { Article, LocalOrder, Supplier } from "@/types";

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoConfirm = searchParams.get("confirm") === "1";

  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [totals, setTotals] = useState({ units: 0, amount: 0 });
  const handleTotalsChange = useCallback((u: number, a: number) => setTotals({ units: u, amount: a }), []);

  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftWarning, setDraftWarning] = useState<{ open: boolean; missing: string[] }>({ open: false, missing: [] });
  const [errorModal, setErrorModal] = useState(false);

  const isConfirmed = order?.status === "CONFIRMED";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/local-orders/${id}`);
        const data = await res.json();
        if (!res.ok) { setLoadError(data.error || "Error al cargar"); return; }
        const loaded = data as LocalOrder;
        setOrder(loaded);
        setSupplier({ id: loaded.supplierId, name: loaded.supplierName });
        if (loaded.date) {
          const [y, m, d] = loaded.date.split("-").map(Number);
          setDate(new Date(y, m - 1, d));
        }
        setArticles(loaded.articles as unknown as Article[]);
      } catch {
        setLoadError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const dateStr = date ? date.toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

  async function doSaveDraft() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/local-orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier?.id,
          supplierName: supplier?.name,
          date: dateStr,
          articles,
          warehouseIds: order?.warehouseIds ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) setSaveError(data.error || "Error al guardar");
      else setOrder((prev) => prev ? { ...prev, status: data.status ?? prev.status } : prev);
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveDraft() {
    const validation = validateForDraft({ supplierId: supplier?.id ?? null, date: dateStr, articles });
    if (!validation.valid) {
      setDraftWarning({ open: true, missing: validation.missing });
      return;
    }
    doSaveDraft();
  }

  async function handleConfirm() {
    const validation = validateForConfirm({ supplierId: supplier?.id ?? null, date: dateStr, articles });
    if (!validation.valid) {
      setDraftWarning({ open: true, missing: validation.missing });
      return;
    }
    // Save first, then confirm
    setSaveError(null);
    setIsConfirming(true);
    try {
      await doSaveDraft();
      const res = await fetch(`/api/local-orders/${id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Error al confirmar");
        setOrder((prev) => prev ? { ...prev, status: "ERROR", errorDetail: data.error } : prev);
      } else {
        router.push("/orders");
      }
    } finally {
      setIsConfirming(false);
    }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 12, color: "var(--text2)" }}>
      <LoadingSpinner size={24} /> Cargando orden...
    </div>
  );

  if (loadError) return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <Text c="red" size="sm" mb="md">{loadError}</Text>
      <Text size="sm" c="dimmed" style={{ cursor: "pointer" }} onClick={() => router.push("/orders")}>← Volver a órdenes</Text>
    </div>
  );

  if (!order) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", paddingBottom: 80 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 0" }}>
        <Text size="xs" c="dimmed" mb={4}>
          {order.status === "CONFIRMED" ? `Orden confirmada · ${order.odooOrderName}` : `Editando borrador #${order.id}`}
        </Text>

        {order.status === "ERROR" && (
          <Alert color="red" variant="light" mb="md" icon={<AlertTriangle size={16} />}
            title="Esta orden falló al confirmarse">
            <Text size="sm">
              Revisá el error antes de reintentar.{" "}
              <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setErrorModal(true)}>
                Ver detalle
              </span>
            </Text>
          </Alert>
        )}

        {saveError && <Text c="red" size="sm" mb="sm">{saveError}</Text>}

        <Group gap="xl" mb="xs" align="flex-end" wrap="wrap">
          <div>
            <Text size="xs" c="dimmed" fw={500} mb={6}>Proveedor</Text>
            <SupplierSearch value={supplier} onChange={isConfirmed ? () => {} : setSupplier} />
          </div>
          <DatePickerInput
            label={<Text size="xs" c="dimmed" fw={500}>Fecha</Text>}
            value={date} onChange={isConfirmed ? () => {} : (v) => setDate(v as Date | null)}
            valueFormat="DD/MM/YYYY" locale="es" w={180}
            disabled={isConfirmed}
          />
          {totals.units > 0 && (
            <Badge color="amber" variant="light" size="md" style={{ marginLeft: "auto" }}>
              {totals.units} u.
            </Badge>
          )}
        </Group>

        <OrderGrid
          supplier={supplier}
          date={dateStr}
          onTotalsChange={handleTotalsChange}
          mode={isConfirmed ? "edit" : "edit"}
          initialArticles={articles}
          orderId={order.id}
          onArticlesChange={setArticles}
        />
      </div>

      {!isConfirmed && (
        <OrderFormFooter
          onSaveDraft={handleSaveDraft}
          onConfirm={handleConfirm}
          onBack={() => router.push("/orders")}
          isSaving={isSaving}
          isConfirming={isConfirming}
        />
      )}

      {isConfirmed && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "12px 24px", display: "flex", justifyContent: "flex-start" }}>
          <Text size="sm" c="dimmed" style={{ cursor: "pointer" }} onClick={() => router.push("/orders")}>
            ← Volver a órdenes
          </Text>
        </div>
      )}

      <DraftWarningModal
        opened={draftWarning.open}
        missing={draftWarning.missing}
        onFix={() => setDraftWarning({ open: false, missing: [] })}
        onSaveAnyway={() => { setDraftWarning({ open: false, missing: [] }); doSaveDraft(); }}
      />

      <OrderProgressModal
        opened={isConfirming}
        title="Confirmando orden..."
        steps={["Creando productos y variantes", "Enviando orden a Odoo", "Generando PDFs"]}
      />

      <ErrorDetailModal
        opened={errorModal}
        errorDetail={order.errorDetail}
        onClose={() => setErrorModal(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build + browser test**

```bash
pnpm build
pnpm dev
```

Open a draft from `/orders`. Expected: form loads with articles, footer shows Guardar/Confirmar. CONFIRMED orders show footer with back link only.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/orders/[id]/edit/page.tsx
git commit -m "feat: rewrite edit page for local DB drafts with confirm flow"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| MySQL + Prisma v7 schema | Task 1 |
| Local types (LocalOrder, OrderStatus) | Task 2 |
| Strip base64, temp image storage | Task 3 |
| Shared Odoo creation lib, improved rollback | Task 4 |
| CRUD local-orders API | Task 5 |
| Confirm (atomic + ERROR state), Duplicate, Images upload | Task 6 |
| Remove PATCH /api/orders/[id] | Task 7 |
| Sidebar layout, collapse, active state, Inventario disabled | Task 8 |
| AG Grid shared wrapper | Task 10 |
| Local orders list (AG Grid, actions per status, delete confirm, error modal) | Task 11 |
| Odoo read-only list (AG Grid) | Task 12 |
| OrderGrid debounce 5s, onArticlesChange, remove Odoo edit props | Task 13 |
| New order → save to DB, DraftWarningModal, OrderProgressModal | Task 14 |
| Edit draft → PUT, Confirm → POST confirm, ERROR banner, confirmed = read-only | Task 15 |
| validateForDraft (permissive) + validateForConfirm (strict) | Task 3 |
| Duplicate resets article IDs, strips tempPath, clears odooLineIds | Task 6 |
| `uploads/temp/[id]/` VPS temp storage | Task 3 + Task 6 |

All spec requirements covered.

### Placeholder scan

No TBD, TODO, or "similar to" references found. All code blocks are complete.

### Type consistency

- `LocalOrder.articles` typed as `LocalArticle[]` ✓
- `stripImagesForDB` returns `LocalArticle[]`, consumed by POST/PUT ✓
- `restorePreviewUrls` returns `Article[]`, consumed by GET and /confirm ✓
- `validateForDraft` / `validateForConfirm` accept `{ supplierId, date, articles: LocalArticle[] }` — called consistently in Task 14+15 ✓
- `createOrderInOdoo` returns `OdooCreationResult` with `imageSyncData: ImageSyncEntry[]` ✓
- `OrderFormFooter` props: `onSaveDraft, onConfirm, isSaving, isConfirming, onBack` — used correctly in Tasks 14+15 ✓
