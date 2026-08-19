# Article Editor Post-Confirmación

**Fecha:** 2026-08-19  
**Estado:** Aprobado

## Objetivo

Permitir editar atributos de artículos desde órdenes de compra ya confirmadas en Odoo, sin modificar las líneas de la purchase.order (cantidades). Habilita un flujo de "carga rápida" donde se confirma una orden con datos básicos y se completa la información del artículo después.

## Scope

Esta feature incluye únicamente la edición post-confirmación. La relajación de campos obligatorios al confirmar es una feature separada posterior.

---

## Campos editables

| Campo | Modelo Odoo afectado |
|-------|---------------------|
| Nombre | `product.template.name` |
| Categoría | `product.template.categ_id` |
| Precio costo | `product.template.standard_price` |
| Precio venta | `product.template.list_price` |
| Descripción web | `product.template.description_sale` |
| Colores (agregar/quitar) | `product.template.attribute_line_ids` → genera `product.product` |
| Talles (agregar/quitar) | `product.template.attribute_line_ids` → genera `product.product` |
| Atributos generales | `product.template.attribute_line_ids` |
| Códigos de barra | `product.product.barcode` por variante color+talle |
| Imágenes | `product.image` + Google Drive |

**Campos bloqueados siempre:** cantidades, cabecera de orden (proveedor, fecha, marca, compradoras, almacenes).

**Restricción de variantes:** agregar colores o talles nuevos crea variantes en Odoo pero **no** agrega líneas a la `purchase.order`. Las nuevas filas/columnas en el drawer no tienen inputs de cantidad.

---

## Arquitectura

### Vista de orden confirmada

`/orders/[id]/edit` cuando `order.status === "CONFIRMED"`:

- `OrderGrid` se mantiene con `readOnly={true}` — muestra cantidades y toda la data existente sin cambios
- Nuevo prop en `OrderGrid`: `onEditArticle?: (article: Article) => void`
- Cuando `readOnly && onEditArticle`, cada fila de artículo muestra botón **"Editar"** al inicio
- Estilos del botón: variante `subtle`, tamaño `xs`, color `amber` — consistente con la app

### ArticleEditorDrawer

**Archivo:** `src/components/orders/ArticleEditorDrawer.tsx`

Mantine `Drawer` con las siguientes características:
- `position="right"`, `size="xl"`
- Header: nombre del artículo + badge de estado
- Estado local: copia del artículo (`localArticle: Article`)
- Footer fijo: botón "Guardar" (`color="amber"`) + botón "Cancelar"
- Usa variables CSS existentes de la app (`--bg`, `--surface`, `--border`, `--text2`)
- NO introduce colores nuevos

**Tabs (Mantine `Tabs`):**

| Tab | Contenido |
|-----|-----------|
| General | TextInput nombre, Select categoría, NumberInput precio costo, NumberInput precio venta, Textarea descripción |
| Colores | Filas de color existentes (read-only si ya están en Odoo) + agregar color nuevo. Sin columnas de cantidad |
| Talles | Lista de talles + agregar/quitar. Sin inputs de cantidad |
| Atributos | Monta `ArticleAttributes` existente |
| Códigos de barra | Monta `BarcodeTab` existente |
| Imágenes | Imágenes por color (componente existente) |

**Flujo de guardado en el drawer:**
1. Click "Guardar" → loading state en botón
2. `PATCH /api/orders/[id]/articles` con `{ articleIndex, article }`
3. Success → notificación Mantine verde + cierra drawer + llama `onArticleUpdate(updated)`
4. Error → mensaje de error inline en el drawer (no cierra)

### Cambios en `/orders/[id]/edit`

```tsx
// Estado adicional en la página
const [drawerArticle, setDrawerArticle] = useState<Article | null>(null);
const [drawerIndex, setDrawerIndex] = useState<number | null>(null);

// Handler cuando OrderGrid dispara "Editar"
function handleEditArticle(article: Article) {
  const idx = articles.findIndex(a => a.id === article.id);
  setDrawerArticle(article);
  setDrawerIndex(idx);
}

// Callback cuando el drawer guarda
function handleArticleUpdate(updated: Article) {
  setArticles(prev => prev.map(a => a.id === updated.id ? updated : a));
  setDrawerArticle(null);
  setDrawerIndex(null);
}
```

- `OrderGrid` recibe `onEditArticle={isConfirmed ? handleEditArticle : undefined}`
- `ArticleEditorDrawer` se monta condicionalmente cuando `drawerArticle !== null`

---

## API

### `PATCH /api/orders/[id]/articles`

**Auth:** `withAuth` — roles `ADMIN | MANAGER | EMPLEADO`

**Body:**
```ts
{
  articleIndex: number;
  article: Article;
}
```

**Validaciones:**
- Orden existe y pertenece al usuario/empresa
- `order.status === "CONFIRMED"`
- `article.existingProductId` no es null (solo se editan artículos con producto Odoo vinculado)
- `articleIndex` dentro del rango del array

**Pasos del handler:**
1. Cargar orden de BD local
2. Llamar `updateArticleInOdoo(article)`
3. Patch del JSON: `order.articles[articleIndex] = stripImagesForDB(article)`
4. `prisma.order.update({ articles: updatedArticles })`
5. Retornar `{ article: updatedArticle }`

**Respuestas:**
- `200` — artículo actualizado
- `400` — validación fallida
- `403` — orden no confirmada o sin producto Odoo
- `404` — orden no encontrada
- `500` — error de sync con Odoo

---

## Lib de sync Odoo

### `src/lib/odooArticleUpdate.ts`

```ts
export async function updateArticleInOdoo(article: Article): Promise<void>
```

**Paso 1 — Actualizar product.template:**
```
write(productTemplateId, {
  name: article.name,
  categ_id: article.category.id,
  list_price: parseFloat(article.salePrice),
  standard_price: parseFloat(article.price),
  description_sale: article.description,
})
```

**Paso 2 — Colores nuevos:**
- Detección: `row.color?.isNew === true` (flag ya existe en `ColorValue`)
- Para cada fila con color nuevo:
  - Buscar o crear `product.attribute.value` con ese nombre
  - `write` en la línea de atributo color del template: `value_ids: [[4, newValueId]]`
- Odoo genera `product.product` automáticamente — sin tocar `purchase.order.line`
- Al retornar el artículo actualizado: `row.color.isNew = false`, `row.color.id = newValueId`

**Paso 3 — Talles nuevos:**
- Detección: `SizeValue.id` null o no presente en `article.originalSizeIds`
- Mismo mecanismo que colores: agregar value ID a la línea de atributo talle del template

**Paso 4 — Barcodes:**
- Por cada fila de color × talle: buscar `product.product` por `product_template_attribute_value_ids`
- `write({ barcode: value })` en el variant encontrado

**Paso 5 — Imágenes:**
- Mismo flujo que en `ConfirmModal` / `OrderProgressModal`:
  - Imágenes nuevas (sin `odooId`) → upload a Drive → crear `product.image` en Odoo
  - Imágenes eliminadas (`deletedOdooImageIds`) → `unlink` en Odoo
  - `clearedPrimaryColorNames` → limpiar `image_variant_1920` en la variante

---

## Estilos

- Usar únicamente variables CSS existentes: `--bg`, `--surface`, `--border`, `--text2`, `--text3`
- Colores Mantine: `amber` (primary), `red` (error), `green` (success) — sin introducir colores nuevos
- Tipografía: `--font-sans` (DM Sans), `--font-mono` (DM Mono) para códigos
- El drawer respeta el dark theme existente sin configuración adicional (usa Mantine + variables CSS)

---

## Out of scope

- Relajación de campos obligatorios al confirmar (feature siguiente)
- Editar artículos sin `existingProductId` (no tienen producto Odoo vinculado)
- Modificar cantidades de la orden
- Agregar artículos nuevos a una orden confirmada
- Eliminar artículos de una orden confirmada
