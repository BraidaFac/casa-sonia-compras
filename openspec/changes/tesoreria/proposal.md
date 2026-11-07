# Proposal

## Why

Mariano (tesorería) registra hoy los movimientos de fondos pidiéndole a Máximo que los cargue a mano en Odoo: líneas de extracto, pagos, cheques y conciliaciones en varias pantallas. Una sola operación real (un pago con cheques, un cambio de cheques) son 3 a 6 registros en Odoo que hay que hacer en orden y conciliar. La etapa 1 del módulo de Tesorería le da una pantalla única, la **Vista General**, donde ve los movimientos del día, mes o año por diario y da de alta cada operación en la misma grilla; la app crea y concilia los registros en Odoo por él. Decisiones de alcance: `docs/borradores/tesoreria-decisiones.md` (R1–R53, alcance en R52).

## What Changes

- **Rol nuevo `TESORERO`**: usa solo Tesorería (como `EMPLEADO_BASICO` con Existencias). `ADMIN` usa Tesorería y su configuración. `MANAGER`, `EMPLEADO` y `EMPLEADO_BASICO` no acceden. **BREAKING** para la regla vigente "ADMIN y MANAGER acceden a todas las secciones": `MANAGER` no accede a Tesorería.
- **Vista General** (`/tesoreria`, pantalla principal del módulo): fecha contable, combo "Nueva operación", matriz con una columna por diario habilitado y fila TOTAL. Período día (una fila por operación), mes y año (una fila por cuenta, con desglose). Muestra también lo cargado en Odoo fuera de la app, marcado. Usable en celular.
- **Alta en la grilla** de 9 operaciones, en ARS: Pago a proveedor, Cobro de cliente, Gasto (con o sin factura fiscal), Ingreso, Movimiento entre diarios, Retiro/Depósito de socios, Pago de cheques propios, Cambio de cheque (recibo) y Cambio de cheque (entrego). Lo que no entra en la celda (cheques, cheque propio, factura, varias cuentas) se carga en un diálogo centrado.
- **Factura del Gasto** con importe propio (puede quedar con saldo o dejar excedente como gasto sin factura), cargada como la carga el contador (A con tipo de comprobante de Odoo en el diario con comprobantes; B/C sin comprobante, número en referencia) y con el número en el memo del pago.
- **Imputación a facturas** en Pago y Cobro: desde la fila se eligen facturas con saldo del contacto (de compra en Pago, de venta en Cobro, notas de crédito incluidas). Odoo aplica el pago de la más vieja a la más nueva; lo que sobra queda a cuenta.
- **Ejecución contra Odoo** en el request, con pasos persistidos y progreso visible; si falla queda "Requiere atención" con **Reanudar**. **Anular** revierte en Odoo en orden inverso. Una operación confirmada no se edita.
- **Borradores** sin vencimiento, **advertencia de posible duplicado**, **alta rápida de contacto**, **auditoría básica** por operación y banner de **Odoo no disponible**.
- **Configuración de Tesorería** (solo `ADMIN`): diarios habilitados y su orden, listas de cuentas de Gasto, Ingreso y Socios, y cuentas fijas (ganancia y pérdida del cambio de cheques, puente, diario de ajustes y de compras).

### Roles

| Rol | Tesorería | Configuración de Tesorería |
|---|---|---|
| `TESORERO` | ✓ (solo este módulo) | — |
| `ADMIN` | ✓ | ✓ |
| `MANAGER`, `EMPLEADO`, `EMPLEADO_BASICO` | — | — |

### Modelos de Odoo

- **Lee**: `account.journal`, `account.account`, `res.partner`, `account.bank.statement.line`, `account.move.line`, `account.move` (facturas con saldo), `account.payment`, `account.payment.method.line`, `l10n_latam.check`, `res.bank`, `l10n_latam.document.type`, `l10n_ar.afip.responsibility.type`, `account.tax`.
- **Escribe**: `account.bank.statement.line` (alta y baja), `account.payment` (alta, `action_post`, `action_draft`, `action_cancel`), `l10n_latam.check` (vía el pago), `account.move` (factura de compra y asiento de ajuste del cambio de cheques: alta, `action_post`, `button_draft`, `button_cancel`), `account.move.line` (`reconcile`, `remove_move_reconcile`, cuenta de la contrapartida), `res.partner` (alta rápida).

### Fuera de alcance (etapas posteriores)

Vista Extracto, Resumen PN, Cartera y cheques propios como pantallas propias, Depósito de cheques y rechazos, USD y compra/venta de divisas, retenciones practicadas y sufridas, importe a imputar elegido por factura, pagos a cuenta previos, extractos con cierre diario, exportación, percepciones en la factura de compra, log de cambios de configuración, cajas locales como columnas.

## Capabilities

### New Capabilities
- `tesoreria-vista-general`: pantalla principal de Tesorería: período, matriz por diario, filas de operaciones propias y externas, totales, borradores en la grilla, detalle desplegado, banner de Odoo no disponible.
- `tesoreria-operaciones`: alta, validación y ejecución en Odoo de las 9 operaciones de etapa 1; borradores, duplicados, alta rápida de contacto, Reanudar, Anular y auditoría.
- `tesoreria-configuracion`: configuración del módulo por `ADMIN` (diarios habilitados y orden, listas de cuentas, cuentas y diarios fijos).

### Modified Capabilities
- `roles-permisos`: rol `TESORERO` y acceso a Tesorería; `MANAGER` deja de acceder a "todas las secciones".

## Impact

- **Prisma**: enum `Role` + `TESORERO` (migración); modelos nuevos de operación, pasos, eventos y configuración de tesorería.
- **Permisos**: `src/proxy.ts`, `withAuth` en las rutas `/api/tesoreria/**`, `src/components/layout/Sidebar.tsx`, `src/app/page.tsx`, tipos de rol (`src/lib/auth.ts`, `src/lib/withAuth.ts`, `src/hooks/useCurrentEmployee.ts`), selector de rol en Empleados, matriz de `docs/arquitectura.md`.
- **Código nuevo**: `src/app/(app)/tesoreria/`, `src/app/api/tesoreria/`, `src/components/tesoreria/`, `src/lib/odooTesoreria*.ts`, hooks `useTesoreria*`.
- **Odoo**: la app pasa a **escribir contabilidad** en Odoo. Requiere una base de prueba de Odoo para desarrollar y las verificaciones técnicas listadas en `design.md`.
