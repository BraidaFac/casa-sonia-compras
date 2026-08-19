# Article Editor Post-Confirmación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar atributos de artículos desde órdenes confirmadas sincronizando cambios a Odoo sin modificar líneas de la purchase.order; más relajar campos obligatorios al confirmar para habilitar carga rápida.

**Architecture:** `OrderGrid` recibe prop `onEditArticle` que abre `ArticleEditorDrawer`; el drawer envía `PATCH /api/local-orders/[id]/articles` que llama `updateArticleInOdoo`; la validación de confirmación se relaja removiendo chequeos de atributos requeridos, categoría y completitud de color.

**Tech Stack:** Next.js 15 App Router, Mantine 9, TypeScript, Prisma (MariaDB), Odoo JSON-2 API via `src/lib/odoo.ts`

## Global Constraints

- Estilos: solo vars CSS existentes (`--bg`, `--surface`, `--border`, `--text2`, `--text3`), color Mantine `amber` para primario, sin colores nuevos
- Todas las rutas API usan wrapper `withAuth` de `@/lib/withAuth`
- Sin test framework — verificación manual en dev server (`pnpm dev`)
- No modificar `purchase.order` líneas en Odoo — solo `product.template` y `product.product`
- Imágenes nuevas van como base64 en el body del PATCH (sin temp storage para orden confirmada)
- Path alias `@/*` → `src/*`
- Prisma client importar desde `prisma/generated/client/` no `@prisma/client`

---

## File Map

**Crear:**
- `src/lib/odooArticleUpdate.ts` — lógica de sync Odoo para edición post-confirmación
- `src/app/api/local-orders/[id]/articles/route.ts` — endpoint PATCH
- `src/components/orders/ArticleEditorDrawer.tsx` — drawer con 6 tabs

**Modificar:**
- `src/components/orders/OrderGrid.tsx` — agregar prop `onEditArticle` + botón "Editar" por artículo
- `src/app/(app)/orders/[id]/edit/page.tsx` — montar drawer + handlers
- `src/lib/orderValidation.ts` — relajar `validateForConfirm` y `validateForDraft`

---

## Tasks

### Task 1: `odooArticleUpdate.ts` — Lib de sync Odoo

**Files:**
- Create: `src/lib/odooArticleUpdate.ts`

**Interfaces:**
- Consumes: `Article` de `@/types`, funciones `resolveOrCreateColors`, `syncExtraAttributes`, `syncProductImages` de `@/lib/odooProducts`, `odoo` de `@/lib/odoo`
- Produces: `export async function updateArticleInOdoo(article: Article, colorAttributeId: number, sizeAttributeId: number): Promise<void>`

- [ ] **Step 1: Crear el archivo con `buildVariantMap` helper y `updateArticleInOdoo`**

```typescript
// src/lib/odooArticleUpdate.ts
import { odoo } from "@/lib/odoo";
import {
  resolveOrCreateColors,
  syncExtraAttributes,
  syncProductImages,
} from "@/lib/odooProducts";
import type { ResolvedAttributeValue } from "@/lib/odooProducts";
import type { Article, SizeValue } from "@/types";

/**
 * Construye un mapa `${colorValueId}:${sizeValueId}` → variantId
 * leyendo product.template.attribute.value y product.product de Odoo.
 */
async function buildVariantMap(
  templateId: number,
  colorAttributeId: number,
  sizeAttributeId: number,
): Promise<Map<string, number>> {
  const ptavs: {
    id: number;
    attribute_id: [number, string] | number;
    product_attribute_value_id: [number, string] | number;
  }[] = await odoo.searchRead(
    "product.template.attribute.value",
    [["product_tmpl_id", "=", templateId]],
    ["id", "attribute_id", "product_attribute_value_id"],
  );

  const colorValToPtav = new Map<number, number>();
  const sizeValToPtav = new Map<number, number>();

  for (const ptav of ptavs) {
    const attrId = Array.isArray(ptav.attribute_id)
      ? ptav.attribute_id[0]
      : ptav.attribute_id;
    const valId = Array.isArray(ptav.product_attribute_value_id)
      ? ptav.product_attribute_value_id[0]
      : ptav.product_attribute_value_id;
    if (attrId === colorAttributeId) colorValToPtav.set(valId, ptav.id);
    if (attrId === sizeAttributeId) sizeValToPtav.set(valId, ptav.id);
  }

  const variants: {
    id: number;
    product_template_attribute_value_ids: number[];
  }[] = await odoo.searchRead(
    "product.product",
    [
      ["product_tmpl_id", "=", templateId],
      ["active", "in", [true, false]],
    ],
    ["id", "product_template_attribute_value_ids"],
  );

  const variantMap = new Map<string, number>();

  for (const variant of variants) {
    const ptavIds = variant.product_template_attribute_value_ids ?? [];
    let colorValId = 0;
    let sizeValId = 0;
    for (const [valId, ptavId] of colorValToPtav) {
      if (ptavIds.includes(ptavId)) {
        colorValId = valId;
        break;
      }
    }
    for (const [valId, ptavId] of sizeValToPtav) {
      if (ptavIds.includes(ptavId)) {
        sizeValId = valId;
        break;
      }
    }
    variantMap.set(`${colorValId}:${sizeValId}`, variant.id);
  }

  return variantMap;
}

/**
 * Actualiza un artículo en Odoo sin tocar purchase.order lines.
 * - Actualiza product.template (nombre, categoría, precios, descripción)
 * - Agrega colores/talles nuevos como variantes
 * - Sincroniza atributos extras, barcodes e imágenes
 */
export async function updateArticleInOdoo(
  article: Article,
  colorAttributeId: number,
  sizeAttributeId: number,
): Promise<void> {
  const templateId = article.existingProductId!;

  // 1. Actualizar campos del product.template
  await odoo.write("product.template", [templateId], {
    name: article.name,
    standard_price: parseFloat(article.price) || 0,
    list_price: parseFloat(article.salePrice) || 0,
    description_ecommerce: article.description || "",
    ...(article.category?.id ? { categ_id: article.category.id } : {}),
  });

  // 2. Resolver/crear colores y agregar nuevos a la línea de atributo
  const colorIdMap = await resolveOrCreateColors(article.rows, colorAttributeId);
  const resolvedColors: ResolvedAttributeValue[] = [];
  for (const [name, id] of colorIdMap) {
    resolvedColors.push({ id, name });
  }

  const lines: {
    id: number;
    attribute_id: [number, string] | number;
    value_ids: number[];
  }[] = await odoo.searchRead(
    "product.template.attribute.line",
    [["product_tmpl_id", "=", templateId]],
    ["id", "attribute_id", "value_ids"],
  );

  const colorLine = lines.find(
    (l) =>
      (Array.isArray(l.attribute_id) ? l.attribute_id[0] : l.attribute_id) ===
      colorAttributeId,
  );
  const sizeLine = lines.find(
    (l) =>
      (Array.isArray(l.attribute_id) ? l.attribute_id[0] : l.attribute_id) ===
      sizeAttributeId,
  );

  // Agregar colores nuevos
  if (colorLine) {
    const newColorIds = resolvedColors
      .filter((c) => !colorLine.value_ids.includes(c.id))
      .map((c) => c.id);
    if (newColorIds.length > 0) {
      await odoo.write("product.template.attribute.line", [colorLine.id], {
        value_ids: [[6, 0, [...colorLine.value_ids, ...newColorIds]]],
      });
    }
  } else if (resolvedColors.length > 0) {
    await odoo.write("product.template", [templateId], {
      attribute_line_ids: [
        [0, 0, {
          attribute_id: colorAttributeId,
          value_ids: [[6, 0, resolvedColors.map((c) => c.id)]],
        }],
      ],
    });
  }

  // 3. Agregar talles nuevos (los que no estaban en originalSizeIds)
  const originalSizeIds = article.originalSizeIds ?? [];
  const newSizes: SizeValue[] = article.sizes.filter(
    (s) => !originalSizeIds.includes(s.id),
  );

  if (newSizes.length > 0) {
    const newSizeIds = newSizes.map((s) => s.id);
    if (sizeLine) {
      await odoo.write("product.template.attribute.line", [sizeLine.id], {
        value_ids: [[6, 0, [...sizeLine.value_ids, ...newSizeIds]]],
      });
    } else {
      await odoo.write("product.template", [templateId], {
        attribute_line_ids: [
          [0, 0, {
            attribute_id: sizeAttributeId,
            value_ids: [[6, 0, newSizeIds]],
          }],
        ],
      });
    }
  }

  // 4. Sincronizar atributos extras (no-variante)
  await syncExtraAttributes(templateId, article);

  // 5. Construir variantMap para barcodes e imágenes
  const variantMap = await buildVariantMap(
    templateId,
    colorAttributeId,
    sizeAttributeId,
  );

  // 6. Actualizar barcodes por variante color × talle
  for (const row of article.rows) {
    if (!row.color || !row.barcodes || Object.keys(row.barcodes).length === 0)
      continue;
    const colorId = colorIdMap.get(row.color.name);
    if (!colorId) continue;
    for (const [sizeName, barcode] of Object.entries(row.barcodes)) {
      if (!barcode) continue;
      const size = article.sizes.find((s) => s.name === sizeName);
      if (!size) continue;
      const variantId = variantMap.get(`${colorId}:${size.id}`);
      if (!variantId) continue;
      try {
        await odoo.write("product.product", [variantId], { barcode });
      } catch (err) {
        console.error(
          `Error actualizando barcode ${row.color.name}/${sizeName}:`,
          err,
        );
      }
    }
  }

  // 7. Sincronizar imágenes (reutiliza syncProductImages de odooProducts)
  await syncProductImages(templateId, article, resolvedColors, variantMap);
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
cd casa-sonia-compras && pnpm lint 2>&1 | head -30
```

Esperado: sin errores en `odooArticleUpdate.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/odooArticleUpdate.ts
git commit -m "feat: add odooArticleUpdate lib for post-confirmation article sync"
```

---

### Task 2: `PATCH /api/local-orders/[id]/articles` Route

**Files:**
- Create: `src/app/api/local-orders/[id]/articles/route.ts`

**Interfaces:**
- Consumes: `updateArticleInOdoo` de `@/lib/odooArticleUpdate`, `stripImagesForDB` de `@/lib/localOrders`, `prisma` de `@/lib/prisma`
- Produces: `PATCH /api/local-orders/[id]/articles` → `{ article: Article }` o error

- [ ] **Step 1: Crear la ruta PATCH**

```typescript
// src/app/api/local-orders/[id]/articles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";
import { updateArticleInOdoo } from "@/lib/odooArticleUpdate";
import { stripImagesForDB } from "@/lib/localOrders";
import type { Article } from "@/types";

export const PATCH = withAuth(
  async (req: NextRequest, _payload, ctx) => {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
    const orderId = parseInt(id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = (await req.json()) as {
      articleIndex: number;
      article: Article;
      colorAttributeId: number;
      sizeAttributeId: number;
    };
    const { articleIndex, article, colorAttributeId, sizeAttributeId } = body;

    if (!article.existingProductId) {
      return NextResponse.json(
        { error: "El artículo no tiene producto Odoo vinculado" },
        { status: 400 },
      );
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json(
        { error: "Orden no encontrada" },
        { status: 404 },
      );
    }
    if (order.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "La orden no está confirmada" },
        { status: 400 },
      );
    }

    const articles = order.articles as unknown as Article[];
    if (articleIndex < 0 || articleIndex >= articles.length) {
      return NextResponse.json(
        { error: "Índice de artículo inválido" },
        { status: 400 },
      );
    }

    try {
      await updateArticleInOdoo(article, colorAttributeId, sizeAttributeId);
    } catch (err) {
      console.error("Error actualizando artículo en Odoo:", err);
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Error al sincronizar con Odoo",
        },
        { status: 500 },
      );
    }

    const stripped = stripImagesForDB([article]);
    const updatedArticles = [...articles];
    updatedArticles[articleIndex] = stripped[0] as unknown as Article;

    await prisma.order.update({
      where: { id: orderId },
      data: { articles: updatedArticles as unknown[] },
    });

    return NextResponse.json({ article });
  },
  { roles: ["ADMIN", "MANAGER", "EMPLEADO"] },
);
```

- [ ] **Step 2: Verificar compilación**

```bash
pnpm lint 2>&1 | head -30
```

Esperado: sin errores en el nuevo archivo.

- [ ] **Step 3: Prueba manual básica**

Con el server corriendo (`pnpm dev`), probar que la ruta responde 404 para un ID inexistente:

```bash
curl -X PATCH http://localhost:3000/api/local-orders/99999/articles \
  -H "Content-Type: application/json" \
  -d '{"articleIndex":0,"article":{"existingProductId":1},"colorAttributeId":1,"sizeAttributeId":2}' \
  -b "token=<token_válido>"
```

Esperado: `{"error":"Orden no encontrada"}` con status 404.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/local-orders/[id]/articles/route.ts
git commit -m "feat: add PATCH /api/local-orders/[id]/articles endpoint"
```

---

### Task 3: `ArticleEditorDrawer` — Skeleton + Tabs General, Atributos, Códigos de barra

**Files:**
- Create: `src/components/orders/ArticleEditorDrawer.tsx`

**Interfaces:**
- Consumes: `ArticleAttributes` de `./ArticleAttributes`, `BarcodeTab` de `./BarcodeTab`, hooks `useAttributes`, `useCategories`, `useColorBaseOptions`, `useSizeAttributes`, `useProductTypes`
- Produces:
  ```typescript
  interface Props {
    orderId: number;
    articleIndex: number;
    article: Article;
    opened: boolean;
    onClose: () => void;
    onArticleUpdate: (updated: Article) => void;
  }
  export function ArticleEditorDrawer(props: Props): JSX.Element
  ```

- [ ] **Step 1: Crear el esqueleto del drawer con tabs**

```typescript
// src/components/orders/ArticleEditorDrawer.tsx
"use client";
import { useState, useEffect } from "react";
import {
  Drawer,
  Tabs,
  Button,
  Group,
  Text,
  Stack,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  Alert,
  ScrollArea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { AlertTriangle } from "lucide-react";
import { ArticleAttributes } from "@/components/orders/ArticleAttributes";
import { BarcodeTab } from "@/components/orders/BarcodeTab";
import { useAttributes } from "@/hooks/useAttributes";
import { useAllAttributes } from "@/hooks/useAllAttributes";
import { useCategories } from "@/hooks/useCategories";
import { useColorBaseOptions } from "@/hooks/useColorBaseOptions";
import { useSizeAttributes } from "@/hooks/useSizeAttributes";
import { useProductTypes } from "@/hooks/useProductTypes";
import type { Article } from "@/types";
import type { ProductCategory } from "@/types";

interface Props {
  orderId: number;
  articleIndex: number;
  article: Article;
  opened: boolean;
  onClose: () => void;
  onArticleUpdate: (updated: Article) => void;
}

export function ArticleEditorDrawer({
  orderId,
  articleIndex,
  article,
  opened,
  onClose,
  onArticleUpdate,
}: Props) {
  const [local, setLocal] = useState<Article>(article);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Resetear estado local cuando se abre con un artículo nuevo
  useEffect(() => {
    if (opened) {
      setLocal(article);
      setSaveError(null);
    }
  }, [opened, article]);

  const { data: attrData } = useAttributes();
  const { data: allAttributes = [] } = useAllAttributes();
  const { data: categories = [] } = useCategories();
  const { data: colorBaseOptions = [] } = useColorBaseOptions();
  const { data: sizeAttributes = [] } = useSizeAttributes();
  const { data: productTypes = [] } = useProductTypes();

  const colorAttributeId = attrData?.colorAttributeId ?? 0;
  const sizeAttributeId = attrData?.sizeAttributeId ?? 0;
  const allColors = attrData?.colors ?? [];

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/local-orders/${orderId}/articles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleIndex,
          article: local,
          colorAttributeId,
          sizeAttributeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Error al guardar");
        return;
      }
      notifications.show({
        color: "green",
        title: "Artículo actualizado",
        message: "Los cambios fueron guardados en Odoo.",
      });
      onArticleUpdate(local);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const categoryOptions = (categories as ProductCategory[]).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="xl"
      title={
        <Text fw={600} size="sm" style={{ color: "var(--text2)" }}>
          Editar artículo — {local.name || "(sin nombre)"}
        </Text>
      }
      styles={{
        body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" },
        content: { background: "var(--surface)" },
        header: {
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        },
      }}
    >
      <ScrollArea style={{ flex: 1 }}>
        <Tabs defaultValue="general" styles={{ root: { height: "100%" } }}>
          <Tabs.List px="md" pt="xs">
            <Tabs.Tab value="general">General</Tabs.Tab>
            <Tabs.Tab value="colores">Colores</Tabs.Tab>
            <Tabs.Tab value="talles">Talles</Tabs.Tab>
            <Tabs.Tab value="atributos">Atributos</Tabs.Tab>
            <Tabs.Tab value="barcodes">Códigos de barra</Tabs.Tab>
            <Tabs.Tab value="imagenes">Imágenes</Tabs.Tab>
          </Tabs.List>

          {/* Tab General */}
          <Tabs.Panel value="general" p="md">
            <Stack gap="md">
              <TextInput
                label="Nombre"
                value={local.name}
                onChange={(e) => setLocal((p) => ({ ...p, name: e.currentTarget.value }))}
              />
              <Select
                label="Categoría"
                data={categoryOptions}
                value={local.category ? String(local.category.id) : null}
                onChange={(val) => {
                  const cat = (categories as ProductCategory[]).find(
                    (c) => String(c.id) === val,
                  );
                  setLocal((p) => ({ ...p, category: cat ?? null }));
                }}
                searchable
                clearable
              />
              <Group grow>
                <NumberInput
                  label="Precio costo"
                  value={parseFloat(local.price) || 0}
                  onChange={(val) =>
                    setLocal((p) => ({ ...p, price: String(val ?? 0) }))
                  }
                  decimalScale={2}
                  prefix="$"
                />
                <NumberInput
                  label="Precio venta"
                  value={parseFloat(local.salePrice) || 0}
                  onChange={(val) =>
                    setLocal((p) => ({ ...p, salePrice: String(val ?? 0) }))
                  }
                  decimalScale={2}
                  prefix="$"
                />
              </Group>
              <Textarea
                label="Descripción web"
                value={local.description}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, description: e.currentTarget.value }))
                }
                rows={4}
              />
            </Stack>
          </Tabs.Panel>

          {/* Tab Colores — Task 4 */}
          <Tabs.Panel value="colores" p="md">
            <Text size="sm" c="dimmed">
              (Implementado en Task 4)
            </Text>
          </Tabs.Panel>

          {/* Tab Talles — Task 4 */}
          <Tabs.Panel value="talles" p="md">
            <Text size="sm" c="dimmed">
              (Implementado en Task 4)
            </Text>
          </Tabs.Panel>

          {/* Tab Atributos */}
          <Tabs.Panel value="atributos" p="md">
            <ArticleAttributes
              article={local}
              colorAttributeId={colorAttributeId}
              sizeAttributeId={sizeAttributeId}
              allAttributes={allAttributes}
              productTypes={productTypes}
              onChange={(updated) => setLocal(updated)}
            />
          </Tabs.Panel>

          {/* Tab Códigos de barra */}
          <Tabs.Panel value="barcodes" p="md">
            <BarcodeTab
              article={local}
              onChange={(updated) => setLocal(updated)}
            />
          </Tabs.Panel>

          {/* Tab Imágenes — Task 4 */}
          <Tabs.Panel value="imagenes" p="md">
            <Text size="sm" c="dimmed">
              (Implementado en Task 4)
            </Text>
          </Tabs.Panel>
        </Tabs>
      </ScrollArea>

      {/* Footer fijo con botones */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "12px 16px",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {saveError && (
          <Alert
            color="red"
            variant="light"
            icon={<AlertTriangle size={14} />}
            p="xs"
          >
            <Text size="xs">{saveError}</Text>
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            color="amber"
            loading={saving}
            onClick={() => void handleSave()}
          >
            Guardar
          </Button>
        </Group>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 2: Verificar que el componente compila sin errores**

```bash
pnpm lint 2>&1 | grep ArticleEditorDrawer
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/ArticleEditorDrawer.tsx
git commit -m "feat: add ArticleEditorDrawer skeleton with General, Atributos, Barcodes tabs"
```

---

### Task 4: `ArticleEditorDrawer` — Tabs Colores, Talles, Imágenes

**Files:**
- Modify: `src/components/orders/ArticleEditorDrawer.tsx`

**Interfaces:**
- Consumes: `ColorProveedorCell` de `./ColorProveedorCell`, `SizePickerModal` de `./SizePickerModal`, `ArticleRow`, `ColorValue`, `SizeValue`, `ProductImage`, `ColorImages` de `@/types`

- [ ] **Step 1: Agregar imports necesarios**

Agregar al bloque de imports existente en `ArticleEditorDrawer.tsx`:

```typescript
import { ActionIcon, Badge, FileButton, Image } from "@mantine/core";
import { Plus, X, Trash2 } from "lucide-react";
import { ColorProveedorCell } from "@/components/orders/ColorProveedorCell";
import type { ArticleRow, ColorValue, SizeValue, ProductImage, ColorImages } from "@/types";
```

- [ ] **Step 2: Reemplazar Tab Colores con implementación real**

Reemplazar en `ArticleEditorDrawer.tsx` el `<Tabs.Panel value="colores" ...>` placeholder con:

```tsx
<Tabs.Panel value="colores" p="md">
  <Stack gap="sm">
    <Text size="xs" c="dimmed">
      Los colores existentes en Odoo no se pueden renombrar. Podés agregar colores nuevos.
    </Text>

    {local.rows.map((row, idx) => (
      <Group
        key={row.id}
        align="center"
        gap="sm"
        p="xs"
        style={{ border: "1px solid var(--border)", borderRadius: 6 }}
      >
        {/* Swatch de color */}
        {row.color?.hexColor && (
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: row.color.hexColor,
              border: "1px solid var(--border)",
              flexShrink: 0,
            }}
          />
        )}

        {row.color?.isNew ? (
          /* Color nuevo — editable */
          <div style={{ flex: 1 }}>
            <ColorProveedorCell
              value={row.color}
              allColors={allColors}
              colorBaseOptions={colorBaseOptions}
              onChange={(newColor) => {
                const newRows = local.rows.map((r, i) =>
                  i === idx ? { ...r, color: newColor } : r,
                );
                setLocal((p) => ({ ...p, rows: newRows }));
              }}
              hasQty={false}
              usedColorKeys={new Set(
                local.rows
                  .filter((r, i) => i !== idx && r.color)
                  .map((r) => r.color!.name.toLowerCase()),
              )}
            />
          </div>
        ) : (
          /* Color existente en Odoo — solo lectura */
          <Text size="sm" style={{ flex: 1, color: "var(--text2)" }}>
            {row.color?.name ?? "(sin color)"}
          </Text>
        )}

        {/* Eliminar solo si es nuevo */}
        {row.color?.isNew && (
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => {
              setLocal((p) => ({
                ...p,
                rows: p.rows.filter((_, i) => i !== idx),
              }));
            }}
          >
            <X size={12} />
          </ActionIcon>
        )}
      </Group>
    ))}

    <Button
      variant="subtle"
      color="amber"
      size="xs"
      leftSection={<Plus size={12} />}
      onClick={() => {
        const newRow: ArticleRow = {
          id: crypto.randomUUID(),
          color: {
            id: null,
            name: "",
            colorBase: "",
            hexColor: "",
            isNew: true,
          },
          quantities: {},
          warehouseQuantities: {},
          barcodes: {},
        };
        setLocal((p) => ({ ...p, rows: [...p.rows, newRow] }));
      }}
    >
      Agregar color
    </Button>
  </Stack>
</Tabs.Panel>
```

- [ ] **Step 3: Reemplazar Tab Talles con implementación real**

Reemplazar el `<Tabs.Panel value="talles" ...>` placeholder con:

```tsx
<Tabs.Panel value="talles" p="md">
  <Stack gap="sm">
    <Text size="xs" c="dimmed">
      Los talles existentes en la orden no se pueden eliminar. Podés agregar talles nuevos del sistema.
    </Text>

    {/* Talles actuales */}
    <Group gap="xs" wrap="wrap">
      {local.sizes.map((size) => {
        const isOriginal = (local.originalSizeIds ?? []).includes(size.id);
        return (
          <Badge
            key={size.id}
            variant={isOriginal ? "filled" : "outline"}
            color="amber"
            rightSection={
              !isOriginal ? (
                <ActionIcon
                  size="xs"
                  variant="transparent"
                  color="amber"
                  onClick={() => {
                    setLocal((p) => ({
                      ...p,
                      sizes: p.sizes.filter((s) => s.id !== size.id),
                    }));
                  }}
                >
                  <X size={10} />
                </ActionIcon>
              ) : undefined
            }
          >
            {size.name}
          </Badge>
        );
      })}
    </Group>

    {/* Agregar talle desde el sistema */}
    <Select
      placeholder="Agregar talle..."
      data={sizeAttributes
        .flatMap((sa) => sa.values)
        .filter((sv) => !local.sizes.some((s) => s.id === sv.id))
        .map((sv) => ({ value: String(sv.id), label: sv.name }))}
      onChange={(val) => {
        if (!val) return;
        const allSizes = sizeAttributes.flatMap((sa) => sa.values);
        const found = allSizes.find((s) => String(s.id) === val);
        if (!found) return;
        setLocal((p) => ({
          ...p,
          sizes: [...p.sizes, found],
        }));
      }}
      value={null}
      searchable
      clearable
    />
  </Stack>
</Tabs.Panel>
```

- [ ] **Step 4: Reemplazar Tab Imágenes con implementación real**

Reemplazar el `<Tabs.Panel value="imagenes" ...>` placeholder con:

```tsx
<Tabs.Panel value="imagenes" p="md">
  <Stack gap="md">
    <Text size="xs" c="dimmed">
      Primera imagen de cada color es la imagen principal. Las demás son adicionales.
    </Text>

    {local.rows
      .filter((row) => row.color)
      .map((row) => {
        const colorName = row.color!.name;
        const images: ProductImage[] = local.colorImages[colorName] ?? [];

        return (
          <Stack key={row.id} gap="xs">
            <Group gap="xs">
              {row.color?.hexColor && (
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: row.color.hexColor,
                    border: "1px solid var(--border)",
                  }}
                />
              )}
              <Text size="sm" fw={500} style={{ color: "var(--text2)" }}>
                {colorName}
              </Text>
            </Group>

            <Group gap="xs" wrap="wrap">
              {images.map((img, imgIdx) => (
                <div
                  key={img.id}
                  style={{ position: "relative", width: 72, height: 72 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.previewUrl || `data:${img.mimeType};base64,${img.base64}`}
                    alt={img.fileName}
                    style={{
                      width: 72,
                      height: 72,
                      objectFit: "cover",
                      borderRadius: 4,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <ActionIcon
                    size="xs"
                    color="red"
                    variant="filled"
                    style={{ position: "absolute", top: 2, right: 2 }}
                    onClick={() => {
                      const newImages = images.filter((_, i) => i !== imgIdx);
                      const isLastForColor = newImages.length === 0;

                      setLocal((p) => {
                        const updated: ColorImages = {
                          ...p.colorImages,
                          [colorName]: newImages,
                        };

                        // Track deleted Odoo images
                        const newDeleted = img.odooId
                          ? [...p.deletedOdooImageIds, img.odooId]
                          : p.deletedOdooImageIds;

                        // Track cleared primary colors
                        const newCleared =
                          img.isFromOdoo && imgIdx === 0 && isLastForColor
                            ? [...p.clearedPrimaryColorNames, colorName]
                            : p.clearedPrimaryColorNames;

                        return {
                          ...p,
                          colorImages: updated,
                          deletedOdooImageIds: newDeleted,
                          clearedPrimaryColorNames: newCleared,
                        };
                      });
                    }}
                  >
                    <Trash2 size={8} />
                  </ActionIcon>
                </div>
              ))}

              {/* Agregar imagen nueva */}
              <FileButton
                onChange={(files) => {
                  if (!files || files.length === 0) return;
                  Array.from(files).forEach((file) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      const dataUrl = e.target?.result as string;
                      const base64 = dataUrl.split(",")[1] ?? "";
                      const newImg: ProductImage = {
                        id: crypto.randomUUID(),
                        fileName: file.name,
                        base64,
                        mimeType: file.type,
                        previewUrl: dataUrl,
                      };
                      setLocal((p) => ({
                        ...p,
                        colorImages: {
                          ...p.colorImages,
                          [colorName]: [...(p.colorImages[colorName] ?? []), newImg],
                        },
                      }));
                    };
                    reader.readAsDataURL(file);
                  });
                }}
                accept="image/*"
                multiple
              >
                {(props) => (
                  <ActionIcon
                    {...props}
                    variant="outline"
                    color="gray"
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 4,
                      border: "1px dashed var(--border)",
                    }}
                  >
                    <Plus size={16} />
                  </ActionIcon>
                )}
              </FileButton>
            </Group>
          </Stack>
        );
      })}
  </Stack>
</Tabs.Panel>
```

- [ ] **Step 5: Lint + verificar que no hay errores TS**

```bash
pnpm lint 2>&1 | grep ArticleEditorDrawer
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/orders/ArticleEditorDrawer.tsx
git commit -m "feat: complete ArticleEditorDrawer with Colores, Talles, Imagenes tabs"
```

---

### Task 5: `OrderGrid` + `edit/page.tsx` — Wiring del drawer

**Files:**
- Modify: `src/components/orders/OrderGrid.tsx`
- Modify: `src/app/(app)/orders/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `ArticleEditorDrawer` de `@/components/orders/ArticleEditorDrawer`
- Produces: botón "Editar" visible por artículo cuando `readOnly && onEditArticle`

- [ ] **Step 1: Agregar prop `onEditArticle` a OrderGrid**

En `src/components/orders/OrderGrid.tsx`, en la interfaz `Props` (línea ~27-45), agregar:

```typescript
  onEditArticle?: (article: Article) => void;
```

En la desestructuración de la función `OrderGrid` (línea ~89-106), agregar:

```typescript
  onEditArticle,
```

- [ ] **Step 2: Agregar botón "Editar" por artículo en OrderGrid**

Reemplazar el bloque `articles.map(...)` en el return de OrderGrid (línea ~537-569) con:

```tsx
{articles.map((article) => (
  <div key={article.id} style={{ position: "relative" }}>
    {readOnly && onEditArticle && (
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
        }}
      >
        <Button
          size="xs"
          variant="subtle"
          color="amber"
          onClick={() => onEditArticle(article)}
        >
          Editar
        </Button>
      </div>
    )}
    <ArticleRowContainer
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
  </div>
))}
```

- [ ] **Step 3: Agregar estado y handlers del drawer en `edit/page.tsx`**

En `src/app/(app)/orders/[id]/edit/page.tsx`, agregar el import del drawer y estado local:

Agregar a los imports al tope del archivo:
```typescript
import { ArticleEditorDrawer } from "@/components/orders/ArticleEditorDrawer";
```

Agregar después de la declaración de `const [resumenOpen, setResumenOpen] = useState(false);`:
```typescript
const [drawerArticle, setDrawerArticle] = useState<Article | null>(null);
const [drawerIndex, setDrawerIndex] = useState<number | null>(null);
```

- [ ] **Step 4: Agregar handlers del drawer en `edit/page.tsx`**

Agregar después de `const isConfirmed = order?.status === "CONFIRMED";`:

```typescript
function handleEditArticle(article: Article) {
  const idx = articles.findIndex((a) => a.id === article.id);
  setDrawerArticle(article);
  setDrawerIndex(idx);
}

function handleArticleUpdate(updated: Article) {
  setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  setDrawerArticle(null);
  setDrawerIndex(null);
}
```

- [ ] **Step 5: Pasar `onEditArticle` a OrderGrid y montar el drawer en `edit/page.tsx`**

En `edit/page.tsx`, al `<OrderGrid ...>` existente (línea ~361), agregar la prop:

```tsx
onEditArticle={isConfirmed ? handleEditArticle : undefined}
```

Agregar el drawer justo antes del cierre del `<div>` principal (antes de `<DraftWarningModal ...>`):

```tsx
{drawerArticle !== null && drawerIndex !== null && (
  <ArticleEditorDrawer
    orderId={order.id}
    articleIndex={drawerIndex}
    article={drawerArticle}
    opened={drawerArticle !== null}
    onClose={() => {
      setDrawerArticle(null);
      setDrawerIndex(null);
    }}
    onArticleUpdate={handleArticleUpdate}
  />
)}
```

- [ ] **Step 6: Verificar con lint**

```bash
pnpm lint 2>&1 | head -40
```

Esperado: sin nuevos errores.

- [ ] **Step 7: Prueba manual end-to-end**

1. Correr `pnpm dev`
2. Ingresar con usuario ADMIN o MANAGER
3. Ir a `/orders` y abrir una orden con status CONFIRMED
4. Verificar que aparece botón "Editar" (color amber, subtle) al costado de cada artículo
5. Click en "Editar" → verificar que se abre el drawer con el nombre del artículo en el header
6. Tab General: editar nombre → click Guardar → verificar notificación verde + drawer cierra
7. Verificar en Odoo que el `product.template.name` se actualizó

- [ ] **Step 8: Commit**

```bash
git add src/components/orders/OrderGrid.tsx src/app/(app)/orders/[id]/edit/page.tsx
git commit -m "feat: wire ArticleEditorDrawer into confirmed order edit page"
```

---

### Task 6: Relajar campos obligatorios al confirmar

**Files:**
- Modify: `src/lib/orderValidation.ts`
- Modify: `src/app/(app)/orders/[id]/edit/page.tsx`

**Interfaces:**
- `validateForConfirm` y `validateForDraft` modificadas — mantienen la misma firma

**Objetivo:** Eliminar los chequeos de categoría, `sizeAttributeId`, atributos requeridos (Marca, Temporada, etc.) y completitud de color de la validación de confirmación. Mantener: proveedor, marca (orden), fecha, artículos existentes, nombre del artículo, al menos una cantidad, compradora.

- [ ] **Step 1: Modificar `validateForDraft` — quitar chequeos de categoría y sizeAttributeId**

En `src/lib/orderValidation.ts`, reemplazar la función `validateForDraft` completa:

```typescript
export function validateForDraft(order: OrderData): ValidationResult {
  const missing: string[] = [];

  if (!order.supplierId) missing.push("Proveedor no seleccionado");
  if (!order.brandId) missing.push("Marca no seleccionada");
  if (!order.date) missing.push("Fecha no seleccionada");
  if (order.articles.length === 0) missing.push("Sin artículos");

  return { valid: missing.length === 0, missing };
}
```

- [ ] **Step 2: Modificar `validateForConfirm` — quitar atributos requeridos y color check**

Reemplazar la función `validateForConfirm` completa:

```typescript
export function validateForConfirm(order: OrderData): ValidationResult {
  const base = validateForDraft(order);
  const missing = [...base.missing];

  if (!order.compradoraIds?.length) missing.push("Comprador no seleccionado");

  for (const article of order.articles) {
    const label = article.name || "(artículo sin nombre)";

    if (!article.name) missing.push(`Artículo sin nombre`);

    const hasQty = article.rows.some((row) => {
      const normal = article.sizes.some(
        (size) => parseInt(row.quantities[size.name] || "0") > 0,
      );
      const warehouse = Object.values(row.warehouseQuantities || {}).some(
        (v) => parseInt(v || "0") > 0,
      );
      return normal || warehouse;
    });
    if (!hasQty) missing.push(`"${label}": sin cantidades cargadas`);
  }

  return { valid: missing.length === 0, missing };
}
```

Cambios respecto al original:
- Eliminado: chequeo de atributos requeridos (`getMissingRequiredFamilies`)
- Eliminado: chequeo de `colorBase` y `hexColor` para colores nuevos
- La importación de `getMissingRequiredFamilies` puede quedar (la usa la UI de validación visual) o removerse si ya no se usa en este archivo

- [ ] **Step 3: Quitar el pre-check de atributos en `handleConfirm` de `edit/page.tsx`**

En `src/app/(app)/orders/[id]/edit/page.tsx`, en la función `handleConfirm`, eliminar el bloque que chequea `getMissingRequiredFamilies` antes de llamar `validateForConfirm`:

```typescript
// ELIMINAR este bloque:
const attrWarnings: string[] = [];
for (const article of articles) {
  const label = article.name || "(artículo sin nombre)";
  const missing = getMissingRequiredFamilies(article.attributes ?? []);
  for (const f of missing)
    attrWarnings.push(`"${label}": falta atributo "${f.label}"`);
}
if (attrWarnings.length > 0) {
  setShowValidation(true);
  setDraftWarning({ open: true, warnings: attrWarnings, mode: "confirm" });
  return;
}
```

También eliminar el import de `getMissingRequiredFamilies` si no se usa en otro lugar del archivo:

```typescript
// Verificar si queda: import { getMissingRequiredFamilies } from "@/lib/required-attrs";
// Si no se usa más, eliminarlo.
```

- [ ] **Step 4: Lint y verificar**

```bash
pnpm lint 2>&1 | head -40
```

Esperado: sin errores nuevos. Si aparece "no-unused-vars" para `getMissingRequiredFamilies`, eliminar el import.

- [ ] **Step 5: Prueba manual de confirmación relajada**

1. Crear una orden nueva con artículos sin categoría y sin atributos (Marca, Temporada, etc.)
2. Intentar confirmar → debe permitir continuar al `ConfirmModal` sin mostrar errores de atributos
3. Verificar que sigue bloqueando si falta proveedor, marca de orden, fecha o cantidades

- [ ] **Step 6: Commit final**

```bash
git add src/lib/orderValidation.ts src/app/(app)/orders/[id]/edit/page.tsx
git commit -m "feat: relax confirm validation - remove required attrs, category, color checks"
```

---

## Notas de implementación

**Imágenes existentes en el drawer:** Al abrir el drawer, `article.colorImages` ya viene cargado desde la página padre (que hace fetch a `/api/products/[id]/images` al cargar la orden). Las imágenes de Odoo tienen `isFromOdoo: true` y `base64: ""` (vacío para ahorrar payload) pero tienen `previewUrl` con la URL de preview.

**Color sin cantidad:** El tab Colores del drawer agrega `ArticleRow` nuevas con `quantities: {}` y `warehouseQuantities: {}` vacíos. El server nunca toca las `purchase.order.line`, así que las cantidades 0 no importan.

**`console.log(missing)` en `validateForConfirm`:** Hay un `console.log(missing)` en el código original (línea 81 de `orderValidation.ts`). Eliminarlo en Task 6 junto con los demás cambios.
