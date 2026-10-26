# Inline Article Edit (Confirmed Orders) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando el usuario aprieta "Editar" en un artículo de una orden CONFIRMED, esa fila se vuelve editable inline (idéntico al modo creación), con botones "Guardar" y "Cancelar" reemplazando el botón "Editar". Al guardar, persiste solo en DB local vía PUT.

**Architecture:** El estado `editingArticleId` vive en `OrderGrid`. Cuando una fila está siendo editada, recibe `readOnly=false` aunque la orden sea CONFIRMED — `ArticleRow` ya maneja esto correctamente. El snapshot del artículo original se guarda en un ref para poder cancelar. El save llama a un callback `onSaveArticle` que la page implementa.

**Tech Stack:** React, TypeScript, Next.js 16 (App Router), Mantine 9

## Global Constraints

- No tocar lógica de Odoo — el save solo actualiza DB local
- No crear nuevos componentes — modificar los existentes
- No romper el flujo de DRAFT (readOnly=false) — debe seguir funcionando igual
- No usar `ArticleEditorDrawer` en el nuevo flujo — eliminarlo de `edit/page.tsx`
- Mantine 9 para cualquier UI nueva

---

### Task 1: Agregar `editingArticleId` en OrderGrid y pasar readOnly por-fila

**Files:**
- Modify: `casa-sonia-compras/src/components/orders/OrderGrid.tsx`

**Interfaces:**
- Produce: prop nuevo `onSaveArticle?: (article: Article) => Promise<void>` en `Props` de OrderGrid

**Context clave:**
- `readOnly` hoy se pasa igual a todos los `ArticleRowContainer` (línea 588)
- El botón "Editar" está en OrderGrid líneas 541-558, llama `onEditArticle(article)` del padre
- `articles` es el estado interno de OrderGrid (línea 122)

- [ ] **Step 1: Agregar estado y ref en OrderGrid**

En `OrderGrid.tsx`, dentro de la función `OrderGrid`, después de los estados existentes (~línea 128), agregar:

```ts
const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
const editingSnapshotRef = useRef<Article | null>(null);
```

El import de `useRef` ya existe. Verificar que `Article` esté importado (sí, línea 21).

- [ ] **Step 2: Agregar prop `onSaveArticle` a la interfaz Props**

En la interfaz `Props` (~línea 27), agregar después de `onEditArticle`:

```ts
onSaveArticle?: (article: Article) => Promise<void>;
```

- [ ] **Step 3: Desestructurar el nuevo prop en la función**

En la desestructuración de props de `OrderGrid` (~línea 107), agregar:

```ts
onSaveArticle,
```

- [ ] **Step 4: Reemplazar el bloque del botón Editar (líneas 541-558) con lógica inline**

Reemplazar este bloque en el `articles.map`:

```tsx
{readOnly && onEditArticle && (
  <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10 }}>
    <Button size="xs" variant="subtle" color="amber" onClick={() => onEditArticle(article)}>
      Editar
    </Button>
  </div>
)}
```

Por:

```tsx
{readOnly && onSaveArticle && (
  <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10, display: "flex", gap: 6 }}>
    {editingArticleId === article.id ? (
      <>
        <Button
          size="xs"
          variant="filled"
          color="green"
          onClick={async () => {
            const current = articles.find((a) => a.id === article.id);
            if (current) await onSaveArticle(current);
            setEditingArticleId(null);
            editingSnapshotRef.current = null;
          }}
        >
          Guardar
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          onClick={() => {
            if (editingSnapshotRef.current) {
              updateArticle(article.id, editingSnapshotRef.current);
            }
            setEditingArticleId(null);
            editingSnapshotRef.current = null;
          }}
        >
          Cancelar
        </Button>
      </>
    ) : (
      <Button
        size="xs"
        variant="subtle"
        color="amber"
        onClick={() => {
          editingSnapshotRef.current = article;
          setEditingArticleId(article.id);
        }}
      >
        Editar
      </Button>
    )}
  </div>
)}
```

- [ ] **Step 5: Cambiar el `readOnly` pasado a ArticleRowContainer para que sea por-fila**

En la línea donde se pasa `readOnly={readOnly}` a `ArticleRowContainer` (~línea 588), cambiar a:

```tsx
readOnly={readOnly && article.id !== editingArticleId}
```

- [ ] **Step 6: Verificar que compile sin errores**

```bash
cd casa-sonia-compras && pnpm build 2>&1 | tail -20
```

Expected: sin errores de TypeScript en OrderGrid.

---

### Task 2: Implementar `onSaveArticle` en edit/page.tsx y limpiar drawer

**Files:**
- Modify: `casa-sonia-compras/src/app/(app)/orders/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `onSaveArticle?: (article: Article) => Promise<void>` de OrderGrid (Task 1)

**Context clave:**
- `doSaveDraft(silent)` ya existe y hace PUT a `/api/local-orders/${id}` con todos los artículos
- `drawerArticle`, `drawerIndex`, `handleEditArticle`, `handleArticleUpdate` son el flujo viejo → se eliminan
- `ArticleEditorDrawer` se importa y usa → se elimina
- `isConfirmed = order?.status === "CONFIRMED"` (línea 78)
- `onEditArticle={isConfirmed ? handleEditArticle : undefined}` (línea 374) → reemplazar

- [ ] **Step 1: Agregar `handleSaveArticle` después de `handleArticleUpdate`**

```ts
async function handleSaveArticle(updatedArticle: Article): Promise<void> {
  const updatedArticles = articles.map((a) =>
    a.id === updatedArticle.id ? updatedArticle : a,
  );
  const localArticles = stripImagesForDB(updatedArticles);
  const res = await fetch(`/api/local-orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supplierId: supplier?.id,
      supplierName: supplier?.name,
      brandId: globalBrand?.id ?? null,
      brandName: globalBrand?.name ?? null,
      compradoraIds: compradoras.map((c) => c.id),
      date: dateStr,
      articles: localArticles,
      warehouseIds: selectedWarehouses.map((w) => w.id),
    }),
  });
  if (!res.ok) {
    const data = await res.json();
    notifications.show({
      color: "red",
      title: "Error al guardar",
      message: data.error || "No se pudo guardar el artículo",
    });
    throw new Error(data.error);
  }
  setArticles(updatedArticles);
  notifications.show({
    color: "green",
    title: "Artículo guardado",
    message: "Los cambios fueron guardados correctamente.",
  });
}
```

- [ ] **Step 2: Eliminar estado del drawer**

Eliminar estas líneas (~75-76):
```ts
const [drawerArticle, setDrawerArticle] = useState<Article | null>(null);
const [drawerIndex, setDrawerIndex] = useState<number | null>(null);
```

- [ ] **Step 3: Eliminar funciones del drawer**

Eliminar las funciones `handleEditArticle` (~línea 80-84) y `handleArticleUpdate` (~línea 86-91).

- [ ] **Step 4: Actualizar el import — eliminar `ArticleEditorDrawer`**

Eliminar del bloque de imports:
```ts
import { ArticleEditorDrawer } from "@/components/orders/ArticleEditorDrawer";
```

- [ ] **Step 5: Reemplazar props de OrderGrid relacionadas al drawer**

En el componente `<OrderGrid>` (~línea 374), cambiar:
```tsx
onEditArticle={isConfirmed ? handleEditArticle : undefined}
```
Por:
```tsx
onSaveArticle={isConfirmed ? handleSaveArticle : undefined}
```

Y en la misma prop, también eliminar `onEditArticle` del componente si quedó.

- [ ] **Step 6: Eliminar el bloque `<ArticleEditorDrawer>` del JSX**

Eliminar el bloque completo (~líneas 414-426):
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

- [ ] **Step 7: Build final para verificar sin errores**

```bash
cd casa-sonia-compras && pnpm build 2>&1 | tail -30
```

Expected: 0 errores de TypeScript.

- [ ] **Step 8: Prueba manual**

1. Ir a una orden CONFIRMED
2. Verificar que aparece botón "Editar" en cada artículo
3. Click "Editar" → fila se vuelve editable (igual que crear)
4. Cambiar algún campo (nombre, precio, etc.)
5. Click "Guardar" → notificación verde, fila vuelve a read-only con el nuevo valor
6. Volver a entrar a la orden → el cambio persiste
7. Probar "Cancelar" → los cambios se descartan, vuelve al valor original
8. Verificar que en un DRAFT, el comportamiento es idéntico al anterior (todo editable sin botón Editar)
