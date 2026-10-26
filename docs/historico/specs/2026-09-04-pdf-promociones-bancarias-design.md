# PDF de Promociones Bancarias — Design Doc

**Fecha:** 2026-09-04  
**Estado:** Pendiente de implementación

---

## Objetivo

Agregar un botón "Generar PDF" a la pantalla `/promociones-vigentes` que descargue un PDF A4 vertical con todas las promociones bancarias vigentes a la fecha de generación, listo para imprimir y pegar en el local.

---

## Fase 0 — Hallazgos del reconocimiento

### Modelo de datos

`PromocionBancaria` ya tiene todo lo necesario — no requiere migración:

| Campo | Tipo | Uso en PDF |
|-------|------|-----------|
| `titulo` | String | Título de la promo |
| `bancos` | Banco[] (many-to-many) | Logo + nombre del banco |
| `marcaTarjeta` | String? | Medio de pago / variante |
| `tipoBeneficio` | String | Determina badge y formato |
| `cantidadCuotas` | Int? | Para tipos cuotas_* |
| `valorPorcentaje` | Decimal? | Para reintegro/descuento |
| `topeReintegro` | Decimal? | Opcional — se omite si null |
| `coeficienteInteres` | Decimal? | Para cuotas_con_interes |
| `descripcion` | String? | Texto libre, 1 línea truncada |
| `diasAplicables` | JSON string \| null | null = todos los días |
| `vigenciaDesde` | DateTime | Ya existe — filtrado server-side |
| `vigenciaHasta` | DateTime? | Ya existe — filtrado server-side |
| `activa` | Boolean | Ya existe — filtrado server-side |

### Assets disponibles

| Banco | Asset |
|-------|-------|
| galicia, macro, bbva, itau, naranjax, supervielle, ciudad, comafi | SVG path inline en `bankIcons.ts` → `drawSvgPath()` |
| santander, provincia, nacion, credicoop, mercadopago | Archivo SVG en `/public/icons/banks/` → extraer `d=""` con regex |
| santafe, bica | Archivo PNG en `/public/icons/banks/` → `pdfDoc.embedPng()` |
| Logo empresa | `public/CS.png` → `pdfDoc.embedPng()` |

Todos los bancos configurados tienen asset disponible. La estrategia de fallback (placeholder vs. exclusión) se define durante desarrollo al probar con cada banco.

### Librería PDF

`pdf-lib` + `@pdf-lib/fontkit` ya instalados y usados en `src/lib/pdf.ts`. Sin dependencias nuevas.

### Lógica de vigencia reutilizable

`/api/config/vigentes/route.ts` ya tiene:
- `getTodayBuenosAires()` — fecha actual en zona AR (America/Argentina/Buenos_Aires)
- `isPromoVigenteHoy(promo, todayStr, dayName)` — filtra por activa + fechas + día de semana
- `PROMO_SELECT` — campos necesarios para la query

Estas funciones se extraen a un helper compartido para evitar duplicación.

---

## Arquitectura

### Piezas nuevas

```
src/app/(app)/promociones-vigentes/page.tsx   [MODIFICAR — agregar botón]
src/app/api/pdf-promociones/route.ts           [NUEVO — endpoint GET]
src/lib/pdfPromociones.ts                      [NUEVO — generación del PDF]
src/lib/vigentesHelpers.ts                     [NUEVO — extraer helpers compartidos]
```

### Flujo completo

```
Usuario click "Generar PDF"
  → setLoading(true)
  → GET /api/pdf-promociones (autenticado, cualquier rol)
    → getTodayBuenosAires()
    → query PromocionBancaria con PROMO_SELECT
    → filter isPromoVigenteHoy → promosHoy[]
    → si promosHoy.length === 0: return 400 { error: "sin_promos" }
    → generatePromosPDF(promosHoy, todayStr) → Uint8Array
    → return 200 + binary con headers:
        Content-Type: application/pdf
        Content-Disposition: attachment; filename="promos-bancarias-DD-MM-YYYY.pdf"
  → browser recibe blob
  → URL.createObjectURL → <a download>.click() → URL.revokeObjectURL
  → setLoading(false)
```

### Endpoint

```typescript
// src/app/api/pdf-promociones/route.ts
GET /api/pdf-promociones
Auth: withAuth (cualquier rol autenticado)
Response 200: application/pdf binary
Response 400: { error: "sin_promos" }
Response 500: { error: "generation_failed" } + console.error server-side
```

---

## PDF Layout

### Dimensiones

A4 vertical: 595 × 842 pts (pdf-lib units). Márgenes: 36pt todos los lados.

### Estructura vertical

```
┌─────────────────────────────────────┐
│ ████████████████████████████████████│  ← barra indigo 8pt
│                                     │
│ [CS.png]  PROMOCIONES BANCARIAS     │  ← header (~72pt)
│           Vigente: DD/MM/YYYY       │
│                                     │
├─────────────────────────────────────┤
│ ● TODOS LOS DÍAS          ──────────│  ← sección label
│ ┌───────────────────────────────┐   │
│ │ [logo]  12 cuotas sin interés │   │  ← card (~55pt)
│ │         Visa · Tope $5.000    │   │
│ └───────────────────────────────┘   │
│ ┌───────────────────────────────┐   │
│ │ ...                           │   │
│ └───────────────────────────────┘   │
│                                     │
│ ● LUNES Y MARTES          ──────────│
│ ┌───────────────────────────────┐   │
│ │ ...                           │   │
│ └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Agrupación

Promos agrupadas por `diasAplicables` (stringificado para comparación). Orden:
1. "Todos los días" (diasAplicables === null o array vacío)
2. Grupos de días específicos, ordenados por primer día del grupo (lunes primero)

### Cada card

- Alto: ~55pt
- Logo banco: box 40×40pt, izquierda
- Línea 1: beneficio principal (bold, 13pt) + badge de tipo (colored)
- Línea 2: `marcaTarjeta` (si existe) + "· Tope $X" (si topeReintegro existe)
- Línea 3: `descripcion` truncada a 1 línea si existe
- Borde izquierdo 4pt en color del badge

### Formato del beneficio por tipo

| tipoBeneficio | Texto principal | Sub |
|--------------|----------------|-----|
| cuotas_sin_interes | "N cuotas" | "sin interés" |
| cuotas_con_interes | "N cuotas" | "coef. X.XX" |
| cuotas_con_descuento | "N cuotas" | "+ X% desc." |
| cuotas_con_reintegro | "N cuotas" | "+ X% reintegro" |
| reintegro | "X%" | "reintegro" |
| descuento_directo | "X%" | "descuento" |

---

## Paleta de colores (opción D — editorial indigo)

| Elemento | Color |
|---------|-------|
| Barra top header | `#6366F1` (indigo) |
| Título principal | `#111827` bold |
| Subtítulo fecha | `#6B7280` |
| Label sección | `#6366F1` |
| Línea separadora sección | `#E0E7FF` |
| Fondo card | `#FFFFFF` |
| Texto card principal | `#111827` |
| Texto card secundario | `#6B7280` |
| Badge cuotas_sin_interes | `#059669` |
| Badge reintegro | `#2563EB` |
| Badge descuento_directo | `#7C3AED` |
| Badge cuotas_con_interes | `#D97706` |
| Badge cuotas_con_descuento | `#DB2777` |
| Badge cuotas_con_reintegro | `#0891B2` |

---

## Logos de bancos en el PDF

### Estrategia de renderizado

| Tipo de asset | Técnica |
|--------------|---------|
| `svgPath` inline (en bankIcons.ts) | `page.drawSvgPath(entry.svgPath, { x, y, scale, color })` |
| `svgSrc` PNG (santafe.png, bancobica.png) | `fs.readFileSync(path.join(process.cwd(), "public", entry.svgSrc))` → `pdfDoc.embedPng()` |
| `svgSrc` SVG file | Leer archivo, extraer primer `d=""` con regex → `drawSvgPath()` |

### Fallback (a decidir durante desarrollo)

Si el renderizado de un logo falla: se loguea el error con detalle (banco, tipo de asset, error) y se decide si usar placeholder (círculo con iniciales en color del banco) o continuar sin logo. Esta decisión se toma al probar con cada banco durante implementación.

### Logo empresa (header)

`public/CS.png` → `pdfDoc.embedPng()`. Tamaño: 40×40pt en header.

---

## Manejo de errores

### UI (cliente)

| Caso | Comportamiento |
|------|---------------|
| `promosHoy.length === 0` | Botón deshabilitado, tooltip "No hay promociones vigentes hoy" |
| Response 400 | Toast error: "No hay promociones vigentes hoy" |
| Response 5xx / network error | Toast error: "Error al generar el PDF. Intentá de nuevo." |
| Loading | Botón con spinner, texto "Generando..." |

### Server

`console.error` con: timestamp, cantidad de promos procesadas, banco/asset que causó el fallo (si aplica), stack trace.

---

## Permisos

Mismo auth que la pantalla `/promociones-vigentes`: `withAuth` sin restricción de rol adicional. Cualquier empleado autenticado puede generar el PDF.

---

## Nombre del archivo

`promos-bancarias-DD-MM-YYYY.pdf`  
Fecha = fecha de generación en timezone Buenos Aires.

Sin QR.

---

## Casos edge

1. **Sin promos vigentes** — botón deshabilitado + guard en endpoint (400).
2. **Banco con múltiples promos el mismo día** — cada promo es una card separada dentro de la misma sección de días. No se agrupan por banco; el criterio de agrupación es exclusivamente por días de vigencia.
3. **topeReintegro null** — campo omitido de la card, sin espacio vacío.
4. **marcaTarjeta null** — campo omitido.
5. **descripcion null** — línea omitida.
6. **Logo faltante** — ver sección Fallback.
7. **PDF con muchas promos** — la función de generación trackea el cursor `y` actual; cuando `y < margen + cardHeight` agrega una nueva página y resetea el cursor. El header solo aparece en la primera página.
8. **Texto largo** — nombres de banco o marcaTarjeta largos se truncan con elipsis calculada en pts.

---

## Fuentes

Reutilizar el loader de DM Sans ya implementado en `src/lib/pdf.ts`. Pesos usados: regular (400) y bold (700).

---

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `src/lib/vigentesHelpers.ts` | CREAR — extraer `getTodayBuenosAires`, `isPromoVigenteHoy`, `PROMO_SELECT` |
| `src/app/api/config/vigentes/route.ts` | MODIFICAR — importar desde vigentesHelpers |
| `src/lib/pdfPromociones.ts` | CREAR — función `generatePromosPDF` |
| `src/app/api/pdf-promociones/route.ts` | CREAR — endpoint GET |
| `src/app/(app)/promociones-vigentes/page.tsx` | MODIFICAR — agregar botón |
