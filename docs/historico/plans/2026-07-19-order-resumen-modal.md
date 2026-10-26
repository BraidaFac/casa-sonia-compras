# Order Resumen Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Ver resumen" button to the order sticky bar that opens a modal summarizing articles grouped by category with size quantities (normalized to canonical equivalences), total units, total cost, and average cost per unit.

**Architecture:** Pure computation logic in `src/lib/orderSummary.ts` (no UI deps), display-only modal in `src/components/orders/ResumenModal.tsx`, wired via an optional `onOpenResumen` prop added to `OrderStickyBar`. Both `new/page.tsx` and `edit/page.tsx` hold the open/close state and pass it down.

**Tech Stack:** Next.js 15 App Router, React, Mantine 9, Lucide icons, TypeScript. No test framework configured — manual browser verification used instead.

## Global Constraints

- Dark theme: `var(--bg)=#1c1917`, `var(--surface)=#242220`, `var(--surface2)=#2c2a27`, `var(--surface3)=#343230`, `var(--border)=#3a3835`, `var(--border2)=#4a4845`, `var(--text)=#f5f0eb`, `var(--text2)=#a89880`, `var(--text3)=#6b5e52`, `var(--accent)=#d97706`
- Fonts: `var(--font-sans)="DM Sans"`, `var(--font-mono)="DM Mono"`
- Number locale: `"es-AR"`
- Path alias `@/*` = `src/*`
- All currency formatted as `$` + `toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
- `Article` and `SizeValue` types from `@/types` — do not redefine
- No new npm packages

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/orderSummary.ts` | Pure function: group articles by category, compute canonical sizes + quantities + costs |
| Create | `src/components/orders/ResumenModal.tsx` | Modal: receives `articles`, calls `computeOrderSummary`, renders tables |
| Modify | `src/components/orders/OrderStickyBar.tsx` | Add optional `onOpenResumen` prop + "Ver resumen" button |
| Modify | `src/app/(app)/orders/new/page.tsx` | Add `resumenOpen` state, pass to sticky bar, render modal |
| Modify | `src/app/(app)/orders/[id]/edit/page.tsx` | Same as new/page.tsx |

---

## Task 1: Computation logic — `orderSummary.ts`

**Files:**
- Create: `src/lib/orderSummary.ts`

**Interfaces:**
- Consumes: `Article`, `SizeValue`, `ArticleRow` from `@/types`
- Produces: `CategorySummary` (exported type), `computeOrderSummary(articles: Article[]): CategorySummary[]`

- [ ] **Step 1: Create `src/lib/orderSummary.ts`**

```typescript
import type { Article } from "@/types";

export interface CategorySummary {
  categoryName: string;
  canonicalSizes: string[]; // ordered by first appearance
  quantityBySize: Record<string, number>; // canonical → total units
  totalUnits: number;
  totalCost: number; // sum of (price × units) per article
  avgCost: number;   // totalCost / totalUnits, 0 if totalUnits === 0
}

export function computeOrderSummary(articles: Article[]): CategorySummary[] {
  // categoryName → accumulator
  const map = new Map<
    string,
    {
      canonicalOrder: string[]; // insertion-order canonical sizes
      seenCanonicals: Set<string>;
      quantityBySize: Record<string, number>;
      totalUnits: number;
      totalCost: number;
    }
  >();

  for (const article of articles) {
    const categoryName = article.category?.name ?? "Sin categoría";
    const price = parseFloat(article.price || "0");
    const articlePrice = isNaN(price) ? 0 : price;

    if (!map.has(categoryName)) {
      map.set(categoryName, {
        canonicalOrder: [],
        seenCanonicals: new Set(),
        quantityBySize: {},
        totalUnits: 0,
        totalCost: 0,
      });
    }
    const acc = map.get(categoryName)!;

    // Build a canonical map for this article's sizes: sizeName → canonical
    const sizeToCanonical = new Map<string, string>();
    for (const size of article.sizes) {
      const canonical = size.equivalencia || size.name;
      sizeToCanonical.set(size.name, canonical);
      if (!acc.seenCanonicals.has(canonical)) {
        acc.seenCanonicals.add(canonical);
        acc.canonicalOrder.push(canonical);
      }
    }

    let articleUnits = 0;

    for (const row of article.rows) {
      for (const size of article.sizes) {
        const canonical = sizeToCanonical.get(size.name)!;

        // Sum warehouseQuantities keys ending in `:${size.name}`
        let qty = 0;
        const suffix = `:${size.name}`;
        for (const [key, val] of Object.entries(row.warehouseQuantities)) {
          if (key.endsWith(suffix)) {
            const n = parseFloat(val);
            if (!isNaN(n)) qty += n;
          }
        }
        // Also add plain quantities (no-warehouse mode)
        const plain = parseFloat(row.quantities[size.name] || "0");
        if (!isNaN(plain)) qty += plain;

        if (qty > 0) {
          acc.quantityBySize[canonical] = (acc.quantityBySize[canonical] ?? 0) + qty;
          articleUnits += qty;
        }
      }
    }

    acc.totalUnits += articleUnits;
    acc.totalCost += articlePrice * articleUnits;
  }

  const result: CategorySummary[] = [];
  for (const [categoryName, acc] of map) {
    result.push({
      categoryName,
      canonicalSizes: acc.canonicalOrder,
      quantityBySize: acc.quantityBySize,
      totalUnits: acc.totalUnits,
      totalCost: acc.totalCost,
      avgCost: acc.totalUnits > 0 ? acc.totalCost / acc.totalUnits : 0,
    });
  }

  result.sort((a, b) => a.categoryName.localeCompare(b.categoryName, "es"));
  return result;
}
```

- [ ] **Step 2: Verify logic manually**

Open browser console on any order page with articles. Paste and run:
```js
// In browser console — after the app loads
// This is just a sanity-check shape; actual verification is in Task 3 via the modal UI
console.log("orderSummary module loaded");
```
No errors in the TypeScript build is the acceptance criterion. Check with:
```bash
cd casa-sonia-compras
pnpm build 2>&1 | grep -i error
```
Expected: no TypeScript errors in `src/lib/orderSummary.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/orderSummary.ts
git commit -m "feat(orders): add computeOrderSummary pure function"
```

---

## Task 2: ResumenModal component

**Files:**
- Create: `src/components/orders/ResumenModal.tsx`

**Interfaces:**
- Consumes: `computeOrderSummary`, `CategorySummary` from `@/lib/orderSummary`; `Article` from `@/types`
- Produces: `ResumenModal` React component with props `{ opened: boolean; onClose: () => void; articles: Article[] }`

- [ ] **Step 1: Create `src/components/orders/ResumenModal.tsx`**

```tsx
"use client";
import { Modal, ScrollArea, Text } from "@mantine/core";
import type { Article } from "@/types";
import { computeOrderSummary } from "@/lib/orderSummary";

interface Props {
  opened: boolean;
  onClose: () => void;
  articles: Article[];
}

const thBase: React.CSSProperties = {
  background: "var(--surface3)",
  color: "var(--text2)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  border: "1px solid var(--border2)",
  padding: "4px 8px",
  textAlign: "center",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const thAccent: React.CSSProperties = {
  ...thBase,
  color: "var(--accent)",
  background: "rgba(217,119,6,0.06)",
};

const tdBase: React.CSSProperties = {
  background: "var(--surface2)",
  color: "var(--text)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  border: "1px solid var(--border)",
  padding: "6px 8px",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
};

const tdAccent: React.CSSProperties = {
  ...tdBase,
  color: "var(--accent)",
  background: "rgba(217,119,6,0.06)",
};

const tdZero: React.CSSProperties = {
  ...tdBase,
  color: "var(--text3)",
};

function formatCost(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ResumenModal({ opened, onClose, articles }: Props) {
  const summaries = computeOrderSummary(articles);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Resumen de orden"
      size="xl"
      scrollAreaComponent={ScrollArea.Autosize}
      styles={{
        content: { background: "var(--surface)" },
        header: { background: "var(--surface)", borderBottom: "1px solid var(--border)" },
        title: { fontSize: 14, fontWeight: 600, color: "var(--text)" },
      }}
    >
      {summaries.length === 0 ? (
        <Text
          size="sm"
          style={{ color: "var(--text3)", textAlign: "center", padding: "32px 0" }}
        >
          No hay artículos cargados.
        </Text>
      ) : (
        summaries.map((cat, catIdx) => (
          <div key={cat.categoryName} style={{ marginBottom: 24 }}>
            {/* Category header */}
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-sans)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text3)",
                borderBottom: "1px solid var(--border)",
                paddingBottom: 6,
                marginBottom: 8,
                marginTop: catIdx === 0 ? 0 : 20,
              }}
            >
              {cat.categoryName}
            </div>

            {/* Summary table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...thBase, textAlign: "left", minWidth: 120 }}>
                      Categoría
                    </th>
                    {cat.canonicalSizes.map((cs) => (
                      <th scope="col" key={cs} style={{ ...thBase, width: 52 }}>
                        {cs}
                      </th>
                    ))}
                    <th scope="col" style={{ ...thAccent, width: 80 }}>Total</th>
                    <th scope="col" style={{ ...thAccent, width: 100 }}>Costo total</th>
                    <th scope="col" style={{ ...thAccent, width: 100 }}>Costo prom.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...tdBase, textAlign: "left", color: "var(--text2)", fontFamily: "var(--font-sans)", fontSize: 12 }}>
                      Totales
                    </td>
                    {cat.canonicalSizes.map((cs) => {
                      const qty = cat.quantityBySize[cs] ?? 0;
                      return (
                        <td key={cs} style={qty === 0 ? tdZero : tdBase}>
                          {qty === 0 ? "—" : qty}
                        </td>
                      );
                    })}
                    <td style={tdAccent}>{cat.totalUnits}</td>
                    <td style={tdAccent}>{formatCost(cat.totalCost)}</td>
                    <td style={tdAccent}>{formatCost(cat.avgCost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -i error
```
Expected: no errors in `src/components/orders/ResumenModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/ResumenModal.tsx
git commit -m "feat(orders): add ResumenModal component"
```

---

## Task 3: Wire up — sticky bar + pages

**Files:**
- Modify: `src/components/orders/OrderStickyBar.tsx`
- Modify: `src/app/(app)/orders/new/page.tsx`
- Modify: `src/app/(app)/orders/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `ResumenModal` from Task 2
- Produces: "Ver resumen" button visible in sticky bar on both order pages; modal opens/closes correctly

- [ ] **Step 1: Add `onOpenResumen` prop to `OrderStickyBar`**

In `src/components/orders/OrderStickyBar.tsx`:

1a. Add `LayoutList` to the lucide import:
```tsx
import { ArrowLeft, LayoutList } from "lucide-react";
```

1b. Add the optional prop to the `Props` interface (after `onBack`):
```tsx
onOpenResumen?: () => void;
```

1c. Destructure it in the function signature:
```tsx
export function OrderStickyBar({
  title,
  supplier,
  articles,
  totalUnits,
  totalAmount,
  onBack,
  onOpenResumen,
}: Props) {
```

1d. Inside the right-side `<div>` (the one with `marginLeft: "auto"`), add the button **before** the existing badges:
```tsx
<div
  style={{
    marginLeft: "auto",
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexShrink: 0,
  }}
>
  {onOpenResumen && (
    <button
      type="button"
      onClick={onOpenResumen}
      style={{
        background: "none",
        border: "1px solid var(--border2)",
        color: "var(--text2)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontFamily: "var(--font-sans)",
        whiteSpace: "nowrap",
        transition: "color 120ms ease, border-color 120ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--text)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--text2)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border2)";
      }}
    >
      <LayoutList size={12} />
      Ver resumen
    </button>
  )}
  {totalUnits > 0 && (
    <Badge color="amber" variant="light" size="sm">
      {totalUnits} u.
    </Badge>
  )}
  {totalAmount > 0 && !isMobile && (
    <Badge color="amber" variant="outline" size="sm">
      $
      {totalAmount.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </Badge>
  )}
</div>
```

- [ ] **Step 2: Wire up `new/page.tsx`**

In `src/app/(app)/orders/new/page.tsx`:

2a. Add import at the top with the other order component imports:
```tsx
import { ResumenModal } from "@/components/orders/ResumenModal";
```

2b. Add state after the existing `isSaving` state line:
```tsx
const [resumenOpen, setResumenOpen] = useState(false);
```

2c. Add `onOpenResumen` prop to `<OrderStickyBar>`:
```tsx
<OrderStickyBar
  title="Nueva Orden de Compra"
  supplier={supplier}
  articles={articles}
  totalUnits={totals.units}
  totalAmount={totals.amount}
  onBack={() => router.push("/orders")}
  onOpenResumen={() => setResumenOpen(true)}
/>
```

2d. Add the modal just after `<OrderStickyBar>`:
```tsx
<ResumenModal
  opened={resumenOpen}
  onClose={() => setResumenOpen(false)}
  articles={articles}
/>
```

- [ ] **Step 3: Wire up `edit/page.tsx`**

In `src/app/(app)/orders/[id]/edit/page.tsx`:

3a. Add import:
```tsx
import { ResumenModal } from "@/components/orders/ResumenModal";
```

3b. Add state after `const [errorModal, setErrorModal] = useState(false);`:
```tsx
const [resumenOpen, setResumenOpen] = useState(false);
```

3c. Add `onOpenResumen` prop to `<OrderStickyBar>` (currently at line ~289):
```tsx
<OrderStickyBar
  title={
    order.status === "CONFIRMED"
      ? `Orden confirmada · ${order.odooOrderName}`
      : `Editando borrador #${order.id}`
  }
  supplier={supplier}
  articles={articles}
  totalUnits={totals.units}
  totalAmount={totals.amount}
  onBack={() => router.push("/orders")}
  onOpenResumen={() => setResumenOpen(true)}
/>
```

3d. Add the modal just after `<OrderStickyBar>`:
```tsx
<ResumenModal
  opened={resumenOpen}
  onClose={() => setResumenOpen(false)}
  articles={articles}
/>
```

- [ ] **Step 4: Build check**

```bash
pnpm build 2>&1 | grep -i error
```
Expected: clean build, zero TypeScript errors.

- [ ] **Step 5: Manual smoke test**

1. `pnpm dev`
2. Open `/orders/new` — sticky bar should show "Ver resumen" button (with `LayoutList` icon)
3. Click "Ver resumen" with no articles → modal opens showing "No hay artículos cargados."
4. Add 2 articles in different categories, add sizes and quantities, click "Ver resumen"
   - Each category shows as a separate block with its name as uppercase header
   - Canonical size columns appear (sizes with same `equivalencia` merge into one column)
   - "Total", "Costo total", "Costo prom." columns show correct values
   - Zero-quantity sizes show "—" in muted color
5. Open an existing draft order at `/orders/[id]/edit` — same button and modal behavior
6. Press Escape or click X → modal closes

- [ ] **Step 6: Commit**

```bash
git add src/components/orders/OrderStickyBar.tsx \
        src/app/\(app\)/orders/new/page.tsx \
        "src/app/(app)/orders/[id]/edit/page.tsx"
git commit -m "feat(orders): wire Ver resumen button and modal into order pages"
```

---

## Self-Review

**Spec coverage:**
- ✅ "Ver Resumen" button in sticky bar header
- ✅ Modal with articles grouped by category (alphabetical)
- ✅ Canonical size equivalences (size.equivalencia || size.name)
- ✅ Quantity per canonical size column
- ✅ Costo total per category (price × units)
- ✅ Cantidad total (totalUnits)
- ✅ Costo promedio (totalCost / totalUnits)
- ✅ Grid design matching ArticleRow aesthetics (custom HTML table, inline styles, mono font)
- ✅ Both new/page.tsx and edit/page.tsx wired
- ✅ Empty state

**Placeholder scan:** none found.

**Type consistency:**
- `CategorySummary` defined in Task 1, consumed in Task 2 — ✅
- `computeOrderSummary(articles: Article[]): CategorySummary[]` — used identically in both tasks — ✅
- `ResumenModal` props `{ opened, onClose, articles }` — produced in Task 2, consumed in Task 3 — ✅
- `onOpenResumen?: () => void` — added to `OrderStickyBar` in Task 3 Step 1, passed in Steps 2 and 3 — ✅
