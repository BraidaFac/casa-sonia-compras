# Inventario — Color Column + Scan History Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `color` field to `InventoryArticle` (resolved from Odoo PTAVs), display it as a column in the scan table, and add a "Historial" button that opens a modal showing the last 10 individual scan events.

**Architecture:** `color` is a PTAV-resolved string (same pattern as `size`) propagated through the type, 3 API routes, and the frontend table. Scan history is pure client-side state — an array prepended on every successful scan, capped at 10, displayed in a `ScanHistoryModal` component inside `page.tsx`.

**Tech Stack:** Next.js App Router, TypeScript, Mantine 9, Odoo JSON-2 via `odoo.ts`

## Global Constraints

- No test framework — verification is manual via `pnpm dev`
- All API routes require `authenticateRequest`
- `colorAttrId` comes from `getAttrMetadata()` in `src/lib/productCache.ts`
- Color resolution: iterate PTAVs, match `colorAttrId`, use `ptav.name`
- `InventoryArticle` is the single source of truth — type change propagates everywhere
- Mantine dark theme, amber primary — match existing visual style

---

### Task 1: Add `color` to `InventoryArticle` type

**Files:**
- Modify: `src/types/index.ts` — add `color` field to `InventoryArticle`

**Interfaces:**
- Produces: `InventoryArticle.color: string | null` — used by Tasks 2, 3, 4, 5

- [ ] **Step 1: Add field to interface**

In `src/types/index.ts`, find `InventoryArticle` (around line 214) and add `color` after `brand`:

```typescript
export interface InventoryArticle {
  varianteId: number;
  productoId: number;
  barcode: string;
  name: string;
  qty: number;
  salePrice: number;
  cost: number;
  lastPurchaseDate: string | null;
  size: string | null;
  brand: string | null;
  color: string | null;          // ← ADD THIS
  categoryId: number;
  categoryName: string;
  categoryParentId: number | null;
  categoryParentName: string | null;
  qtyOnHand: number;
}
```

- [ ] **Step 2: Verify TypeScript catches missing field**

Run: `pnpm build 2>&1 | head -40`
Expected: build errors in the 3 API routes complaining that `color` is missing from the returned object. This confirms the type propagated correctly.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(inventario): add color field to InventoryArticle type"
```

---

### Task 2: Resolve color in `/api/inventario/barcode/route.ts`

**Files:**
- Modify: `src/app/api/inventario/barcode/route.ts`

**Interfaces:**
- Consumes: `InventoryArticle.color: string | null` from Task 1
- Consumes: `colorAttrId` from `getAttrMetadata()`
- Produces: `article.color` populated in JSON response

- [ ] **Step 1: Expose `colorAttrId` from `getAttrMetadata` call**

Around line 95 in `barcode/route.ts`, change the destructure:

```typescript
const [{ sizeAttrIdSet, brandAttrId, colorAttrId }, purchaseOrders, categoryData] = await Promise.all([
```

(was `{ sizeAttrIdSet, brandAttrId }` — add `colorAttrId`)

- [ ] **Step 2: Resolve color from PTAVs**

After the `size` resolution block (around line 134), add color resolution:

```typescript
  // Resolve color from variant PTAVs
  let color: string | null = null;
  for (const ptav of brandResolutionPtavs) {
    const attrId = Array.isArray(ptav.attribute_id) ? ptav.attribute_id[0] : ptav.attribute_id;
    if (colorAttrId && attrId === colorAttrId) {
      color = ptav.name;
      break;
    }
  }
```

Note: `brandResolutionPtavs` is already fetched earlier in the same route (the `odoo.read("product.template.attribute.value", ptavIds, ...)` call). Color resolution reuses that same array.

- [ ] **Step 3: Add `color` to the returned article object**

In the `const article: InventoryArticle = { ... }` block (around line 166), add:

```typescript
  color,
```

after `brand,`.

- [ ] **Step 4: Verify**

```bash
pnpm dev
```
Scan a barcode. Check browser DevTools → Network → `barcode?code=...` response. Should include `"color": "Rojo"` (or null if the variant has no color attribute).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/inventario/barcode/route.ts
git commit -m "feat(inventario): resolve color attribute in barcode route"
```

---

### Task 3: Resolve color in `/api/inventario/category-warmup/route.ts`

**Files:**
- Modify: `src/app/api/inventario/category-warmup/route.ts`

**Interfaces:**
- Consumes: `InventoryArticle.color: string | null` from Task 1
- Consumes: `colorAttrId` from `getAttrMetadata()`

- [ ] **Step 1: Expose `colorAttrId` from `getAttrMetadata` call**

Around line 101, change:

```typescript
  const { sizeAttrIdSet, brandAttrId, colorAttrId } = await getAttrMetadata();
```

(was `{ sizeAttrIdSet, brandAttrId }`)

- [ ] **Step 2: Resolve color inside the `variants.map` block**

In the `articles` mapping (around line 194), after the `size` resolution loop, add:

```typescript
    // Resolve color from PTAVs
    let color: string | null = null;
    for (const ptavId of v.product_template_attribute_value_ids) {
      const ptav = ptavMap.get(ptavId);
      if (!ptav) continue;
      const attrId = Array.isArray(ptav.attribute_id)
        ? ptav.attribute_id[0]
        : (ptav.attribute_id as number);
      if (colorAttrId && attrId === colorAttrId) {
        color = ptav.name;
        break;
      }
    }
```

- [ ] **Step 3: Add `color` to returned object**

In the `return { ... }` inside `variants.map`, add `color,` after `brand:`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/inventario/category-warmup/route.ts
git commit -m "feat(inventario): resolve color in category warmup route"
```

---

### Task 4: Resolve color in `/api/inventario/variants/route.ts`

**Files:**
- Modify: `src/app/api/inventario/variants/route.ts`

**Interfaces:**
- Consumes: `InventoryArticle.color: string | null` from Task 1
- Consumes: `colorAttrId` from `getAttrMetadata()`

- [ ] **Step 1: Expose `colorAttrId` from `getAttrMetadata` call**

Around line 57, change:

```typescript
  const [{ sizeAttrIdSet, brandAttrId, colorAttrId }, categoryData, locations] = await Promise.all([
```

(was `{ sizeAttrIdSet, brandAttrId }`)

- [ ] **Step 2: Resolve color inside the `variants.map` block**

In the `articles` mapping (around line 142), after the `size` resolution loop, add:

```typescript
    // Resolve color from PTAVs
    let color: string | null = null;
    for (const ptavId of ptavIds) {
      const ptav = ptavMap.get(ptavId);
      if (!ptav) continue;
      const attrId = Array.isArray(ptav.attribute_id) ? ptav.attribute_id[0] : ptav.attribute_id;
      if (colorAttrId && attrId === colorAttrId) {
        color = ptav.name;
        break;
      }
    }
```

- [ ] **Step 3: Add `color` to returned object**

In the `return { ... }` inside `variants.map`, add `color,` after `brand,`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/inventario/variants/route.ts
git commit -m "feat(inventario): resolve color in variants route"
```

---

### Task 5: Frontend — color column + scan history modal

**Files:**
- Modify: `src/app/(app)/inventario/[id]/page.tsx`

**Interfaces:**
- Consumes: `InventoryArticle.color: string | null` from Task 1

**Sub-tasks:**

#### 5a — Add `scanHistory` state and update `flashScanned`

- [ ] **Step 1: Add scanHistory state**

In `InventarioCargarContent`, after the `lastScannedId` state block, add:

```typescript
  const [scanHistory, setScanHistory] = useState<InventoryArticle[]>([]);

  function recordScan(article: InventoryArticle) {
    setLastScannedId(article.varianteId);
    setScanHistory((prev) => [article, ...prev].slice(0, 10));
  }
```

- [ ] **Step 2: Replace `flashScanned` calls with `recordScan`**

In `processOneScan`, replace every `flashScanned(...)` call:

| Old | New |
|-----|-----|
| `flashScanned(existing.varianteId)` | `recordScan({ ...existing, qty: existing.qty + 1 })` |
| `flashScanned(updated[0].varianteId)` (cache hit) | `recordScan(updated[0])` |
| `flashScanned(updated[0].varianteId)` (API fetch) | `recordScan(updated[0])` |

In `handleAddVariant`, replace:

| Old | New |
|-----|-----|
| `flashScanned(varianteId)` (existing) | `recordScan(incremented)` where `incremented = { ...existing, qty: existing.qty + 1 }` |
| `flashScanned(article.varianteId)` (new) | `recordScan(article)` |

- [ ] **Step 3: Remove now-unused `flashScanned` function**

Delete the `flashScanned` function (4 lines). `recordScan` replaces it entirely.

#### 5b — Add "Historial" button

- [ ] **Step 4: Add `historialOpen` state**

```typescript
  const [historialOpen, setHistorialOpen] = useState(false);
```

- [ ] **Step 5: Add button to header**

In the `canEdit` header Group (where "Manual" button lives), add before the Manual button:

```tsx
<Button
  size="xs"
  variant="subtle"
  color="gray"
  leftSection={<History size={13} />}
  onClick={() => setHistorialOpen(true)}
  disabled={scanHistory.length === 0}
>
  Historial{scanHistory.length > 0 ? ` · ${scanHistory.length}` : ""}
</Button>
```

- [ ] **Step 6: Import `History` icon**

Add `History` to the lucide-react import at the top of the file:

```typescript
import {
  Plus, Trash2, ScanBarcode, ArrowLeft, ArrowRight,
  Check, X, Minus, AlertCircle, CheckCircle2, Zap, History,
} from "lucide-react";
```

#### 5c — Add color column to articles table

- [ ] **Step 7: Add "Color" to table header**

In the `thead` columns array, add after `{ label: "Talle", w: 70 }`:

```typescript
{ label: "Color", w: 90 },
```

- [ ] **Step 8: Add color cell to `ArticleRow`**

In `ArticleRow`, add a `<td>` between Talle and Precio Venta:

```tsx
{/* Color */}
<td style={{ padding: "10px 12px", color: "var(--text3)", fontSize: 12 }}>
  {article.color ?? "-"}
</td>
```

#### 5d — `ScanHistoryModal` component

- [ ] **Step 9: Add `ScanHistoryModal` to bottom of file**

Add this component after `ArticleRow`:

```tsx
// ── ScanHistoryModal ──────────────────────────────────────────────────────────

function ScanHistoryModal({
  opened,
  onClose,
  history,
}: {
  opened: boolean;
  onClose: () => void;
  history: InventoryArticle[];
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      zIndex={300}
      size="lg"
      title={
        <Group gap={10} align="center">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background:
                "color-mix(in srgb, var(--mantine-color-amber-6) 12%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--mantine-color-amber-6) 25%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <History size={16} color="var(--mantine-color-amber-4)" />
          </div>
          <Text fw={700} size="md" style={{ fontFamily: "var(--font-display)" }}>
            Últimos escaneos
          </Text>
        </Group>
      }
      overlayProps={{ blur: 2, backgroundOpacity: 0.45 }}
    >
      {history.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          Todavía no se escaneó ningún artículo.
        </Text>
      ) : (
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
                {["#", "Código", "Descripción", "Marca", "Color", "Talle"].map(
                  (label) => (
                    <th
                      key={label}
                      style={{
                        padding: "8px 10px",
                        textAlign: "left",
                        color: "var(--text3)",
                        fontWeight: 500,
                        fontSize: 11,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {history.map((a, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background:
                      i === 0
                        ? "rgba(251,191,36,0.18)"
                        : undefined,
                    boxShadow:
                      i === 0
                        ? "inset 4px 0 0 var(--mantine-color-amber-4)"
                        : undefined,
                  }}
                >
                  <td
                    style={{
                      padding: "8px 10px",
                      color: "var(--text3)",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {i + 1}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      color: "var(--text2)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                    }}
                  >
                    {a.barcode}
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--text2)" }}>
                    {a.name}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      color: "var(--text3)",
                      fontSize: 12,
                    }}
                  >
                    {a.brand ?? "-"}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      color: "var(--text3)",
                      fontSize: 12,
                    }}
                  >
                    {a.color ?? "-"}
                  </td>
                  <td
                    style={{
                      padding: "8px 10px",
                      color: "var(--text3)",
                      fontSize: 12,
                    }}
                  >
                    {a.size ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Group
        justify="flex-end"
        pt="sm"
        mt="md"
        style={{ borderTop: "1px solid var(--mantine-color-dark-5)" }}
      >
        <Button size="sm" variant="subtle" color="gray" onClick={onClose}>
          Cerrar
        </Button>
      </Group>
    </Modal>
  );
}
```

- [ ] **Step 10: Mount `ScanHistoryModal` in `InventarioCargarContent` JSX**

After the `<VariantSearchModal .../>` usage, add:

```tsx
<ScanHistoryModal
  opened={historialOpen}
  onClose={() => setHistorialOpen(false)}
  history={scanHistory}
/>
```

- [ ] **Step 11: Manual verification**

```bash
pnpm dev
```

Checklist:
- [ ] Scan 3 different variants → Historial button shows "Historial · 3"
- [ ] Open Historial modal → rows appear, newest on top with amber highlight
- [ ] Color column shows in table and modal
- [ ] Scan same variant twice → history shows 2 individual entries for that variant
- [ ] Scan 11 variants → history caps at 10

- [ ] **Step 12: Commit**

```bash
git add src/app/(app)/inventario/[id]/page.tsx
git commit -m "feat(inventario): scan history modal + color column in scan table"
```
