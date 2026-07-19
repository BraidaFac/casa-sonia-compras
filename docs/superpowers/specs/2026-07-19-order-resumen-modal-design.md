# Design: Modal "Ver Resumen" en órdenes de compra

**Date:** 2026-07-19  
**Status:** Approved

---

## Overview

Add a "Ver resumen" button to the order sticky bar that opens a read-only summary modal. The modal groups all articles in the current order by category and computes key metrics per category: total cost, quantity per canonical size, total units, and average cost per unit.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/lib/orderSummary.ts` | Pure computation logic — no UI dependencies |
| `src/components/orders/ResumenModal.tsx` | Modal component — display only |

### Modified files

| File | Change |
|------|--------|
| `src/components/orders/OrderStickyBar.tsx` | Add optional `onOpenResumen?: () => void` prop + button |
| `src/app/(app)/orders/new/page.tsx` | Pass `onOpenResumen` to `OrderStickyBar` |
| `src/app/(app)/orders/[id]/edit/page.tsx` | Pass `onOpenResumen` to `OrderStickyBar` |

---

## Computation logic (`src/lib/orderSummary.ts`)

### Types

```ts
export interface CategorySummary {
  categoryName: string;
  canonicalSizes: string[];           // ordered columns (first-appearance order)
  quantityBySize: Record<string, number>; // canonical → total units
  totalUnits: number;
  totalCost: number;                  // sum of (price × units) per article
  avgCost: number;                    // totalCost / totalUnits (0 if totalUnits === 0)
}
```

### Function signature

```ts
export function computeOrderSummary(articles: Article[]): CategorySummary[]
```

### Algorithm

1. For each article:
   - Determine category key: `article.category?.name ?? "Sin categoría"`
   - For each `ArticleRow` in `article.rows`:
     - For each size in `article.sizes`:
       - Resolve quantity:
         - If `selectedWarehouses` present: sum all `warehouseQuantities[${wId}:${sizeName}]` across warehouses
         - Since `OrderSummary` doesn't receive warehouses, sum all keys in `warehouseQuantities` matching `:${sizeName}` suffix, plus `quantities[sizeName]`
       - Resolve canonical: `size.equivalencia || size.name`
       - Accumulate `quantityBySize[canonical] += qty`
   - Accumulate `totalCost += parseFloat(article.price || "0") × articleTotalUnits`

2. Build `canonicalSizes` per category: insertion-order Set across all sizes seen (preserves supplier's logical size order).

3. Sort categories alphabetically by `categoryName`.

4. Compute `avgCost = totalCost / totalUnits` (guard divide-by-zero → 0).

### Edge cases

- `article.price` empty or NaN → treat as 0 (no cost contribution)
- Article with no category → bucketed under `"Sin categoría"`
- Size with no `equivalencia` → canonical = `size.name`
- Quantity string empty or NaN → treat as 0
- Article with no sizes → skipped (contributes 0 units, 0 cost)

---

## UI: `OrderStickyBar` changes

Add optional prop:

```ts
onOpenResumen?: () => void;
```

When present, render a button **before** the totals badges (right-side group):

```tsx
<Button
  variant="subtle"
  size="xs"
  color="gray"
  leftSection={<LayoutList size={13} />}
  onClick={onOpenResumen}
>
  Ver resumen
</Button>
```

No change to existing layout when prop is absent.

---

## UI: `ResumenModal.tsx`

### Props

```ts
interface Props {
  opened: boolean;
  onClose: () => void;
  articles: Article[];
}
```

### Modal shell

- Mantine `<Modal>`, `size="xl"`, `scrollAreaComponent={ScrollArea.Autosize}`
- Title: `"Resumen de orden"`, `size="md"`
- Modal body background: `var(--surface)`

### Per-category block

Rendered for each `CategorySummary`, sorted alphabetically:

**Category header:**
```css
font-size: 10px;
font-family: var(--font-sans);
letter-spacing: 0.08em;
text-transform: uppercase;
color: var(--text3);
border-bottom: 1px solid var(--border);
padding-bottom: 6px;
margin-bottom: 8px;
margin-top: 20px; /* 0 for first category */
```

**Table** (`<table>` with `border-collapse: collapse`, `width: 100%`):

`<thead>` row:
- First column "Categoría": left-aligned, `min-width: 120px`
- One column per `canonicalSize`: `width: 52px`, centered
- Column "Total": `width: 80px`, `color: var(--accent)`
- Column "Costo total": `width: 100px`, `color: var(--accent)`
- Column "Costo prom.": `width: 100px`, `color: var(--accent)`

Header cell styles:
```css
background: var(--surface3);
color: var(--text2);
font-size: 11px;
font-family: var(--font-mono);
border: 1px solid var(--border2);
padding: 4px 8px;
text-align: center;
```
Accent columns get `background: rgba(217,119,6,0.06)`.

`<tbody>` single row "Totales":
- First cell: `"Totales"`, `color: var(--text2)`, `font-family: var(--font-sans)`, `font-size: 12px`, left-aligned
- Size cells: quantity value; `0` rendered as `color: var(--text3)`
- Total, Costo total, Costo prom. cells: accent-tinted background

Data cell styles:
```css
background: var(--surface2);
color: var(--text);
font-family: var(--font-mono);
font-size: 13px;
border: 1px solid var(--border);
padding: 6px 8px;
text-align: center;
font-variant-numeric: tabular-nums;
```

### Number formatting

- Quantities: integer, no decimals
- Costo total / Costo prom.: `$` + `toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`

### Empty state

If `articles` is empty or all have no quantities: show `"No hay artículos cargados."` centered in `color: var(--text3)`.

---

## Page integration

Both `new/page.tsx` and `edit/page.tsx`:

1. Add `resumenOpen` boolean state
2. Pass `onOpenResumen={() => setResumenOpen(true)}` to `OrderStickyBar`
3. Render `<ResumenModal opened={resumenOpen} onClose={() => setResumenOpen(false)} articles={articles} />`

`articles` state already exists in both pages (passed down to `OrderGrid`).

---

## Motion

Mantine Modal default transition (150ms fade + scale). No custom animation. Complies with product register: motion conveys state, not decoration.

---

## Accessibility

- Modal traps focus (Mantine default)
- Close via Escape key (Mantine default)
- Table uses semantic `<table>`, `<thead>`, `<tbody>`, `<th scope="col">` for screen readers

---

## Out of scope

- Export/print of the summary
- Per-article breakdown within a category
- Warehouse-level size breakdown
- Edit actions from the modal
