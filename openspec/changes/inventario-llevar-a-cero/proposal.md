# Proposal

## Why

El 20/11 se confirmó el conteo #175 (ropa de mujer) con "Llevar a cero no contados" activo —valor por defecto— y tres remeras de hombre cargadas por error. Eso arrastró la categoría entera "Hombres / Remeras / Remeras MC" y puso en 0 156 variantes (199 unidades) que había contado el #164. El switch es chico, viene prendido, su alcance (toda la categoría de cualquier artículo cargado) no se explica, y después de confirmar no queda registro de con qué valor se confirmó.

## What Changes

- "Llevar a cero no contados" pasa a estar **apagado por defecto**. **BREAKING** de comportamiento: quien confirme sin tocarlo ya no pone en 0 los no contados.
- Se elige en el **alta** ("Nuevo inventario") con un control visible y una explicación de qué hace; se guarda en el borrador.
- En el **Resumen** al confirmar se muestra el mismo control, grande y con texto explicativo, precargado con el valor del borrador y modificable. Cuando está activo, el Resumen informa cuántas variantes con stock se van a llevar a 0 y en qué categorías (con la ruta completa, p. ej. "Hombres / Remeras / Remeras MC").
- El Resumen (borrador y confirmado) agrupa las categorías en un **árbol de 3 niveles** según su ruta en Odoo (p. ej. "Hombres › Remeras › Remeras MC" vs "Mujer › Parte Superior › Remeras MC"), para ver de un vistazo si se mezclan ramas.
- **Advertencias no bloqueantes antes de confirmar**: diálogo con las categorías con diferencia neta mayor a 10 unidades y las variantes con diferencia mayor al 10% de su stock en Odoo; se puede volver o "Confirmar igual".
- El valor efectivamente usado al confirmar se **persiste** en el conteo y se muestra en el detalle/Resumen del conteo confirmado. Los conteos confirmados antes de este cambio muestran "Sin registro".
- Roles: sin cambios (crear: `ADMIN`, `MANAGER`, `EMPLEADO`; confirmar: `ADMIN`, `MANAGER`).
- Odoo: sin cambios en lo que se lee/escribe (`stock.location`, `stock.quant`, `product.product`, `action_apply_inventory`).

Fuera de alcance:
- Recuperar el stock afectado por el #175 (se trata aparte).
- Validar `action_apply_inventory` cuando devuelve un wizard, referencia/fecha contable en Odoo.
- Mostrar el valor en el listado de conteos.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `inventario`: cambian "Crear un conteo" (se elige llevar a cero), "Resumen previo a confirmar" (control visible + impacto + valor guardado + árbol de 3 niveles) y "Confirmar el conteo en Odoo" (apagado por defecto, se persiste el valor); se agrega "Advertencias antes de confirmar".

## Impact

- `prisma/schema.prisma`: columna nueva `zeroUncounted Boolean?` en `Inventory` + migración (null = conteos previos).
- `src/app/api/inventario/route.ts` (POST alta), `src/app/api/inventario/[id]/route.ts` (PUT borrador), `src/app/api/inventario/[id]/confirm/route.ts`.
- `src/components/inventario/NuevoInventarioModal.tsx`, `src/components/inventario/ResumenModal.tsx`, `src/types/index.ts`.
- `docs/` no cambia la matriz de permisos.
- La rama `feature/clientes` (stash) reescribe `ResumenModal` y `NuevoInventarioModal`: habrá conflicto al integrarla.
