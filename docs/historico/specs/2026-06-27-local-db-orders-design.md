# Design Spec: Sistema de Órdenes con DB Propia

**Fecha:** 2026-06-27  
**Estado:** Aprobado — listo para implementación

---

## Contexto

La app Casa Sonia Compras hoy crea OC directamente en Odoo al guardar. El nuevo flujo introduce una DB propia (MySQL) donde las OC viven en estado editable hasta que el usuario las confirma explícitamente. Solo la acción "Confirmar Orden" toca Odoo.

Se elimina la feature de edición directa contra Odoo (PATCH /api/orders/[id]).

---

## Decisiones de producto

| Decisión | Elección | Motivo |
|---|---|---|
| DB | MySQL + Prisma v7 | Contenedor MySQL ya disponible en VPS |
| Schema | Híbrido: campos escalares + `articles JSON` | Evita 6+ tablas para estructura nested de Article[] |
| Autosave | localStorage, debounce 5s (solo orden nueva) | Evita requests frecuentes con payloads grandes |
| Imágenes en draft | Strip base64, upload a temp VPS al guardar explícito | MySQL no es para blobs grandes en JSON |
| Grid library | AG Grid Community v35 (ya instalado) | Sorting, filtering, paginación sin dependencias extra |
| Navegación | Sidebar persistente 220px, colapsable a 56px | Escalable para futura sección de Inventario |
| Pantallas Odoo | `/odoo-orders` read-only separada | Permite ver historial sin mezclar con flujo local |
| Órdenes históricas Odoo | No se migran a DB propia | Arranque limpio, sin paso de migración |

---

## Modelo de datos

### `prisma/schema.prisma`

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

### `prisma.config.ts`

```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

`.env` agrega: `DATABASE_URL="mysql://user:pass@host:3306/casa_sonia_compras"`

### `src/lib/prisma.ts`

```typescript
import { PrismaClient } from "../../prisma/generated/client";
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### Tipo `ProductImage` en DB (sin base64)

Al persistir `articles` en DB, cada `ProductImage` se guarda como:

```typescript
{
  id: string;
  fileName: string;
  mimeType: string;
  isFromOdoo: boolean;
  odooId?: number;
  tempPath?: string; // "/uploads/temp/[orderId]/[uuid].ext"
  // base64 y previewUrl se omiten al guardar en DB
}
```

Imágenes `isFromOdoo: true` se recargan desde Odoo al abrir el draft.  
Imágenes nuevas (no isFromOdoo) se suben a temp VPS al hacer "Guardar borrador".

---

## Máquina de estados

```
DRAFT ──[Confirmar]──► CONFIRMED
  │          │
  │    [Error Odoo]──► ERROR
  │                      │
  │              [Editar]─┘ (→ DRAFT, limpia error_detail)
  │
  └──[Eliminar]──► borrado físico

CONFIRMED ──[Duplicar]──► nuevo DRAFT
ERROR     ──[Duplicar]──► nuevo DRAFT
ERROR     ──[Eliminar]──► borrado físico
```

**Reglas:**
- `DRAFT` y `ERROR`: editables, eliminables
- `CONFIRMED`: inmutable en sistema propio, solo duplicable
- Editar cualquier campo de un `ERROR` → status vuelve a `DRAFT` automáticamente

---

## API

### Nuevos endpoints `/api/local-orders`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/local-orders` | Lista paginada desde MySQL. Filtros: status, supplier_id, date_from, date_to |
| POST | `/api/local-orders` | Crea DRAFT. Guarda articles sin base64/previewUrl |
| GET | `/api/local-orders/[id]` | Lee orden. Reincorpora previewUrl para imágenes isFromOdoo (desde Odoo) |
| PUT | `/api/local-orders/[id]` | Actualiza DRAFT. Si status=ERROR → resetea a DRAFT. Strip base64 |
| DELETE | `/api/local-orders/[id]` | Elimina. Guard: solo DRAFT o ERROR |
| POST | `/api/local-orders/[id]/confirm` | Valida + crea en Odoo + actualiza status |
| POST | `/api/local-orders/[id]/duplicate` | Copia articles/supplier/date → nuevo DRAFT |
| POST | `/api/local-orders/[id]/images` | Recibe FormData, guarda en `/uploads/temp/[id]/`, retorna tempPath[] |

### Lógica de `/confirm` — atomicidad mejorada

1. Carga orden de DB, verifica status=DRAFT o ERROR
2. Validación estricta: proveedor, fecha, ≥1 artículo, cada artículo con categoría + sizeAttributeId + colores completos (hexColor, colorBase) + ≥1 qty>0
3. Ejecuta lógica de creación Odoo (extraída de `POST /api/orders`):
   - Crea/actualiza productos y variantes
   - Crea `purchase.order` → guarda `purchaseOrderId` en variable
   - Ejecuta `button_confirm`
   - Si `button_confirm` falla → `unlink(purchase.order, [purchaseOrderId])` + rollback productos
   - Genera PDFs (best-effort, no falla la confirmación)
   - Sincroniza imágenes desde tempPath a Odoo/Drive
   - Limpia `/uploads/temp/[id]/`
4. En éxito: `UPDATE status=CONFIRMED, odoo_order_id, odoo_order_name`
5. En error: `UPDATE status=ERROR, error_detail=JSON.stringify({ message, step, partialOdooId? })`

### Endpoints existentes — destino

| Endpoint | Acción |
|---|---|
| `GET /api/orders` | Mantener — pantalla Odoo read-only |
| `GET /api/orders/[id]` | Mantener — detalle OC Odoo |
| `GET /api/orders/[id]/pdf` | Mantener |
| `POST /api/orders` | Eliminar de UI (lógica migra a `/confirm`) |
| `PATCH /api/orders/[id]` | Eliminar — edición directa Odoo reemplazada |

---

## UI y navegación

### Layout compartido

`src/app/(app)/layout.tsx` — nuevo layout con sidebar:

- Sidebar 220px fijo, colapsable a 56px (toggle, estado en localStorage)
- Logo CS en top del sidebar
- Botón "+ Nueva Orden" (amber, filled) debajo del logo
- Items nav con ícono + label, active state: fondo amber/10 + border-left 2px amber
- Hover: surface2, transición 150ms
- En móvil: sidebar = drawer overlay con hamburger en top bar

**Items:**

```
[+ Nueva Orden]   ← botón primario
────────────────
📋 Órdenes        → /orders
🏪 Historial Odoo → /odoo-orders
────────────────
📦 Inventario     → /inventory  (disabled, badge "Próximamente")
```

**Estructura de rutas:**

```
src/app/(app)/
  layout.tsx              ← NUEVO sidebar layout
  orders/
    page.tsx              ← lista local DB (reemplaza contenido actual)
    new/page.tsx          ← sin cambios funcionales, ajuste autosave 5s
    [id]/edit/page.tsx    ← edita draft local (reemplaza lógica Odoo)
  odoo-orders/
    page.tsx              ← NUEVO: historial Odoo read-only (mueve lógica actual de /orders)
```

### Lista `/orders` — AG Grid

Columnas: Fecha creación | Proveedor | Estado (badge) | Artículos (count) | Fecha OC | N° Odoo | Acciones

Acciones por estado:

```
DRAFT:     [Editar]  [Confirmar ↑]  [Duplicar]  [🗑 Eliminar]
CONFIRMED: [Ver]     [Duplicar]
ERROR:     [⚠ Ver error]  [Editar]  [Reintentar]  [Duplicar]  [🗑 Eliminar]
```

- "Confirmar ↑": amber, ícono send, tooltip "Envía a Odoo"
- "🗑": rojo, confirmation dialog
- "⚠ Ver error": abre modal con error_detail completo
- Paginación server-side, 30/página

### Lista `/odoo-orders` — AG Grid (read-only)

Columnas: N° OC | Proveedor | Estado Odoo | Fecha | Total  
Sin acciones de edición. Botón "Ver PDF" si tiene adjunto.

### Formulario nueva/editar orden

**Sticky footer con acciones:**

```
[← Volver]                    [Guardar borrador]  [Confirmar Orden ↑]
```

- "Confirmar Orden ↑": amber filled, ícono send — único CTA primario
- "Guardar borrador": outline amber — acción secundaria
- Texto xs dimmed junto a Confirmar: "Envía a Odoo"

**"Guardar borrador" con campos incompletos → modal:**

```
"Algunos campos están incompletos"
• Artículo "X": falta categoría
• Artículo "Y": falta tipo de talle
[Corregir]    [Guardar igual →]
```

**"Confirmar Orden" → validación estricta, sin opción de confirmar igual.**

**Banner en formulario de orden ERROR:**

```
⚠ Esta orden falló al confirmarse. Revisá el detalle antes de reintentar.
[Ver detalle]
```

Al editar cualquier campo → status vuelve a DRAFT silenciosamente.

### Acción Duplicar

Modal: "¿Duplicar esta orden? Se creará un borrador editable."  
En éxito → navega al edit del nuevo draft. Toast: "Borrador creado".

---

## Autosave

- **Orden nueva** (`/orders/new`): localStorage, debounce 5s (sube de 1.5s actual). Sin cambios de lógica.
- **Draft existente** (`/orders/[id]/edit`): no hay autosave a DB. El usuario guarda explícitamente con "Guardar borrador". El localStorage no aplica en edit mode (ya es así hoy).

---

## Qué se elimina

- `PATCH /api/orders/[id]` — endpoint de edición directa Odoo
- `/orders/[id]/edit` como ruta que edita Odoo — se reconvierte a edición de draft local
- La página `/orders` actual que lista desde Odoo — mueve a `/odoo-orders`
- `IMPLEMENTATION_PLAN_EDIT_OC.md` — plan anterior supersedado por este spec

---

## Qué NO cambia

- Lógica de creación de productos/variantes en Odoo (se reutiliza tal cual en `/confirm`)
- PDF generation (`src/lib/pdf.ts`)
- Google Drive sync
- Auth flow (JWT, cookies)
- `OrderGrid.tsx` en su core — se agrega "Guardar borrador" y se cambia submit handler
- Tipos TypeScript existentes en `src/types/index.ts` (se extiende, no se modifica)
