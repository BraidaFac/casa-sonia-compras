# Proposal

## Why

En la operación **Pago de cheques propios**, el diálogo "Cheques propios a debitar" muestra solo la lista de cheques entregados y no debitados del banco, sin filtros y con el total de los elegidos. Para controlar lo que se va a debitar (cuánto vence hoy, cuánto por día, cuánto por proveedor) y llevarlo en papel hay que ir a Odoo o armarlo a mano.

## What Changes

- **Filtros** en el diálogo: proveedor (contacto del cheque) y fecha de pago desde / hasta. El banco sigue fijo desde la fila.
- **Totales** del listado filtrado: total general, vencidos (fecha de pago hasta la fecha contable) y por vencer. Se mantiene el total de los elegidos.
- **Botón Imprimir**: imprime el listado filtrado (banco, filtros aplicados, cheques y totales). No imprime los cheques en sí.
- Los filtros solo cambian lo que se ve: los cheques elegidos que quedan ocultos por un filtro siguen elegidos.

### Roles

Los mismos que Tesorería: `TESORERO` y `ADMIN`. No hay ruta ni ítem de menú nuevos.

### Modelos de Odoo

- **Lee**: `l10n_latam.check` (la misma consulta que hoy, sin cambios).
- **Escribe**: nada.

### Fuera de alcance

- Listar cheques de varios bancos o cambiar el banco desde el diálogo.
- Filtro por importe o por número.
- Exportar a Excel o PDF (el navegador permite "Guardar como PDF" al imprimir).
- Imprimir cheques físicos o formularios del banco.
- Cambios en la API o en la consulta a Odoo.

## Capabilities

### New Capabilities
- `tesoreria-cheques-propios-listado`: listado de cheques propios a debitar dentro del Pago de cheques propios: filtros por proveedor y fecha de pago, totales (filtrado, vencidos / por vencer, elegidos) e impresión del listado.

### Modified Capabilities
<!-- Ninguna: la capacidad tesoreria-operaciones todavía vive en el cambio `tesoreria` (sin archivar); el agregado se especifica acá. -->

## Impact

- **Depende del cambio `tesoreria`** (etapa 1, sin archivar): requirement "Pago de cheques propios".
- Código: `src/components/tesoreria/DialogosCheques.tsx` (`DialogoChequesEmitidos`) y un generador de HTML de impresión nuevo en `src/lib/` siguiendo el patrón de `src/lib/htmlPromociones.ts`. `FilaEditor.tsx` pasa el nombre del banco al diálogo para el encabezado impreso.
- Sin cambios de API, schema de Prisma, permisos ni Odoo.
