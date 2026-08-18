# Centralized Pagination & MySQL Sort Buffer Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix MariaDB `1038: Out of sort memory` error on the inventory list query, and centralize offset/limit pagination state and UI across `/inventario` and `/odoo-orders`.

**Architecture:** Add a denormalized `article_count` column to `inventories` so the list query never loads the `articles` JSON blob. Extract a `usePagination` hook (manages only offset state) and a `PaginationControls` component (derives hasPrev/hasNext from its own props — avoids circular dependency between hook offset and query total). Migrate `/odoo-orders` from `useEffect` to React Query for consistency.

**Tech Stack:** Next.js 15, Prisma 7.9.0 + `@prisma/adapter-mariadb`, TanStack React Query 5, Mantine 9, TypeScript.

## Global Constraints

- No test framework configured — verification is manual via dev server.
- All commands run from `casa-sonia-compras/`.
- Prisma migration files follow naming: `YYYYMMDDHHMMSS_snake_case_description`.
- Path alias `@/*` maps to `src/*`.
- Dark theme, Mantine amber primary — UI must match existing style.
- `pnpm` only (no npm/yarn).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add `articleCount` field |
| Create | `prisma/migrations/20260801000000_add_article_count/migration.sql` | Add column + backfill |
| Modify | `src/app/api/inventario/route.ts` | Remove `articles` from select, use `articleCount` |
| Modify | `src/app/api/inventario/[id]/route.ts` | Sync `articleCount` in PATCH |
| Create | `src/hooks/usePagination.ts` | Manages only offset state — no total dependency |
| Create | `src/components/ui/PaginationControls.tsx` | Derives hasPrev/hasNext from props — no circular dep |
| Create | `src/hooks/useOdooOrders.ts` | React Query hook for Odoo orders |
| Modify | `src/app/(app)/inventario/page.tsx` | Use `usePagination` + `PaginationControls` |
| Modify | `src/app/(app)/odoo-orders/page.tsx` | Replace `useEffect` → `useOdooOrders` + `usePagination` + `PaginationControls` |

---

## Task 1: Schema Migration — Add `article_count` Column

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260801000000_add_article_count/migration.sql`

**Interfaces:**
- Produces: `Inventory.articleCount: number` available in all Prisma queries.

- [ ] **Step 1: Add field to Prisma schema**

In `prisma/schema.prisma`, inside `model Inventory`, add after the `articles` field:

```prisma
articles            Json            @default("[]")
articleCount        Int             @default(0)    @map("article_count")
```

- [ ] **Step 2: Create migration directory and SQL file**

```bash
mkdir -p prisma/migrations/20260801000000_add_article_count
```

Create `prisma/migrations/20260801000000_add_article_count/migration.sql`:

```sql
-- Add article_count column with default 0
ALTER TABLE `inventories` ADD COLUMN `article_count` INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing articles JSON arrays
UPDATE `inventories`
SET `article_count` = JSON_LENGTH(`articles`)
WHERE JSON_VALID(`articles`) AND `articles` IS NOT NULL AND `articles` != 'null';
```

- [ ] **Step 3: Apply migration**

```bash
npx prisma migrate deploy
```

Expected output: `1 migration applied.`

- [ ] **Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: client regenerated without errors.

- [ ] **Step 5: Verify backfill**

```bash
npx prisma studio
```

Open `Inventory` table. Confirm `article_count` column exists and values match the count of items in `articles` for several rows.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260801000000_add_article_count/
git commit -m "feat: add article_count column to inventories with backfill"
```

---

## Task 2: Fix List API — Remove `articles` from Select

**Files:**
- Modify: `src/app/api/inventario/route.ts`

**Interfaces:**
- Consumes: `Inventory.articleCount: number` (from Task 1).
- Produces: `GET /api/inventario` response includes `articleCount` from DB column directly — never loads `articles` blob.

- [ ] **Step 1: Update `findMany` select**

In `src/app/api/inventario/route.ts`, replace the `select` block inside `prisma.inventory.findMany`:

```typescript
select: {
  id: true,
  status: true,
  warehouseId: true,
  warehouseName: true,
  name: true,
  countDate: true,
  accountingDate: true,
  articleCount: true,
  odooRef: true,
  errorDetail: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
},
```

- [ ] **Step 2: Fix the summary map**

Replace the `summaries` map (remove `articles` destructuring, use `inv.articleCount` directly):

```typescript
const summaries = inventories.map((inv) => {
  const { createdBy, ...rest } = inv;
  return {
    ...rest,
    name: inv.name ?? null,
    countDate: inv.countDate ?? null,
    accountingDate: inv.accountingDate ?? null,
    createdByName: createdBy?.name ?? null,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
});
```

- [ ] **Step 3: Verify — start dev server, open `/inventario`**

```bash
pnpm dev
```

Navigate to `/inventario`. Confirm:
- Page loads without error.
- Article count column shows correct numbers.
- No Prisma/MariaDB errors in terminal (especially no `1038`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/inventario/route.ts
git commit -m "fix: remove articles JSON from list query to fix MariaDB sort buffer error"
```

---

## Task 3: Fix PATCH API — Sync `articleCount` on Save

**Files:**
- Modify: `src/app/api/inventario/[id]/route.ts`

**Interfaces:**
- Consumes: `body.articles?: InventoryArticle[]`
- Produces: `article_count` in DB stays in sync whenever articles are saved.

- [ ] **Step 1: Update PATCH handler to sync `articleCount`**

In `src/app/api/inventario/[id]/route.ts`, in the `PATCH` handler, find the data builder and replace:

```typescript
if (body.articles !== undefined) data.articles = body.articles as unknown as object[];
```

With:

```typescript
if (body.articles !== undefined) {
  data.articles = body.articles as unknown as object[];
  data.articleCount = body.articles.length;
}
```

- [ ] **Step 2: Verify sync works**

With dev server running:
1. Open an inventory in BORRADOR status.
2. Scan/add an article and click "Guardar".
3. Go back to `/inventario` list.
4. Confirm `articleCount` for that inventory updated correctly.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/inventario/[id]/route.ts"
git commit -m "feat: sync article_count on inventory PATCH"
```

---

## Task 4: `usePagination` Hook

**Files:**
- Create: `src/hooks/usePagination.ts`

**Design note:** The hook manages only `offset` state and exposes navigation actions. It does NOT take `total` as input — that would create a circular dependency (query needs offset, hook needs total from query). `hasPrev`/`hasNext` are computed in `PaginationControls` from its own props.

**Interfaces:**
- Produces:
  ```typescript
  usePagination(pageSize?: number): {
    offset: number;
    limit: number;
    goNext: () => void;
    goPrev: () => void;
    reset: () => void;
  }
  ```

- [ ] **Step 1: Create the hook**

Create `src/hooks/usePagination.ts`:

```typescript
import { useState, useCallback } from "react";

export interface UsePaginationReturn {
  offset: number;
  limit: number;
  goNext: () => void;
  goPrev: () => void;
  reset: () => void;
}

export function usePagination(pageSize = 30): UsePaginationReturn {
  const [offset, setOffset] = useState(0);

  const goNext = useCallback(() => {
    setOffset((o) => o + pageSize);
  }, [pageSize]);

  const goPrev = useCallback(() => {
    setOffset((o) => Math.max(0, o - pageSize));
  }, [pageSize]);

  const reset = useCallback(() => {
    setOffset(0);
  }, []);

  return {
    offset,
    limit: pageSize,
    goNext,
    goPrev,
    reset,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors referencing `usePagination.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePagination.ts
git commit -m "feat: add usePagination hook"
```

---

## Task 5: `PaginationControls` Component

**Files:**
- Create: `src/components/ui/PaginationControls.tsx`

**Design note:** `hasPrev` and `hasNext` are computed internally from `offset`, `limit`, and `total` — callers don't compute them. This keeps the interface simple and avoids the hook needing `total`.

**Interfaces:**
- Produces: `<PaginationControls>` importable from `@/components/ui/PaginationControls`.
  ```typescript
  interface PaginationControlsProps {
    total: number;
    offset: number;
    limit: number;
    onNext: () => void;
    onPrev: () => void;
    entityLabel: string;
  }
  ```

- [ ] **Step 1: Create the component**

Create `src/components/ui/PaginationControls.tsx`:

```typescript
import { Button, Group, Text } from "@mantine/core";

interface PaginationControlsProps {
  total: number;
  offset: number;
  limit: number;
  onNext: () => void;
  onPrev: () => void;
  entityLabel: string;
}

export function PaginationControls({
  total,
  offset,
  limit,
  onNext,
  onPrev,
  entityLabel,
}: PaginationControlsProps) {
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <Group justify="space-between" mt="md">
      <Text size="xs" c="dimmed">
        {total} {entityLabel}
      </Text>
      <Group gap="xs">
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          ← Anterior
        </Button>
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          disabled={!hasNext}
          onClick={onNext}
        >
          Siguiente →
        </Button>
      </Group>
    </Group>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors referencing `PaginationControls.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/PaginationControls.tsx
git commit -m "feat: add PaginationControls shared component"
```

---

## Task 6: `useOdooOrders` Hook

**Files:**
- Create: `src/hooks/useOdooOrders.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface OCSummary {
    id: number;
    name: string;
    partner_id: [number, string];
    state: string;
    date_order: string;
    amount_total: number;
  }

  export interface OdooOrdersParams {
    supplierId?: number;
    state?: string;
    dateFrom?: string;   // YYYY-MM-DD
    dateTo?: string;     // YYYY-MM-DD
    limit?: number;
    offset?: number;
  }

  useOdooOrders(params: OdooOrdersParams): UseQueryResult<{ orders: OCSummary[]; total: number }>
  ```

- [ ] **Step 1: Create the hook**

Create `src/hooks/useOdooOrders.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";

export interface OCSummary {
  id: number;
  name: string;
  partner_id: [number, string];
  state: string;
  date_order: string;
  amount_total: number;
}

export interface OdooOrdersParams {
  supplierId?: number;
  state?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

interface OdooOrdersResponse {
  orders: OCSummary[];
  total: number;
}

async function fetchOdooOrders(
  params: OdooOrdersParams,
): Promise<OdooOrdersResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params.supplierId !== undefined)
    searchParams.set("supplier_id", String(params.supplierId));
  if (params.state) searchParams.set("state", params.state);
  if (params.dateFrom) searchParams.set("date_from", params.dateFrom);
  if (params.dateTo) searchParams.set("date_to", params.dateTo);

  const res = await fetch(`/api/orders?${searchParams}`);
  if (!res.ok) throw new Error("Error fetching orders");
  return res.json();
}

export function useOdooOrders(params: OdooOrdersParams) {
  return useQuery({
    queryKey: ["odoo-orders", params],
    queryFn: () => fetchOdooOrders(params),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors referencing `useOdooOrders.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useOdooOrders.ts
git commit -m "feat: add useOdooOrders React Query hook"
```

---

## Task 7: Refactor `/inventario` Page

**Files:**
- Modify: `src/app/(app)/inventario/page.tsx`

**Interfaces:**
- Consumes:
  - `usePagination(pageSize: number): UsePaginationReturn` from `@/hooks/usePagination`
  - `PaginationControls` from `@/components/ui/PaginationControls` — props: `total`, `offset`, `limit`, `onNext`, `onPrev`, `entityLabel`
  - `useInventories` from `@/hooks/useInventories` (unchanged)

- [ ] **Step 1: Add imports**

Add to the existing import block in `src/app/(app)/inventario/page.tsx`:

```typescript
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/PaginationControls";
```

- [ ] **Step 2: Replace pagination state**

Remove:
```typescript
const [offset, setOffset] = useState(0);
```

Add (keep `PAGE_SIZE = 30` constant as-is):
```typescript
const pagination = usePagination(PAGE_SIZE);
```

- [ ] **Step 3: Update `useInventories` call**

Replace:
```typescript
const { data, isLoading } = useInventories({ limit: PAGE_SIZE, offset });
```
With:
```typescript
const { data, isLoading } = useInventories({ limit: PAGE_SIZE, offset: pagination.offset });
```

- [ ] **Step 4: Replace the pagination JSX**

Remove the existing `<Group justify="space-between" mt="md">` block (the one with Anterior/Siguiente buttons and total text at the bottom of the table section).

Replace with:

```tsx
<PaginationControls
  total={data?.total ?? 0}
  offset={pagination.offset}
  limit={PAGE_SIZE}
  onNext={pagination.goNext}
  onPrev={pagination.goPrev}
  entityLabel={`inventario${(data?.total ?? 0) !== 1 ? "s" : ""}`}
/>
```

- [ ] **Step 5: Remove unused `total` variable**

Remove:
```typescript
const total = data?.total ?? 0;
```

Update the header text that used `total` to use `data?.total ?? 0` inline:
```tsx
<Text size="xs" c="dimmed" mt={2}>
  {data?.total ?? 0} inventario{(data?.total ?? 0) !== 1 ? "s" : ""} registrado{(data?.total ?? 0) !== 1 ? "s" : ""}
</Text>
```

- [ ] **Step 6: Verify page works**

With dev server running:
1. Open `/inventario`.
2. Confirm pagination buttons appear and function.
3. Confirm total count text is correct.
4. Confirm no TypeScript or console errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/inventario/page.tsx"
git commit -m "refactor: inventario list uses usePagination + PaginationControls"
```

---

## Task 8: Refactor `/odoo-orders` Page

**Files:**
- Modify: `src/app/(app)/odoo-orders/page.tsx`

**Interfaces:**
- Consumes:
  - `useOdooOrders(params: OdooOrdersParams)` + `OCSummary` from `@/hooks/useOdooOrders`
  - `usePagination(pageSize: number): UsePaginationReturn` from `@/hooks/usePagination`
  - `PaginationControls` from `@/components/ui/PaginationControls`

**Pattern:** `usePagination` is called first (exposes `offset`). `useOdooOrders` is called with that offset. `data.total` flows to `PaginationControls` as a prop — no circular dependency.

- [ ] **Step 1: Replace the full page**

Replace the entire content of `src/app/(app)/odoo-orders/page.tsx` with:

```typescript
"use client";
import { useState } from "react";
import { Badge, Group, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PaginationControls } from "@/components/ui/PaginationControls";
import { useOdooOrders, type OCSummary } from "@/hooks/useOdooOrders";
import { usePagination } from "@/hooks/usePagination";
import type { Supplier } from "@/types";

const PAGE_SIZE = 30;

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
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  const pagination = usePagination(PAGE_SIZE);

  const { data, isLoading } = useOdooOrders({
    supplierId: supplier?.id,
    state: stateFilter ?? undefined,
    dateFrom: dateFrom?.toISOString().split("T")[0],
    dateTo: dateTo?.toISOString().split("T")[0],
    limit: PAGE_SIZE,
    offset: pagination.offset,
  });

  const orders: OCSummary[] = data?.orders ?? [];
  const total = data?.total ?? 0;

  function handleSupplierChange(s: Supplier | null) {
    setSupplier(s);
    pagination.reset();
  }

  function handleStateChange(s: string | null) {
    setStateFilter(s);
    pagination.reset();
  }

  function handleDateFromChange(v: Date | null) {
    setDateFrom(v);
    pagination.reset();
  }

  function handleDateToChange(v: Date | null) {
    setDateTo(v);
    pagination.reset();
  }

  return (
    <div style={{ padding: "24px 24px 80px" }}>
      {/* Header */}
      <Group justify="space-between" align="center" mb="xl">
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text)",
            }}
          >
            Historial Odoo
          </h1>
          <Text size="xs" c="dimmed" mt={2}>
            Vista de solo lectura de órdenes en Odoo.
          </Text>
        </div>
      </Group>

      {/* Filters */}
      <Group mb="lg" gap="md" align="flex-end" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed" fw={500} mb={4}>
            Proveedor
          </Text>
          <SupplierSearch value={supplier} onChange={handleSupplierChange} />
        </div>
        <Select
          label={
            <Text size="xs" c="dimmed" fw={500}>
              Estado
            </Text>
          }
          placeholder="Todos"
          data={[
            { value: "draft", label: "Borrador" },
            { value: "sent", label: "Enviada" },
            { value: "purchase", label: "Confirmada" },
          ]}
          value={stateFilter}
          onChange={handleStateChange}
          clearable
          w={160}
          size="sm"
        />
        <DatePickerInput
          label={
            <Text size="xs" c="dimmed" fw={500}>
              Desde
            </Text>
          }
          value={dateFrom}
          onChange={(v) => handleDateFromChange(v as Date | null)}
          valueFormat="DD/MM/YYYY"
          locale="es"
          clearable
          w={150}
          size="sm"
        />
        <DatePickerInput
          label={
            <Text size="xs" c="dimmed" fw={500}>
              Hasta
            </Text>
          }
          value={dateTo}
          onChange={(v) => handleDateToChange(v as Date | null)}
          valueFormat="DD/MM/YYYY"
          locale="es"
          clearable
          w={150}
          size="sm"
        />
      </Group>

      {isLoading ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 48,
            justifyContent: "center",
            color: "var(--text2)",
          }}
        >
          <LoadingSpinner size={20} /> Cargando desde Odoo...
        </div>
      ) : orders.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            color: "var(--text3)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
          }}
        >
          <Text size="sm">No hay órdenes</Text>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["N° Orden", "Proveedor", "Estado", "Fecha", "Total"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 12px",
                          textAlign: "left",
                          color: "var(--text3)",
                          fontWeight: 500,
                          fontSize: 11,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => {
                  const cfg = STATE_LABELS[row.state] ?? {
                    label: row.state,
                    color: "gray",
                  };
                  const proveedorName = Array.isArray(row.partner_id)
                    ? row.partner_id[1]
                    : "";
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        transition: "background 120ms",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "var(--surface2, rgba(255,255,255,0.03))";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "transparent";
                      }}
                    >
                      <td
                        style={{
                          padding: "12px 12px",
                          color: "var(--text3)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                        }}
                      >
                        {row.name}
                      </td>
                      <td style={{ padding: "12px 12px", color: "var(--text)" }}>
                        {proveedorName}
                      </td>
                      <td style={{ padding: "12px 12px" }}>
                        <Badge color={cfg.color} variant="light" size="sm">
                          {cfg.label}
                        </Badge>
                      </td>
                      <td
                        style={{
                          padding: "12px 12px",
                          color: "var(--text3)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(row.date_order)}
                      </td>
                      <td
                        style={{
                          padding: "12px 12px",
                          color: "var(--text2)",
                          fontFamily: "var(--font-mono)",
                          textAlign: "right",
                        }}
                      >
                        $
                        {row.amount_total.toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationControls
            total={total}
            offset={pagination.offset}
            limit={PAGE_SIZE}
            onNext={pagination.goNext}
            onPrev={pagination.goPrev}
            entityLabel={`orden${total !== 1 ? "es" : ""}`}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify page works**

With dev server running:
1. Open `/odoo-orders`.
2. Confirm orders load (check Network tab — single fetch, no double calls).
3. Change supplier filter → confirm page resets to offset 0 and refetches.
4. Change state filter → same.
5. Navigate pages → confirm offset increments correctly.
6. Confirm no TypeScript or console errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/odoo-orders/page.tsx"
git commit -m "refactor: odoo-orders uses React Query + usePagination + PaginationControls"
```

---

## Self-Review

**Spec coverage:**
- DB migration ✓ (Task 1)
- List API fix ✓ (Task 2)
- PATCH sync ✓ (Task 3)
- `usePagination` hook ✓ (Task 4)
- `PaginationControls` component ✓ (Task 5)
- `useOdooOrders` hook ✓ (Task 6)
- Inventario page refactor ✓ (Task 7)
- Orders page refactor ✓ (Task 8)

**Placeholder scan:** None found — all steps have explicit code.

**Type consistency:**
- `usePagination` returns `{ offset, limit, goNext, goPrev, reset }` — consumed correctly in Tasks 7 and 8.
- `PaginationControls` props: `total, offset, limit, onNext, onPrev, entityLabel` — used correctly in Tasks 7 and 8.
- `useOdooOrders` exports `OCSummary`, `OdooOrdersParams` — imported correctly in Task 8.
- `articleCount` field added in Task 1, consumed in Tasks 2 and 3.

**Circular dependency resolved:** `usePagination` takes no `total` — avoids the data→hook→query→data loop. `PaginationControls` computes `hasPrev`/`hasNext` internally from its own `offset + limit + total` props.
