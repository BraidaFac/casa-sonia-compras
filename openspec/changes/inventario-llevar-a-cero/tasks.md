# Tasks

## 1. Datos

- [x] 1.1 Agregar `zeroUncounted Boolean? @map("zero_uncounted")` a `Inventory` en `prisma/schema.prisma`, correr `pnpm db:migrate` en dev y `pnpm db:generate`. Verificar que la migración solo agrega la columna nullable.
- [x] 1.2 Agregar `zeroUncounted: boolean | null` al tipo del conteo en `src/types/index.ts`. Verificar con `npx tsc --noEmit`.

## 2. API

- [x] 2.1 `POST /api/inventario`: aceptar `zeroUncounted` (default `false`) y guardarlo. Verificar creando un conteo sin el campo: queda `false` en la base.
- [x] 2.2 `PUT /api/inventario/[id]`: aceptar `zeroUncounted` en borradores. Verificar con un PUT que cambie el valor.
- [x] 2.3 `POST /api/inventario/[id]/confirm`: default `?? false` y persistir `zeroUncounted` antes de las llamadas a Odoo. Verificar que un confirm sin el campo no lleva nada a cero y guarda `false`, y que un confirm fallido conserva el valor enviado.
- [x] 2.4 `buildConfirmationSummary`: agregar `categoryCompleteName` desde `product.category.complete_name` en una sola lectura. En el resumen de conteos confirmados con snapshot viejo, completarlo en vivo por `categoryId`, con fallback a padre/nombre si falla. Verificar en `summary-data` que "Remeras MC" sale como "Hombres / Remeras / Remeras MC" o "Mujer / Parte Superior / Remeras MC", y que el #175 lo muestra aunque su snapshot no lo tenga.

## 3. UI

- [x] 3.1 Crear `src/components/inventario/LlevarACeroSwitch.tsx`: bloque destacado con switch `md`, título y explicación del alcance, modo editable y modo solo lectura (badge "No contados llevados a 0" / "No contados sin tocar"; nada si no hay dato), solo con tokens `--cs-*` y sin `style={{}}` literal. Verificar con `pnpm lint`.
- [x] 3.2 `NuevoInventarioModal`: usar `LlevarACeroSwitch` (apagado por defecto) y mandarlo en el alta. Verificar en dev que el borrador creado refleja la elección.
- [x] 3.3 `ResumenModal`: sacar el switch chico del header, inicializar con el valor del borrador (`null` → apagado), mostrar el bloque en el cuerpo con el impacto por categoría (ruta completa, variantes y unidades con stock que pasan a 0) y mandar el valor al confirmar. Verificar en dev con un borrador que tenga categorías parcialmente contadas.
- [x] 3.4 Mostrar las categorías del Resumen con `categoryCompleteName`, con fallback "{padre} / {nombre}" para snapshots viejos. Verificar con un conteo confirmado viejo y con uno nuevo.
- [x] 3.5 Conteo `CONFIRMADO`: mostrar el valor usado en el Resumen (bloque en solo lectura) y en el encabezado de `/inventario/[id]`. Verificar con #175 (no muestra badge) y con un conteo confirmado nuevo.
- [x] 3.6 Resumen con tabs por nivel 1 ("Todas (N)" + una por rama, solo si hay más de una) y nivel 2 como prefijo de la hoja, con checkbox y totales en la hoja, para borrador y confirmado. Verificar que en el #175 aparecen las tabs "Hombres" y "Mujer" y que "Remeras › Remeras MC" queda en Hombres.
- [x] 3.7 Diálogo de advertencias no bloqueantes al confirmar: categorías con `|diff neto| > 10` y variantes con stock > 0 y `|diff| > 10%` (incluye no contadas si la opción está activa; tope de 50 y "y N más"), con los botones "Volver" y "Confirmar igual", antes del diálogo de categorías sin confirmar. Verificar en dev: un borrador con ambos casos muestra el diálogo, uno sin casos confirma directo y "Volver" no confirma.

## 4. Cierre

- [x] 4.1 Correr `pnpm lint`, `npx tsc --noEmit` y `npx @fission-ai/openspec validate inventario-llevar-a-cero --strict` sin errores.
- [ ] 4.2 Prueba de punta a punta en dev contra Odoo staging: alta con la opción apagada → confirmar → ninguna variante no contada cambia. Alta con la opción activada → el resumen muestra el impacto → aparece el diálogo de advertencias → "Confirmar igual" → las no contadas quedan en 0 y el detalle muestra "Sí".

## Verificación pendiente

Implementado y verificado con `tsc`, `eslint`, `openspec validate --strict` y un chequeo con asserts de la lógica de advertencias e impacto. Falta probar en ejecución:
- La migración `20261125000000_inventario_llevar_a_cero` no se aplicó: el `DATABASE_URL` local apunta a producción. Se aplica con `prisma migrate deploy` en el deploy, o en una base de dev.
- Las verificaciones en dev de 2.1–2.4 y 3.2–3.7 y la prueba de punta a punta 4.2 requieren una base de dev y Odoo staging.

## Workflow follow-up

- Archivar con `/opsx:archive` una vez probado y deployado.
- Al integrar `feature/clientes`, portar `LlevarACeroSwitch` y los cambios del Resumen al nuevo estilo.
