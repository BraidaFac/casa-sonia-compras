# Códigos de Barra — Design Spec

**Fecha:** 2026-06-29  
**Branch:** `feature/codigosbarra`  
**Estado:** Aprobado

---

## Objetivo

Agregar soporte de códigos de barra por variante (color × talle) en la orden de compra:
1. Auto-generación de código de referencia en tab Cantidades
2. Nueva tab "Códigos de Barra" con asignación manual y auto-generación por variante
3. Persistencia local (borrador) + sync a Odoo al confirmar

---

## Patrones de generación

### Código de referencia
```
{dd}{MM}{rrrr}
```
- `dd` — día actual (2 dígitos, zero-padded)
- `MM` — mes actual (2 dígitos, zero-padded)
- `rrrr` — 4 dígitos random (0000–9999)

Ejemplo: `290612ab` → `2906` + `4823` = `29064823`

### Código de barras por variante
```
{CodigoReferencia}{AbreviaturaColor}.{Talle}
```
- Sin separador entre referencia y color
- Punto como separador antes del talle

Ejemplo: `29064823RO.S`

### Abreviatura de color (siempre 2 letras, mayúsculas)
| Caso | Regla | Ejemplo |
|------|-------|---------|
| 1 palabra | Primeras 2 letras | `Rojo` → `RO` |
| 2+ palabras | Primera letra de primeras 2 palabras | `Azul Eléctrico` → `AE`, `Rojo Tomate Extra` → `RT` |

---

## Data Model

### Cambio en `ArticleRow` (`src/types/index.ts`)

```typescript
interface ArticleRow {
  barcodes: Record<string, string>; // sizeName → barcode value
  // ... campos existentes sin cambios
}
```

Sigue el patrón de `quantities` (mismo nivel, misma estructura).  
`LocalArticle` hereda de `Article` — se actualiza automáticamente.  
La BD local (Prisma) almacena `barcodes` como parte del JSON `articles` — sin migración de schema.

---

## Utilidades puras — `src/lib/barcodes.ts`

```typescript
/** Genera código de referencia: ddMMrrrr */
export function generateReferencia(): string

/** Deriva abreviatura de 2 letras del nombre de color proveedor (mayúsculas) */
export function colorAbbr(colorName: string): string

/** Genera barcode para una variante */
export function generateBarcode(referencia: string, colorName: string, sizeName: string): string
// → `${referencia}${colorAbbr(colorName)}.${sizeName}`
```

Funciones puras, sin side effects, sin dependencias externas.

---

## UI Changes

### 1. Tab "Cantidades" — botón auto-referencia

**Ubicación:** junto al campo `referencia` existente en `ArticleRow.tsx`  
**Trigger:** solo visible y activo cuando `referencia === ""`  
**Acción:** llama a `generateReferencia()` y setea `article.referencia`  
**Icono:** varita mágica o refresh (Lucide/Tabler, sin emojis)

### 2. Nueva tab "Códigos de Barra"

**Posición:** después de "Datos Web"  
```
Cantidades | Atributos | Datos Web | Códigos de Barra
```

**Nuevo componente:** `src/components/orders/BarcodeTab.tsx`

#### Layout

```
┌─ Códigos de Barra ──────────────────────────────────────────┐
│                                      [⚡ Auto generar códigos]│
│                                                              │
│  ROJO                                                        │
│  ├─ S      [1234567890123          ] [✕]                     │
│  ├─ M      [________________________] [✕]                    │
│  └─ L      [9876543210987          ] [✕]                     │
│                                                              │
│  AZUL ELÉCTRICO                                              │
│  ├─ S      [________________________] [✕]                    │
│  └─ M      [________________________] [✕]                    │
└──────────────────────────────────────────────────────────────┘
```

#### Decisiones de diseño (Mantine dark + amber primary)

- **Agrupado por color**: section header `text-xs uppercase tracking-widest text-dimmed`
- **Inputs monospace**: `--font-mono` (DM Mono) — códigos son datos técnicos
- **Inputs rellenos**: `border-amber-500/40`; vacíos: `border-white/10`
- **Botón `✕` por fila**: limpia el campo, `opacity-0 group-hover:opacity-100`, solo cuando hay contenido
- **`overflow-x-auto`** en contenedor para respetar layout en viewports angostos
- **Touch targets ≥44px** (labels + inputs)
- **Cursor pointer** en todos los elementos interactivos
- **Transiciones** 150–300ms en hover/focus states

#### Lógica de "Auto generar códigos"

1. Si `article.referencia === ""` → ejecutar `generateReferencia()` y setear referencia primero
2. Para cada `row × size`:
   - Si `row.barcodes[size.name]` está vacío → setear con `generateBarcode(referencia, row.color.name, size.name)`
   - Si ya tiene valor → **no sobreescribir**
3. Botón amber primario, estado loading con spinner durante operación

---

## Odoo Sync

**Cuándo:** al confirmar la orden (flujo existente en `src/lib/odooOrderCreation.ts`)

**Dónde:** dentro del loop de procesamiento de artículo, **después de `mapVariantToColorSize`** (~línea 295), antes de construir `allOrderLines`.

```typescript
// Escribir barcodes en product.product (mismo bloque que resolución de variantes)
for (const row of article.rows) {
  for (const size of article.sizes) {
    const barcode = row.barcodes?.[size.name];
    if (!barcode) continue;

    const resolvedColor = resolvedColors.find(c => c.name === row.color?.name);
    const resolvedSize  = resolvedSizes.find(s => s.name === size.name);
    if (!resolvedSize) continue;

    const key = resolvedColor
      ? `${resolvedColor.id}:${resolvedSize.id}`
      : `:${resolvedSize.id}`;
    const variantId = variantMap.get(key);
    if (!variantId) continue;

    await odoo.write("product.product", [variantId], { barcode });
  }
}
```

**Cobertura:**
- ✅ Artículo nuevo → variantes recién creadas por Odoo → barcodes escritos
- ✅ Artículo existente (update) → variantes ya existían → barcodes actualizados
- ✅ Rollback existente cubre si algo falla después

**Edge cases:**
- Barcode vacío → skip (no se escribe a Odoo)
- Variante no encontrada en `variantMap` → skip (log warning)
- Error de Odoo (ej: barcode duplicado) → se captura y agrega a `errorDetail`

---

## Archivos a crear/modificar

| Archivo | Operación | Detalle |
|---------|-----------|---------|
| `src/types/index.ts` | Modificar | Agregar `barcodes` a `ArticleRow` |
| `src/lib/barcodes.ts` | Crear | Utilidades puras: `generateReferencia`, `colorAbbr`, `generateBarcode` |
| `src/components/orders/BarcodeTab.tsx` | Crear | Componente tab completo |
| `src/components/orders/ArticleRow.tsx` | Modificar | Botón auto-referencia + nueva tab |
| `src/lib/odooOrderCreation.ts` | Modificar | Barcode write loop post-`mapVariantToColorSize` |
