# Proposal

## Why

La planilla de Mariano tiene una hoja **Vista Resumen PN** (posición neta, P9): cuánta plata había en cada caja, banco y billetera al empezar el período, cuánto se movió y cuánto queda, descontando los cheques propios entregados que todavía no se debitaron. Con la Vista General y la Vista Extracto ve movimientos, pero no la foto de saldos de todos los diarios juntos. Es la segunda y última vista de la etapa 2 (`docs/borradores/tesoreria-decisiones.md` R56; solo pesos por R58; solo saldos por R59).

## What Changes

- **Resumen PN** (`/tesoreria/resumen`): tercera pestaña junto a Vista General y Extracto, con el mismo selector de período (día, mes, año) y la misma URL con `periodo` y `fecha`.
- **Filas**: una por diario habilitado, en el orden de la configuración; una fila **Cheques Propios** (emitidos y no debitados, en negativo); y la fila **Total** (posición neta = diarios + Cheques Propios).
- **Columnas**: **Saldo al inicio · Movimientos · Saldo al final**. Importes negativos en rojo, positivos en verde.
- **Cheques Propios**: Saldo al inicio = pendientes de débito al cierre del día anterior al período; Movimientos = emitidos menos debitados en el período; Saldo al final = pendientes al cierre del período.
- **Clic en un diario**: abre su Vista Extracto con el mismo período.
- Banner de **Odoo no disponible**, como en las otras vistas; carga con spinner en el lugar de la tabla, sin perder la estructura.

### Roles

Los mismos que Tesorería: `TESORERO` y `ADMIN`. La ruta queda bajo `/tesoreria`, ya protegida en `src/proxy.ts` y el Sidebar; no hay ítem nuevo en el menú.

### Modelos de Odoo

- **Lee**: `account.journal`, `account.move.line` (saldos de las cuentas de liquidez agrupados por diario; líneas de pagos pendientes para fechar el débito), `account.payment` (pagos con cheque propio), `account.payment.method.line`.
- **Escribe**: nada.

### Fuera de alcance

- Cierre diario, arqueo, ajuste contra Diferencias de caja y extractos de Odoo con saldo inicial y final (R59).
- Diarios en USD, totales por moneda y equivalente en pesos (R58, etapa 3).
- Saldo inicial "provisorio" por día sin cerrar (depende del cierre).
- Marca de fila que no cuadra: inicio + movimientos = final se cumple por construcción al leer los saldos de Odoo.
- Exportación.

## Capabilities

### New Capabilities
- `tesoreria-resumen-pn`: pantalla de posición neta de Tesorería: saldos al inicio y al final y movimientos del período por diario, cheques propios pendientes de débito y total.

### Modified Capabilities
<!-- Ninguna: las pestañas viven en la capacidad tesoreria-vista-extracto (cambio sin archivar); este cambio agrega la tercera pestaña en su propia spec. -->

## Impact

- **Depende de** los cambios `tesoreria` (configuración, lectura de Odoo) y `tesoreria-vista-extracto` (pestañas y navegación de período en `src/components/tesoreria/Navegacion.tsx`, suma agregada de saldos en `src/lib/tesoreriaExtracto.ts`), ambos sin archivar.
- Código nuevo: `src/lib/tesoreriaResumen.ts`, `GET /api/tesoreria/resumen` (`withAuth`, `ADMIN` y `TESORERO`), hook en `src/hooks/useTesoreria.ts` con clave en `src/lib/queryKeys.ts`, página `src/app/(app)/tesoreria/resumen/page.tsx`.
- Cambios: tercera pestaña en `Navegacion.tsx`; fila `/tesoreria/resumen` en la matriz de `docs/arquitectura.md`.
- Sin cambios de schema de Prisma ni escrituras en Odoo.
