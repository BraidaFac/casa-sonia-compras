# OrderGrid Performance — React.memo + useCallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent O(n) re-renders when the user edits a single article in a large order (50-100 articles) by memoizing computed values, stabilizing callbacks, and isolating per-article renders.

**Architecture:** Three layered fixes. First, wrap expensive computed values in `useMemo` so they don't recalculate on unrelated renders. Second, wrap all handlers in `useCallback` so their references are stable across renders. Third, introduce a thin `ArticleRowContainer` wrapper that creates per-article stable callbacks and is wrapped in `React.memo` — so only the article that changed re-renders, not all 50-100.

**Tech Stack:** React 18 (`memo`, `useCallback`, `useMemo`, `useRef`), TypeScript. No new dependencies.

## Global Constraints

- No new npm packages.
- Do not change `ArticleRow.tsx` prop interface — zero risk to the 2793-line component.
- All changes are in `src/components/orders/`.
- No test framework exists in this project — manual browser verification only.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/components/orders/OrderGrid.tsx` | Add `useMemo` for computed values, `useCallback` for all handlers, `useRef` for `printValues`, replace inline `ArticleRow` render with `ArticleRowContainer` |
| Create | `src/components/orders/ArticleRowContainer.tsx` | Thin wrapper: receives stable handlers + article, creates per-article callbacks via `useCallback`, renders `ArticleRow`, wrapped in `React.memo` |

---

### Task 1: `useMemo` for computed values in OrderGrid

**Files:**
- Modify: `src/components/orders/OrderGrid.tsx:307-492`

**What & why:** `totalUnits`, `totalAmount`, `missingRequiredPerArticle` and related booleans currently recalculate on every render — even unrelated state changes. With 100 articles each containing multiple rows and sizes, this is significant CPU work per keystroke.

**Interfaces:**
- Produces: same variable names, same types — only wrapped in `useMemo`

- [ ] **Step 1: Add `useMemo` import**

At line 2, change:
```tsx
import { useState, useEffect, useRef } from "react";
```
to:
```tsx
import { useState, useEffect, useRef, useMemo } from "react";
```

- [ ] **Step 2: Wrap `totalUnits` in `useMemo`**

Find (around line 307):
```tsx
  const totalUnits = articles.reduce((sum, article) => {
```

Replace the entire `totalUnits` block (ends before `const totalAmount`) with:
```tsx
  const totalUnits = useMemo(() => articles.reduce((sum, article) => {
    return (
      sum +
      article.rows.reduce((s2, row) => {
        if (selectedWarehouses.length > 0) {
          return (
            s2 +
            Object.values(row.warehouseQuantities || {}).reduce(
              (s, v) => s + (parseInt(v || "0", 10) || 0),
              0,
            )
          );
        }
        return (
          s2 +
          article.sizes.reduce((s3, size) => {
            const qty = parseInt(row.quantities[size.name] || "0", 10);
            return s3 + (isNaN(qty) ? 0 : qty);
          }, 0)
        );
      }, 0)
    );
  }, 0), [articles, selectedWarehouses]);
```

- [ ] **Step 3: Wrap `totalAmount` in `useMemo`**

Find (around line 331):
```tsx
  const totalAmount = articles.reduce((sum, article) => {
```

Replace the entire `totalAmount` block with:
```tsx
  const totalAmount = useMemo(() => articles.reduce((sum, article) => {
    return (
      sum +
      article.rows.reduce((s2, row) => {
        if (selectedWarehouses.length > 0) {
          return (
            s2 +
            Object.entries(row.warehouseQuantities || {}).reduce(
              (s3, [key, val]) => {
                const qty = parseInt(val || "0", 10);
                if (isNaN(qty) || qty <= 0) return s3;
                const sizeName = key.split(":").slice(1).join(":");
                let price: number;
                if (article.priceGranular) {
                  const specific = row.prices?.[sizeName];
                  price = specific
                    ? parseFloat(specific) || 0
                    : parseFloat(article.price) || 0;
                } else {
                  price = parseFloat(article.price) || 0;
                }
                return s3 + price * qty;
              },
              0,
            )
          );
        }
        return (
          s2 +
          article.sizes.reduce((s3, size) => {
            const qty = parseInt(row.quantities[size.name] || "0", 10);
            if (isNaN(qty) || qty <= 0) return s3;
            let price: number;
            if (article.priceGranular) {
              const specific = row.prices?.[size.name];
              price = specific
                ? parseFloat(specific) || 0
                : parseFloat(article.price) || 0;
            } else {
              price = parseFloat(article.price) || 0;
            }
            return s3 + price * qty;
          }, 0)
        );
      }, 0)
    );
  }, 0), [articles, selectedWarehouses]);
```

- [ ] **Step 4: Wrap `hasDirtyData` in `useMemo`**

Find (around line 383):
```tsx
  const hasDirtyData =
    articles.length > 1 ||
```

Replace with:
```tsx
  const hasDirtyData = useMemo(() =>
    articles.length > 1 ||
    (articles.length === 1 &&
      (articles[0].name.trim() !== "" ||
        articles[0].sizes.length > 0 ||
        articles[0].rows.some((r) =>
          Object.values(r.quantities).some((q) => parseInt(q || "0", 10) > 0),
        ))),
  [articles]);
```

- [ ] **Step 5: Wrap validation computed values in `useMemo`**

Find (around line 432):
```tsx
  function articleRowHasQty(
```

After the `articleRowHasQty` and `articleHasQty` function definitions (leave those as-is), find:

```tsx
  const hasValidationErrors = articles.some((a) => {
```

Replace from there through to `const firstMissingArticleId = ...` with:
```tsx
  const { hasValidationErrors, missingBrand, hasAnyQty, missingRequiredPerArticle, firstMissingArticleId } = useMemo(() => {
    const hasValidationErrors = articles.some((a) => {
      const hasQty = articleHasQty(a);
      const missingPrice = !a.priceGranular && !a.price && hasQty;
      const missingColor = a.rows.some((r) => articleRowHasQty(a, r) && !r.color);
      return missingPrice || missingColor;
    });

    const missingBrand = articles.some((a) => {
      if (!articleHasQty(a)) return false;
      const brandAttr = a.attributes.find((attr) =>
        attr.attributeName.toLowerCase().includes("marca"),
      );
      return !brandAttr || brandAttr.values.length === 0;
    });

    const hasAnyQty = articles.some((a) => articleHasQty(a));

    const missingRequiredPerArticle: Record<string, string[]> = {};
    for (const article of articles) {
      const missing = getMissingRequiredKeys(article);
      if (missing.length > 0) missingRequiredPerArticle[article.id] = missing;
    }

    const firstMissingArticleId = articles.find(
      (a) => missingRequiredPerArticle[a.id],
    )?.id;

    return { hasValidationErrors, missingBrand, hasAnyQty, missingRequiredPerArticle, firstMissingArticleId };
  }, [articles]); // eslint-disable-line react-hooks/exhaustive-deps
```

Note: `articleRowHasQty`, `articleHasQty`, `getMissingRequiredKeys` are defined above — they read `selectedWarehouses` via closure. Add it to deps:
```tsx
  }, [articles, selectedWarehouses]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 6: Remove now-duplicate declarations**

After the `useMemo` block above, delete these lines (they were separate declarations before, now computed inside useMemo):
```tsx
  const hasMissingRequiredAttrs =
    Object.keys(missingRequiredPerArticle).length > 0;
  const firstMissingArticleId = articles.find(
    (a) => missingRequiredPerArticle[a.id],
  )?.id;
```

Add after the useMemo block:
```tsx
  const hasMissingRequiredAttrs = Object.keys(missingRequiredPerArticle).length > 0;
```

- [ ] **Step 7: Verify build compiles**

```bash
cd /c/Users/frbra/Desktop/Proyectos/orden-compra/casa-sonia-compras
pnpm build 2>&1 | tail -30
```

Expected: no TypeScript errors. Fix any type errors before continuing.

- [ ] **Step 8: Commit**

```bash
cd /c/Users/frbra/Desktop/Proyectos/orden-compra/casa-sonia-compras
git add src/components/orders/OrderGrid.tsx
git commit -m "perf(orders): useMemo for computed totals and validation in OrderGrid"
```

---

### Task 2: Stable callbacks with `useCallback` in OrderGrid

**Files:**
- Modify: `src/components/orders/OrderGrid.tsx`

**What & why:** Every handler function (`updateArticle`, `removeArticle`, etc.) is recreated on every render. When passed as props they cause all children to re-render. `useCallback` gives them stable references. Special case: `getPrintValue` reads `printValues` state — use a `useRef` mirror so the callback stays stable without a stale closure.

**Interfaces:**
- Produces: same function names, same signatures — just stable references

- [ ] **Step 1: Add `useCallback` to import**

```tsx
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
```

- [ ] **Step 2: Add `printValuesRef` mirror**

Right after `const [printValues, setPrintValues] = useState<PrintValues>(...)` (around line 143), add:
```tsx
  const printValuesRef = useRef(printValues);
  useEffect(() => {
    printValuesRef.current = printValues;
  }, [printValues]);
```

- [ ] **Step 3: Wrap `updateArticles` helper in `useCallback`**

Find (around line 123):
```tsx
  function updateArticles(
    updater: Article[] | ((prev: Article[]) => Article[]),
  ) {
    setArticles((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }
```

Replace with:
```tsx
  const updateArticles = useCallback((
    updater: Article[] | ((prev: Article[]) => Article[]),
  ) => {
    setArticles((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);
```

- [ ] **Step 4: Wrap `updateArticle` in `useCallback`**

Find (around line 256):
```tsx
  function updateArticle(id: string, updated: Article) {
    updateArticles((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }
```

Replace with:
```tsx
  const updateArticle = useCallback((id: string, updated: Article) => {
    updateArticles((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }, [updateArticles]);
```

- [ ] **Step 5: Wrap `removeArticle` in `useCallback`**

Find:
```tsx
  function removeArticle(id: string) {
    updateArticles((prev) => prev.filter((a) => a.id !== id));
  }
```

Replace with:
```tsx
  const removeArticle = useCallback((id: string) => {
    updateArticles((prev) => prev.filter((a) => a.id !== id));
  }, [updateArticles]);
```

- [ ] **Step 6: Wrap `duplicateArticle` in `useCallback` using functional updater**

Find (around line 264):
```tsx
  function duplicateArticle(id: string) {
    const original = articles.find((a) => a.id === id);
    if (!original) return;

    const duplicated: Article = {
      ...original,
      ...
    };

    updateArticles((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, duplicated);
      return next;
    });
  }
```

Replace with (move the `original` lookup inside the functional updater so it doesn't close over `articles`):
```tsx
  const duplicateArticle = useCallback((id: string) => {
    updateArticles((prev) => {
      const original = prev.find((a) => a.id === id);
      if (!original) return prev;

      const duplicated: Article = {
        ...original,
        id: crypto.randomUUID(),
        name: "",
        referencia: "",
        existingProductId: null,
        colorImages: {},
        deletedOdooImageIds: [],
        clearedPrimaryColorNames: [],
        rows: original.rows.map((row) => ({
          ...row,
          id: crypto.randomUUID(),
          quantities: {},
          warehouseQuantities: {},
          barcodes: {},
        })),
        sizes: original.sizes.map((size) => ({ ...size })),
        attributes: original.attributes.map((attr) => ({
          ...attr,
          values: [...attr.values],
        })),
      };

      const idx = prev.findIndex((a) => a.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, duplicated);
      return next;
    });
  }, [updateArticles]);
```

- [ ] **Step 7: Wrap `addArticle` in `useCallback`**

Find (around line 299):
```tsx
  function addArticle() {
    const brandInfo =
      globalBrand && brandAttributeId
        ? { attributeId: brandAttributeId, brand: globalBrand }
        : null;
    updateArticles((prev) => [...prev, createEmptyArticle(brandInfo)]);
  }
```

Replace with:
```tsx
  const addArticle = useCallback(() => {
    const brandInfo =
      globalBrand && brandAttributeId
        ? { attributeId: brandAttributeId, brand: globalBrand }
        : null;
    updateArticles((prev) => [...prev, createEmptyArticle(brandInfo)]);
  }, [globalBrand, brandAttributeId, updateArticles]);
```

- [ ] **Step 8: Wrap print column handlers in `useCallback`**

Find (around line 212):
```tsx
  function addPrintColumn() {
    setPrintColumns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), header: "" },
    ]);
  }

  function updatePrintColumnHeader(id: string, header: string) {
    setPrintColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, header } : col)),
    );
  }

  function removePrintColumn(id: string) {
    setPrintColumns((prev) => prev.filter((col) => col.id !== id));
    setPrintValues((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.includes(`:${id}`)) delete next[key];
      });
      return next;
    });
  }

  function updatePrintValue(
    articleId: string,
    rowId: string,
    columnId: string,
    value: string,
  ) {
    setPrintValues((prev) => ({
      ...prev,
      [`${articleId}:${rowId}:${columnId}`]: value,
    }));
  }

  function getPrintValue(
    articleId: string,
    rowId: string,
    columnId: string,
  ): string {
    return printValues[`${articleId}:${rowId}:${columnId}`] || "";
  }
```

Replace with:
```tsx
  const addPrintColumn = useCallback(() => {
    setPrintColumns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), header: "" },
    ]);
  }, []);

  const updatePrintColumnHeader = useCallback((id: string, header: string) => {
    setPrintColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, header } : col)),
    );
  }, []);

  const removePrintColumn = useCallback((id: string) => {
    setPrintColumns((prev) => prev.filter((col) => col.id !== id));
    setPrintValues((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.includes(`:${id}`)) delete next[key];
      });
      return next;
    });
  }, []);

  const updatePrintValue = useCallback((
    articleId: string,
    rowId: string,
    columnId: string,
    value: string,
  ) => {
    setPrintValues((prev) => ({
      ...prev,
      [`${articleId}:${rowId}:${columnId}`]: value,
    }));
  }, []);

  // Reads from ref so it stays stable even as printValues changes
  const getPrintValue = useCallback((
    articleId: string,
    rowId: string,
    columnId: string,
  ): string => {
    return printValuesRef.current[`${articleId}:${rowId}:${columnId}`] || "";
  }, []);
```

- [ ] **Step 9: Verify build compiles**

```bash
cd /c/Users/frbra/Desktop/Proyectos/orden-compra/casa-sonia-compras
pnpm build 2>&1 | tail -30
```

Expected: no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/frbra/Desktop/Proyectos/orden-compra/casa-sonia-compras
git add src/components/orders/OrderGrid.tsx
git commit -m "perf(orders): useCallback for all handlers in OrderGrid, stable getPrintValue via ref"
```

---

### Task 3: Create `ArticleRowContainer` and wire into render

**Files:**
- Create: `src/components/orders/ArticleRowContainer.tsx`
- Modify: `src/components/orders/OrderGrid.tsx:520-561`

**What & why:** Even with stable handlers in OrderGrid, the render `articles.map(...)` creates new inline arrow functions per article per render (`onChange={(updated) => updateArticle(article.id, updated)}`). Since you can't call `useCallback` inside a `.map()`, the solution is a wrapper component — each instance of `ArticleRowContainer` is a real component that CAN call `useCallback`, creating per-article stable callbacks. Wrapping it in `React.memo` means it only re-renders when its own `article` prop changes.

**Interfaces:**
- Consumes: all stable handlers from Task 2, `article` object, shared config props
- Produces: `ArticleRowContainer` — drop-in replacement for the `ArticleRow` in the map

- [ ] **Step 1: Add stable empty array constant to OrderGrid**

Right after the imports in `OrderGrid.tsx`, before the `ORDER_DRAFT_KEY` constant:
```tsx
// Stable empty array reference — prevents new array allocation per render for articles with no missing required attrs
const EMPTY_STRING_ARRAY: string[] = [];
```

- [ ] **Step 2: Create `ArticleRowContainer.tsx`**

Create file `src/components/orders/ArticleRowContainer.tsx`:
```tsx
"use client";
import React, { useCallback } from "react";
import { ArticleRow } from "./ArticleRow";
import type {
  Article,
  AttributeValue,
  ColorValue,
  PrintColumn,
  SizeAttribute,
  Warehouse,
} from "@/types";
import type { ProductCategory } from "@/types";

interface Props {
  article: Article;
  // Stable handlers from OrderGrid (all wrapped in useCallback)
  updateArticle: (id: string, updated: Article) => void;
  removeArticle: (id: string) => void;
  duplicateArticle: (id: string) => void;
  getPrintValue: (articleId: string, rowId: string, columnId: string) => string;
  updatePrintValue: (
    articleId: string,
    rowId: string,
    columnId: string,
    value: string,
  ) => void;
  refetchAttrs: () => void;
  // Shared config — stable references expected
  allColors: ColorValue[];
  colorBaseOptions: string[];
  sizeAttributes: SizeAttribute[];
  colorAttributeId: number;
  sizeAttributeId: number;
  categories: ProductCategory[];
  printColumns: PrintColumn[];
  onAddPrintColumn: () => void;
  onUpdatePrintColumnHeader: (id: string, header: string) => void;
  onRemovePrintColumn: (id: string) => void;
  selectedWarehouses: Warehouse[];
  missingRequiredKeys: string[];
  isFirstMissingArticle: boolean;
  orderId?: number;
  readOnly?: boolean;
}

export const ArticleRowContainer = React.memo(function ArticleRowContainer({
  article,
  updateArticle,
  removeArticle,
  duplicateArticle,
  getPrintValue: getPrintValueAll,
  updatePrintValue: updatePrintValueAll,
  refetchAttrs,
  ...rest
}: Props) {
  const { id } = article;

  const onChange = useCallback(
    (updated: Article) => updateArticle(id, updated),
    [id, updateArticle],
  );

  const onRemove = useCallback(
    () => removeArticle(id),
    [id, removeArticle],
  );

  const onDuplicate = useCallback(
    () => duplicateArticle(id),
    [id, duplicateArticle],
  );

  const getPrintValue = useCallback(
    (rowId: string, columnId: string) => getPrintValueAll(id, rowId, columnId),
    [id, getPrintValueAll],
  );

  const onUpdatePrintValue = useCallback(
    (rowId: string, columnId: string, value: string) =>
      updatePrintValueAll(id, rowId, columnId, value),
    [id, updatePrintValueAll],
  );

  const onOpenSizeModal = useCallback(() => refetchAttrs(), [refetchAttrs]);

  return (
    <ArticleRow
      article={article}
      onChange={onChange}
      onRemove={onRemove}
      onDuplicate={onDuplicate}
      getPrintValue={getPrintValue}
      onUpdatePrintValue={onUpdatePrintValue}
      onOpenSizeModal={onOpenSizeModal}
      {...rest}
    />
  );
});
```

- [ ] **Step 3: Add import in OrderGrid and replace render**

At the top of `OrderGrid.tsx`, add import:
```tsx
import { ArticleRowContainer } from "./ArticleRowContainer";
```

Find the render section (around line 523):
```tsx
      {articles.map((article) => {
        return (
          <ArticleRow
            key={article.id}
            article={article}
            allColors={allColors}
            colorBaseOptions={colorBaseOptions}
            sizeAttributes={sizeAttributes}
            colorAttributeId={colorAttributeId}
            sizeAttributeId={sizeAttributeId}
            categories={categories}
            invalidColors={[]}
            invalidSizes={[]}
            printColumns={printColumns}
            onAddPrintColumn={addPrintColumn}
            onUpdatePrintColumnHeader={updatePrintColumnHeader}
            onRemovePrintColumn={removePrintColumn}
            getPrintValue={(rowId, columnId) =>
              getPrintValue(article.id, rowId, columnId)
            }
            onUpdatePrintValue={(rowId, columnId, value) =>
              updatePrintValue(article.id, rowId, columnId, value)
            }
            selectedWarehouses={selectedWarehouses}
            onChange={(updated) => updateArticle(article.id, updated)}
            onRemove={() => removeArticle(article.id)}
            onDuplicate={() => duplicateArticle(article.id)}
            onOpenSizeModal={() => refetchAttrs()}
            missingRequiredKeys={
              effectiveValidateMode ? (missingRequiredPerArticle[article.id] ?? []) : []
            }
            isFirstMissingArticle={
              effectiveValidateMode && article.id === firstMissingArticleId
            }
            orderId={orderId}
            readOnly={readOnly}
          />
        );
      })}
```

Replace with:
```tsx
      {articles.map((article) => (
        <ArticleRowContainer
          key={article.id}
          article={article}
          updateArticle={updateArticle}
          removeArticle={removeArticle}
          duplicateArticle={duplicateArticle}
          getPrintValue={getPrintValue}
          updatePrintValue={updatePrintValue}
          refetchAttrs={refetchAttrs}
          allColors={allColors}
          colorBaseOptions={colorBaseOptions}
          sizeAttributes={sizeAttributes}
          colorAttributeId={colorAttributeId}
          sizeAttributeId={sizeAttributeId}
          categories={categories}
          printColumns={printColumns}
          onAddPrintColumn={addPrintColumn}
          onUpdatePrintColumnHeader={updatePrintColumnHeader}
          onRemovePrintColumn={removePrintColumn}
          selectedWarehouses={selectedWarehouses}
          missingRequiredKeys={
            effectiveValidateMode
              ? (missingRequiredPerArticle[article.id] ?? EMPTY_STRING_ARRAY)
              : EMPTY_STRING_ARRAY
          }
          isFirstMissingArticle={
            effectiveValidateMode && article.id === firstMissingArticleId
          }
          orderId={orderId}
          readOnly={readOnly}
        />
      ))}
```

Note: `invalidColors={[]}` and `invalidSizes={[]}` were always empty arrays in the original — they are optional props with default values in `ArticleRow`, so we can safely omit them.

- [ ] **Step 4: Verify build compiles**

```bash
cd /c/Users/frbra/Desktop/Proyectos/orden-compra/casa-sonia-compras
pnpm build 2>&1 | tail -40
```

Expected: no TypeScript errors. If `ProductCategory` is not exported from `@/types`, check `src/types/index.ts` and use the correct import path.

- [ ] **Step 5: Manual smoke test**

```bash
cd /c/Users/frbra/Desktop/Proyectos/orden-compra/casa-sonia-compras
pnpm dev
```

Open `http://localhost:3000/orders/new` and verify:
1. Page loads normally.
2. Add 5 articles. Edit a field in article 3 — confirm article 3 updates correctly.
3. Change price in article 1 — totals in header update.
4. Add/remove sizes — quantities table updates for that article only.
5. Duplicate an article — duplicate appears with correct data, blank name.
6. Delete an article — removed from list.
7. Print columns: add a column, type header, enter values per row — all work.
8. No console errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/frbra/Desktop/Proyectos/orden-compra/casa-sonia-compras
git add src/components/orders/ArticleRowContainer.tsx src/components/orders/OrderGrid.tsx
git commit -m "perf(orders): ArticleRowContainer with React.memo isolates per-article re-renders"
```

---

## Self-Review

**Spec coverage:**
- ✅ `useMemo` for `totalUnits`, `totalAmount`, `hasDirtyData`, `hasValidationErrors`, `missingBrand`, `hasAnyQty`, `missingRequiredPerArticle`, `firstMissingArticleId`
- ✅ `useCallback` for all handlers: `updateArticles`, `updateArticle`, `removeArticle`, `duplicateArticle`, `addArticle`, `addPrintColumn`, `updatePrintColumnHeader`, `removePrintColumn`, `updatePrintValue`, `getPrintValue`
- ✅ `printValuesRef` prevents stale closure in `getPrintValue`
- ✅ `duplicateArticle` moved to functional updater (no stale `articles` closure)
- ✅ `ArticleRowContainer` with `React.memo` created
- ✅ Inline callbacks in render replaced with stable container
- ✅ `EMPTY_STRING_ARRAY` constant for stable reference
- ✅ `invalidColors`/`invalidSizes` (always `[]`) handled via ArticleRow defaults
- ✅ No changes to `ArticleRow.tsx` interface

**Placeholder scan:** No TBD/TODO/placeholder language found.

**Type consistency:** `ArticleRowContainer` Props interface uses same types as `ArticleRow` Props. `updateArticle(id, updated)` signature consistent across Task 2 and Task 3.
