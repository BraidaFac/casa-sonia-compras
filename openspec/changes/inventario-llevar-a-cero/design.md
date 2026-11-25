# Design

## Context

Ver proposal.md (Why). Hoy la opción vive solo en el estado del modal `ResumenModal` (`useState(true)`) y viaja en el body de `POST /api/inventario/[id]/confirm`. Si el body no la trae, el servidor asume `true`. No se guarda en ningún lado. El resumen ya calcula el delta de cada variante no contada (`-qtyOnHand` si la opción está activa), así que el impacto se puede obtener en el cliente sin pedir datos nuevos. Las categorías se muestran por nombre local ("Remeras MC"), que se repite en dos ramas del árbol (Hombres y Mujer).

## Goals / Non-Goals

**Goals:**
- Una sola fuente de verdad por conteo: la columna en `inventories`.
- Que el servidor sea seguro por defecto: si falta el dato, no se lleva nada a cero.

**Non-Goals:**
- Recalcular o validar el impacto en el servidor antes de confirmar (el cliente ya lo tiene en el resumen).
- Cambiar cómo se aplica en Odoo.

## Decisions

1. **Columna `zeroUncounted Boolean?` (`zero_uncounted`) en `Inventory`.** Guarda la elección del borrador y, tras confirmar, el valor usado. `null` solo aparece en conteos anteriores a la migración: en un confirmado no se muestra nada y en un borrador se interpreta como apagado. Alternativa descartada: guardarlo dentro de `confirmationSummary` (JSON). No sirve para el borrador y es más difícil de consultar.
2. **Default del servidor = `false`.** El `?? true` del confirm pasa a ser `?? false`. El alta usa `false` si no viene el dato.
3. **El confirm persiste el valor antes de tocar Odoo.** Al inicio del try se hace `update` de `zeroUncounted` con el valor recibido. Así queda registrado aunque la confirmación falle, y el `update` final de `CONFIRMADO` no necesita repetirlo. Alternativa descartada: guardarlo solo al confirmar con éxito, porque se perdería la elección hecha en el Resumen si falla.
4. **Control visible = Mantine `Switch` tamaño `md` dentro de un bloque destacado** (borde y fondo de aviso con tokens `--cs-*`, título "Llevar a cero no contados" y una línea que explica que pone en 0 todo producto de cada categoría con algo contado que no esté en este conteo). Va en el cuerpo del modal, no en el header. Se reutiliza el mismo componente en el alta y en el Resumen. Se crea un componente chico `LlevarACeroSwitch` en `src/components/inventario/`. Antes de crearlo hay que revisar `src/components/ui`.
5. **Impacto en el Resumen calculado en el cliente.** Con la opción activa, se suma por categoría incluida la cantidad de variantes no contadas con `qtyOnHand > 0` y sus unidades. Se muestra en el bloque del switch como lista "ruta completa: N variantes / U unidades".
6. **Ruta completa y tabs por nivel 1.** `buildConfirmationSummary` (y por lo tanto `summary-data`) agrega `categoryCompleteName` leyendo `complete_name` de `product.category` para los ids involucrados, en un solo `search_read`. El Resumen parte esa ruta por " / ": nivel 1 (p. ej. "Hombres"), nivel 2 ("Remeras") y hoja ("Remeras MC"). Con más de un nivel 1 se muestran tabs "Todas (N)" + una por nivel 1 con su cantidad; la lista es plana y cada hoja lleva el nivel 2 como prefijo ("Remeras › Remeras MC"). Una ruta de más de 3 niveles junta los intermedios en el prefijo. Se descartó el árbol con títulos sueltos por nivel: se leía mal. Las tabs solo filtran la vista; las categorías ocultas conservan su check. La hoja sigue siendo la unidad que se marca, excluye y confirma. Los snapshots confirmados viejos no tienen `categoryCompleteName`: al abrirlos, el endpoint del resumen lo completa leyendo `complete_name` en vivo por `categoryId`. Esto muestra la ruta actual de la categoría y no la que tenía al confirmar, lo que alcanza para leerlo. Si la lectura falla, se usa `"{padre} / {nombre}"`.
7. **Mostrar el valor usado** en el Resumen de un conteo `CONFIRMADO` (badge "No contados llevados a 0" / "No contados sin tocar"; nada si no hay dato) y en el encabezado del detalle `/inventario/[id]` cuando está confirmado.

8. **Advertencias en el cliente, en un `Modal` propio.** Se calculan con el mismo `diff` por variante que ya usa el Resumen, sobre las categorías incluidas:
   - **Por categoría:** se advierte si `|Σ diff| > 10`, que es el mismo criterio del ícono actual.
   - **Por variante:** se advierte si `qtyOnHand > 0` y `|diff| / qtyOnHand > 0.10`. Entran las contadas y, si la opción está activa, las no contadas con stock, que quedan en -100%.

   Al pulsar Confirmar el orden es: diálogo de advertencias (si hay) → diálogo de categorías sin confirmar (si hay) → `executeConfirm`. "Volver" cierra el diálogo sin tocar nada. Se descartó validar en el servidor porque las advertencias no bloquean y el cliente ya tiene todos los datos.

## Risks / Trade-offs

- [Con "Llevar a cero" activo, la lista del 10% puede tener cientos de variantes] → se agrupa por categoría, se muestran hasta 50 variantes y después "y N más".

- [Cambio de default sorprende a quien confía en el comportamiento actual] → el bloque explicativo lo hace explícito, y el valor elegido queda visible y guardado.
- [`complete_name` suma una llamada a Odoo en el resumen] → es una sola lectura por ids, despreciable frente a la carga del resumen.
- [Conflicto con la rama `feature/clientes`, que reescribe estos modales con tokens nuevos] → se implementa en `main` con el mínimo de cambios visuales. Al integrar `feature/clientes` hay que portar el bloque al nuevo estilo.

## Migration Plan

- `pnpm db:migrate` agrega la columna nullable, sin backfill: los conteos previos quedan en `null` (no se muestra el badge).
- Deploy normal. Rollback: revertir el código. La columna nullable no molesta.
