# Códigos de Barra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar auto-generación de código de referencia en tab Cantidades y una nueva tab "Códigos de Barra" con asignación manual y auto-generación por variante, persitiendo en la BD local y sincronizando a Odoo al confirmar.

**Architecture:** Se agrega `barcodes: Record<string, string>` a `ArticleRow` (siguiendo el patrón de `quantities`). Las utilidades de generación viven en `src/lib/barcodes.ts`. El componente `BarcodeTab` maneja la UI. El sync a Odoo ocurre en el loop existente de procesamiento de artículos en `odooOrderCreation.ts`.

**Tech Stack:** Next.js 15, Mantine 9, Tailwind CSS 4, Lucide React, TypeScript, Prisma (local DB), Odoo JSON-2 API.

## Global Constraints

- Mantine dark theme, amber primary. Sin emojis como íconos — usar Lucide.
- Fuente monospace: `var(--font-mono)` (DM Mono).
- Patrón referencia: `{dd}{MM}{rrrr}` (8 chars). Patrón barcode: `{CodigoRef}{AbrevColor}.{Talle}`.
- Abreviatura color: 1 palabra → 2 primeras letras; 2+ palabras → inicial de primeras 2 palabras. Siempre MAYÚSCULAS, siempre 2 chars.
- Barcodes vacíos nunca se sobreescriben con auto-generar.
- Auto-generar referencia solo actúa cuando `article.referencia === ""`.
- `barcodes` es opcional (`?`) en el tipo para compatibilidad con órdenes existentes.

---

## File Map

| Archivo | Operación |
|---------|-----------|
| `src/types/index.ts` | Modificar — agregar `barcodes?` a `ArticleRow` |
| `src/lib/barcodes.ts` | Crear — utilidades puras |
| `src/components/orders/BarcodeTab.tsx` | Crear — componente completo |
| `src/components/orders/ArticleRow.tsx` | Modificar — botón auto-ref + nueva tab |
| `src/components/orders/OrderGrid.tsx` | Modificar — `barcodes: {}` en init de rows |
| `src/lib/odooOrderCreation.ts` | Modificar — barcode write loop |

---

## Task 1: Types — agregar `barcodes` a `ArticleRow`

**Files:**
- Modify: `src/types/index.ts:54-63`

**Interfaces:**
- Produces: `ArticleRow.barcodes?: Record<string, string>` — usado por todos los demás tasks

- [ ] **Step 1: Modificar `ArticleRow` en `src/types/index.ts`**

Buscar el bloque existente (línea ~54):
```typescript
export interface ArticleRow {
  id: string; // local UUID
  color: ColorValue | null;
  quantities: Record<string, string>; // size name → quantity string (no-warehouse mode)
  prices?: Record<string, string>; // size name → price (granular mode)
  // key: `${warehouseId}:${sizeName}` → quantity string (warehouse mode)
  warehouseQuantities: Record<string, string>;
  // edit mode: size name → purchase.order.line ID (populated when loading existing OC)
  odooLineIds?: Record<string, number>;
}
```

Reemplazarlo con:
```typescript
export interface ArticleRow {
  id: string; // local UUID
  color: ColorValue | null;
  quantities: Record<string, string>; // size name → quantity string (no-warehouse mode)
  prices?: Record<string, string>; // size name → price (granular mode)
  // key: `${warehouseId}:${sizeName}` → quantity string (warehouse mode)
  warehouseQuantities: Record<string, string>;
  // edit mode: size name → purchase.order.line ID (populated when loading existing OC)
  odooLineIds?: Record<string, number>;
  // size name → barcode value
  barcodes?: Record<string, string>;
}
```

- [ ] **Step 2: Verificar compilación**

```bash
cd casa-sonia-compras && pnpm build 2>&1 | head -30
```

Esperado: sin errores de tipos nuevos (puede haber otros errores pre-existentes).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add barcodes field to ArticleRow type"
```

---

## Task 2: Utilidades puras — `src/lib/barcodes.ts`

**Files:**
- Create: `src/lib/barcodes.ts`

**Interfaces:**
- Produces:
  - `generateReferencia(): string`
  - `colorAbbr(colorName: string): string`
  - `generateBarcode(referencia: string, colorName: string, sizeName: string): string`

- [ ] **Step 1: Crear `src/lib/barcodes.ts`**

```typescript
/**
 * Genera código de referencia con formato ddMMrrrr.
 * dd = día actual (zero-padded), MM = mes actual (zero-padded), rrrr = 4 dígitos random.
 * Ejemplo: 29064823
 */
export function generateReferencia(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const rrrr = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `${dd}${MM}${rrrr}`;
}

/**
 * Deriva abreviatura de 2 letras del nombre de color proveedor (siempre MAYÚSCULAS).
 * 1 palabra  → primeras 2 letras:       "Rojo"           → "RO"
 * 2+ palabras → inicial de primeras 2:  "Azul Eléctrico" → "AE"
 *                                        "Rojo Tomate Extra" → "RT"
 */
export function colorAbbr(colorName: string): string {
  const words = colorName.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Genera barcode para una variante.
 * Formato: {referencia}{AbrevColor}.{talle}
 * Ejemplo: "29064823RO.S"
 */
export function generateBarcode(
  referencia: string,
  colorName: string,
  sizeName: string,
): string {
  return `${referencia}${colorAbbr(colorName)}.${sizeName}`;
}
```

- [ ] **Step 2: Verificar lógica manualmente**

Abrir una terminal y correr:
```bash
cd casa-sonia-compras
node -e "
const path = require('path');
// Quick smoke test sin TypeScript
function colorAbbr(name) {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
console.assert(colorAbbr('Rojo') === 'RO', 'Rojo → RO');
console.assert(colorAbbr('Azul Eléctrico') === 'AE', 'Azul Eléctrico → AE');
console.assert(colorAbbr('Rojo Tomate Extra') === 'RT', 'Rojo Tomate Extra → RT');
console.assert(colorAbbr('Negro') === 'NE', 'Negro → NE');
console.log('colorAbbr: OK');
"
```

Esperado:
```
colorAbbr: OK
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/barcodes.ts
git commit -m "feat: add barcode utility functions (generateReferencia, colorAbbr, generateBarcode)"
```

---

## Task 3: Componente `BarcodeTab`

**Files:**
- Create: `src/components/orders/BarcodeTab.tsx`

**Interfaces:**
- Consumes:
  - `Article` from `@/types`
  - `generateReferencia`, `generateBarcode` from `@/lib/barcodes`
- Produces: `<BarcodeTab article={...} onChange={...} readOnly={...} />`

- [ ] **Step 1: Crear `src/components/orders/BarcodeTab.tsx`**

```tsx
import { ActionIcon, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { Sparkles, X } from "lucide-react";
import { generateBarcode, generateReferencia } from "@/lib/barcodes";
import type { Article } from "@/types";

interface Props {
  article: Article;
  onChange: (article: Article) => void;
  readOnly?: boolean;
}

export function BarcodeTab({ article, onChange, readOnly }: Props) {
  // Unique colors in row order (dedup by color name)
  const coloredRows = Array.from(
    new Map(
      article.rows
        .filter((r) => r.color)
        .map((r) => [r.color!.name, r] as [string, typeof r]),
    ).values(),
  );

  function setBarcode(rowId: string, sizeName: string, value: string) {
    onChange({
      ...article,
      rows: article.rows.map((row) =>
        row.id === rowId
          ? { ...row, barcodes: { ...(row.barcodes ?? {}), [sizeName]: value } }
          : row,
      ),
    });
  }

  function autoGenerate() {
    // Si no hay referencia, generar una primero
    const ref = article.referencia || generateReferencia();

    const newRows = article.rows.map((row) => {
      if (!row.color) return row;
      const newBarcodes: Record<string, string> = { ...(row.barcodes ?? {}) };
      for (const size of article.sizes) {
        // Solo llenar los vacíos
        if (!newBarcodes[size.name]) {
          newBarcodes[size.name] = generateBarcode(ref, row.color.name, size.name);
        }
      }
      return { ...row, barcodes: newBarcodes };
    });

    onChange({ ...article, referencia: ref, rows: newRows });
  }

  if (coloredRows.length === 0 || article.sizes.length === 0) {
    return (
      <Text size="xs" c="dimmed" pt="sm">
        Cargá colores y talles en el tab Cantidades para configurar códigos de barra.
      </Text>
    );
  }

  return (
    <Stack gap="md" pt="sm">
      {/* Botón principal */}
      {!readOnly && (
        <Group justify="flex-end">
          <Button
            size="xs"
            variant="light"
            leftSection={<Sparkles size={13} />}
            onClick={autoGenerate}
          >
            Auto generar códigos
          </Button>
        </Group>
      )}

      {/* Grid por color */}
      {coloredRows.map((row) => (
        <div key={row.color!.name}>
          {/* Section header */}
          <Text
            size="xs"
            tt="uppercase"
            fw={600}
            c="dimmed"
            mb={6}
            style={{ letterSpacing: "0.08em" }}
          >
            {row.color!.name}
          </Text>

          <Stack gap={4}>
            {article.sizes.map((size) => {
              const value = row.barcodes?.[size.name] ?? "";
              return (
                <Group key={size.name} gap="xs" wrap="nowrap">
                  {/* Talle label */}
                  <Text
                    size="sm"
                    c="dimmed"
                    style={{ width: 32, textAlign: "right", flexShrink: 0 }}
                  >
                    {size.name}
                  </Text>

                  {/* Input + botón clear */}
                  <div style={{ position: "relative", flex: 1 }}>
                    <TextInput
                      size="xs"
                      value={value}
                      onChange={(e) =>
                        setBarcode(row.id, size.name, e.currentTarget.value)
                      }
                      placeholder="Escanear o ingresar código"
                      readOnly={readOnly}
                      aria-label={`Código de barras ${row.color!.name} ${size.name}`}
                      styles={{
                        input: {
                          fontFamily: "var(--font-mono)",
                          borderColor: value
                            ? "rgba(251,191,36,0.4)"
                            : undefined,
                          paddingRight: value ? 28 : undefined,
                        },
                      }}
                    />
                    {value && !readOnly && (
                      <ActionIcon
                        size="xs"
                        variant="transparent"
                        c="dimmed"
                        style={{
                          position: "absolute",
                          right: 6,
                          top: "50%",
                          transform: "translateY(-50%)",
                          cursor: "pointer",
                        }}
                        onClick={() => setBarcode(row.id, size.name, "")}
                        aria-label={`Limpiar código de ${row.color!.name} ${size.name}`}
                      >
                        <X size={12} />
                      </ActionIcon>
                    )}
                  </div>
                </Group>
              );
            })}
          </Stack>
        </div>
      ))}
    </Stack>
  );
}
```

- [ ] **Step 2: Verificar compilación TypeScript**

```bash
cd casa-sonia-compras && pnpm build 2>&1 | grep "BarcodeTab\|barcodes" | head -20
```

Esperado: sin errores relacionados con `BarcodeTab` o `barcodes`.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/BarcodeTab.tsx
git commit -m "feat: add BarcodeTab component with auto-generate and manual barcode editing"
```

---

## Task 4: Modificar `ArticleRow` — botón auto-ref + nueva tab

**Files:**
- Modify: `src/components/orders/ArticleRow.tsx`

**Interfaces:**
- Consumes:
  - `BarcodeTab` from `@/components/orders/BarcodeTab`
  - `generateReferencia` from `@/lib/barcodes`
- Produces: UI con botón auto-referencia y tab "Códigos de Barra"

- [ ] **Step 1: Agregar imports en `ArticleRow.tsx`**

Agregar al bloque de imports existente (después de la línea `import { ColorBaseCell ...`):

```typescript
import { BarcodeTab } from "@/components/orders/BarcodeTab";
import { generateReferencia } from "@/lib/barcodes";
```

- [ ] **Step 2: Agregar botón auto-referencia junto al campo `referencia`**

Buscar el bloque existente (~línea 1235):
```tsx
          {/* Código Referencia */}
          <TextInput
            label="Cód. Referencia"
            placeholder="Ej: HO15100CS"
            size="xs"
            w={140}
            value={article.referencia}
            onChange={(e) =>
              onChange({ ...article, referencia: e.currentTarget.value })
            }
          />
```

Reemplazarlo con:
```tsx
          {/* Código Referencia */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
            <TextInput
              label="Cód. Referencia"
              placeholder="Ej: HO15100CS"
              size="xs"
              w={140}
              value={article.referencia}
              onChange={(e) =>
                onChange({ ...article, referencia: e.currentTarget.value })
              }
            />
            {!article.referencia && !readOnly && (
              <Tooltip label="Auto-generar código de referencia" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  mb={1}
                  aria-label="Auto-generar código de referencia"
                  onClick={() =>
                    onChange({ ...article, referencia: generateReferencia() })
                  }
                >
                  <Sparkles size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
```

- [ ] **Step 3: Agregar tab "Códigos de Barra" en el `Tabs.List`**

Buscar (~línea 1481):
```tsx
          <Tabs.List>
            <Tabs.Tab value="quantities">Cantidades</Tabs.Tab>
            <Tabs.Tab value="attributes">Atributos</Tabs.Tab>
            <Tabs.Tab value="description">Datos Web</Tabs.Tab>
          </Tabs.List>
```

Reemplazar con:
```tsx
          <Tabs.List>
            <Tabs.Tab value="quantities">Cantidades</Tabs.Tab>
            <Tabs.Tab value="attributes">Atributos</Tabs.Tab>
            <Tabs.Tab value="description">Datos Web</Tabs.Tab>
            <Tabs.Tab value="barcodes">Códigos de Barra</Tabs.Tab>
          </Tabs.List>
```

- [ ] **Step 4: Agregar el `Tabs.Panel` de barcodes**

Buscar la línea de cierre del panel "Datos Web" (~línea 2645):
```tsx
          </Tabs.Panel>

        </Tabs>
```

Insertar el nuevo panel antes del cierre de `</Tabs>`:
```tsx
          </Tabs.Panel>

          {/* Códigos de Barra tab */}
          <Tabs.Panel value="barcodes">
            <BarcodeTab
              article={article}
              onChange={onChange}
              readOnly={readOnly}
            />
          </Tabs.Panel>

        </Tabs>
```

- [ ] **Step 5: Agregar `barcodes: {}` en la función `addRow` (~línea 396)**

Buscar:
```typescript
  function addRow() {
    onChange({
      ...article,
      rows: [
        ...article.rows,
        {
          id: crypto.randomUUID(),
          color: null,
          quantities: Object.fromEntries(
            article.sizes.map((s) => [s.name, ""]),
          ),
          warehouseQuantities: {},
        },
      ],
    });
```

Reemplazar el objeto del nuevo row con:
```typescript
  function addRow() {
    onChange({
      ...article,
      rows: [
        ...article.rows,
        {
          id: crypto.randomUUID(),
          color: null,
          quantities: Object.fromEntries(
            article.sizes.map((s) => [s.name, ""]),
          ),
          warehouseQuantities: {},
          barcodes: {},
        },
      ],
    });
```

- [ ] **Step 6: Verificar compilación**

```bash
cd casa-sonia-compras && pnpm build 2>&1 | head -40
```

Esperado: sin errores relacionados con los cambios de este task.

- [ ] **Step 7: Verificación manual en el navegador**

```bash
pnpm dev
```

1. Abrir `http://localhost:3000/orders/new`
2. Crear un artículo. Verificar que el campo "Cód. Referencia" muestra el ícono de varita cuando está vacío.
3. Clickar la varita. Verificar que se rellena con 8 caracteres formato `ddMMrrrr`.
4. Verificar que el ícono desaparece una vez que hay referencia.
5. Agregar un color y talles. Ir al tab "Códigos de Barra".
6. Verificar que aparece la grilla agrupada por color con inputs monospace.
7. Clickar "Auto generar códigos". Verificar que los campos se rellenan con el patrón `{ref}{XX}.{talle}`.
8. Limpiar un campo con el ✕. Rellenar otro manualmente. Volver a "Auto generar" — verificar que solo se rellenan los vacíos.

- [ ] **Step 8: Commit**

```bash
git add src/components/orders/ArticleRow.tsx
git commit -m "feat: add auto-ref button and Códigos de Barra tab to ArticleRow"
```

---

## Task 5: Inicialización de rows en `OrderGrid`

**Files:**
- Modify: `src/components/orders/OrderGrid.tsx:66-72` (init artículo nuevo)
- Modify: `src/components/orders/OrderGrid.tsx:276-281` (duplicar artículo)

**Interfaces:**
- Consumes: `ArticleRow.barcodes?` from Task 1

- [ ] **Step 1: Agregar `barcodes: {}` en el init del artículo nuevo (~línea 66)**

Buscar:
```typescript
      {
        id: crypto.randomUUID(),
        color: null,
        quantities: {},
        warehouseQuantities: {},
      },
```

Reemplazar con:
```typescript
      {
        id: crypto.randomUUID(),
        color: null,
        quantities: {},
        warehouseQuantities: {},
        barcodes: {},
      },
```

- [ ] **Step 2: Agregar `barcodes: {}` en el duplicado de artículo (~línea 276)**

Buscar:
```typescript
      rows: original.rows.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        quantities: {},
        warehouseQuantities: {},
      })),
```

Reemplazar con:
```typescript
      rows: original.rows.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        quantities: {},
        warehouseQuantities: {},
        barcodes: {},
      })),
```

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/OrderGrid.tsx
git commit -m "feat: initialize barcodes field in new and duplicated article rows"
```

---

## Task 6: Odoo sync — barcode write en `odooOrderCreation.ts`

**Files:**
- Modify: `src/lib/odooOrderCreation.ts` — después de `mapVariantToColorSize` (~línea 295)

**Interfaces:**
- Consumes:
  - `variantMap: Map<string, number>` (ya existe en el scope)
  - `resolvedColors`, `resolvedSizes` (ya existen en el scope)
  - `article.rows[].barcodes?` from Task 1
  - `odoo.write` from `@/lib/odoo`

- [ ] **Step 1: Agregar barcode write loop en `odooOrderCreation.ts`**

Buscar el bloque (~línea 295-302):
```typescript
      articleVariantMaps.set(article.id, {
        variantMap,
        resolvedColors,
        templateId,
      });
```

Insertar el bloque de escritura de barcodes **antes** de ese `articleVariantMaps.set`:
```typescript
      // Escribir barcodes en product.product (mismo bloque que resolución de variantes)
      for (const row of article.rows as ArticleRow[]) {
        if (!row.color) continue;
        for (const size of article.sizes) {
          const barcode = row.barcodes?.[size.name];
          if (!barcode) continue;

          const resolvedColor = resolvedColors.find(
            (c) => c.name === row.color!.name,
          );
          const resolvedSize = resolvedSizes.find(
            (s) => s.name === size.name,
          );
          if (!resolvedSize) continue;

          const key = resolvedColor
            ? `${resolvedColor.id}:${resolvedSize.id}`
            : `:${resolvedSize.id}`;
          const variantId = variantMap.get(key);
          if (!variantId) continue;

          try {
            await odoo.write("product.product", [variantId], { barcode });
          } catch (err) {
            console.warn(
              `[odooOrderCreation] barcode write failed for variant ${variantId}:`,
              err,
            );
          }
        }
      }

      articleVariantMaps.set(article.id, {
        variantMap,
        resolvedColors,
        templateId,
      });
```

**Nota:** El `try/catch` es para barcodes duplicados en Odoo (Odoo 19 tiene unique constraint en `barcode`). El warning no interrumpe la confirmación.

- [ ] **Step 2: Verificar compilación**

```bash
cd casa-sonia-compras && pnpm build 2>&1 | grep "odooOrderCreation\|barcode" | head -20
```

Esperado: sin errores.

- [ ] **Step 3: Verificación manual**

1. Crear una orden nueva con artículo, color, talles.
2. Ir al tab "Códigos de Barra" y auto-generar.
3. Guardar borrador (verificar que los barcodes persisten al recargar).
4. Confirmar la orden.
5. En Odoo, ir a Inventario → Productos → abrir el producto → Variantes. Verificar que cada variante tiene el barcode seteado.

- [ ] **Step 4: Commit**

```bash
git add src/lib/odooOrderCreation.ts
git commit -m "feat: write barcodes to product.product variants during order confirmation"
```
