# Design

## Context

`DialogoChequesEmitidos` (`src/components/tesoreria/DialogosCheques.tsx`) recibe `diarioId` y `hoy` (fecha contable) y trae los cheques con `useTesoreriaChequesPropios`, que ya devuelve número, contacto, fecha de pago e importe, ordenados por fecha de pago (máx. 500). `DialogoCartera`, en el mismo archivo, ya tiene filtros de fecha con `FechaInput` y un `Select` filtrable sobre datos en el cliente. La única impresión existente (`src/lib/htmlPromociones.ts`) genera un HTML completo con `@media print` y botón `window.print()`.

## Goals / Non-Goals

**Goals:** filtros y totales calculados en el cliente sobre los datos ya cargados; impresión sin dependencias nuevas.

**Non-Goals:** cambios en la API, paginación, o compartir el generador de impresión con Promociones.

## Decisions

- **Filtrado en el cliente** con `useMemo`, igual que `DialogoCartera`. Los datos ya están completos y acotados a un banco; ir al servidor no aporta nada.
- **Proveedor con `Select` searchable + clearable**, opciones = contactos únicos de `data`. Alternativa descartada: `TextInput` libre (permite typos, no muestra qué hay).
- **Totales en una función pura** `totalesCheques(cs, hoy)` en `src/lib/tesoreria.ts` → `{ total, cantidad, vencidos, porVencer }`. La usan el diálogo y la impresión, así ambos muestran lo mismo.
- **Sin subtotal por día**: se probó y se descartó a pedido del usuario, en el diálogo y en la impresión.
- **Impresión**: `src/lib/htmlChequesPropios.ts` arma un HTML autocontenido con el mismo diseño que los PDF de órdenes (`src/lib/pdf.ts`): bloque negro "CS", título en mayúsculas, línea ámbar, encabezado de tabla ámbar, filas alternadas, filas de total y pie "Generado el … — Casa Sonia"; Noto Sans de Google Fonts; imprime al cargar la fuente. El diálogo lo abre con `Blob` + `URL.createObjectURL` + `window.open`, dentro del clic (no lo bloquea el navegador). Texto de Odoo (proveedor) escapado. Alternativa descartada: `@media print` sobre el modal de Mantine — el portal, el overlay y el scroll del modal hacen frágil ocultar el resto de la app.
- **Nombre del banco** para el encabezado: `FilaEditor` lo pasa como prop `bancoNombre` desde `cat.diarios`.

## Risks / Trade-offs

- [Popup bloqueado] → se abre en el handler del clic; si `window.open` devuelve `null`, se muestra un aviso en el diálogo.
- [Más de 500 cheques pendientes en un banco] → límite ya existente de la consulta; fuera de alcance.
