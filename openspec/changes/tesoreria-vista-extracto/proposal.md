# Proposal

## Why

La planilla de Mariano (`mvp_app_contable`) tiene una hoja **Vista Extracto**: los movimientos de un diario, uno debajo del otro, con el saldo acumulado y si cada uno está conciliado. La Vista General de la etapa 1 muestra todos los diarios juntos en una matriz y no tiene saldo ni conciliación, así que para controlar una caja o un banco contra el resumen o el arqueo hoy hay que ir a Odoo. Es la primera pantalla de la etapa 2 (`docs/borradores/tesoreria-decisiones.md` R36, R56; solo pesos por R58).

## What Changes

- **Vista Extracto** (`/tesoreria/extracto`): se elige un diario habilitado y un período (día, mes o año, con la misma navegación que la Vista General) o un rango de fechas personalizado con un selector desde–hasta (solo en esta vista).
- Columnas **Fecha · Etiqueta · Contacto · Importe · Balance · Conciliado**. Importe en rojo si es negativo y en verde si es positivo; Balance = saldo acumulado del diario, partiendo del saldo al inicio del período; Conciliado ✓ (con el color del signo) o ✗.
- **Fila de saldo inicial** arriba y **fila TOTAL** abajo (suma de importes y saldo final).
- Filtro **"Solo sin conciliar"**.
- Las líneas de una misma operación de la app en el diario se muestran como **un solo movimiento** (R26: un Gasto multi-cuenta son varias líneas en Odoo y una fila acá). Lo cargado en Odoo fuera de la app aparece una fila por línea, marcado.
- **Clic en una fila**: abre el detalle de la operación (el mismo diálogo de la Vista General); si es externa, abre el asiento en Odoo en otra pestaña.
- **Pestañas Vista General / Extracto** arriba de las dos pantallas para pasar de una a otra.
- Banner de **Odoo no disponible**, como en la Vista General.

### Roles

Los mismos que Tesorería: `TESORERO` y `ADMIN`. `MANAGER`, `EMPLEADO` y `EMPLEADO_BASICO` no acceden. La ruta nueva queda bajo el prefijo `/tesoreria` que ya protegen `src/proxy.ts` y el Sidebar; no hay ítem nuevo en el menú.

### Modelos de Odoo

- **Lee**: `account.journal`, `account.move.line` (líneas de la cuenta de liquidez del diario y saldo previo), `account.bank.statement.line` (estado de conciliación).
- **Escribe**: nada.

### Fuera de alcance

- Diarios en USD (R58, etapa 3): el selector solo ofrece diarios en pesos.
- Conciliar desde la pantalla, editar o anular desde el extracto (se anula desde el detalle de la operación, como hoy).
- Extractos de Odoo con saldo inicial/final y cierre diario (van con el Resumen PN).
- Cheques propios entregados y no debitados: no figuran hasta que se debitan (están en la Vista General entre paréntesis).
- Borradores y operaciones sin registrar en Odoo: no figuran (el extracto refleja solo lo que está en Odoo).
- Exportación.
- Pendientes de conciliación e Historial (descartadas, R56).

## Capabilities

### New Capabilities
- `tesoreria-vista-extracto`: pantalla de extracto por diario de Tesorería: selector de diario y período, líneas con saldo acumulado y conciliación, agrupado por operación, totales, filtro de no conciliados y apertura del detalle.

### Modified Capabilities
<!-- Ninguna: la capacidad tesoreria-vista-general todavía vive en el cambio `tesoreria` (sin archivar); las pestañas se especifican acá. -->

## Impact

- **Depende del cambio `tesoreria`** (etapa 1, sin archivar): reusa su configuración, la lectura de Odoo (`src/lib/odooTesoreria.ts`, `src/lib/tesoreriaVista.ts`), las referencias `TES-{id}-{paso}` y `DialogoOperacion`.
- Código nuevo: `src/lib/tesoreriaExtracto.ts`, `GET /api/tesoreria/extracto` (`withAuth`, roles `ADMIN`, `TESORERO`), hook en `src/hooks/useTesoreria.ts` con clave en `src/lib/queryKeys.ts`, página `src/app/(app)/tesoreria/extracto/page.tsx`, selector de rango `src/components/ui/DateRangeInput.tsx`.
- Cambios: pestañas en `src/app/(app)/tesoreria/page.tsx`; matriz de permisos en `docs/arquitectura.md` (ruta nueva).
- Sin cambios de schema de Prisma ni escrituras en Odoo.
