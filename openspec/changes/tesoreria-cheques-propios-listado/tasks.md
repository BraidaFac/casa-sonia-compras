# Tasks

## 1. Totales

- [x] 1.1 Agregar `totalesCheques(cs, hoy)` en `src/lib/tesoreria.ts` (total, cantidad, vencidos con fecha ≤ hoy, por vencer) y verificar con un script `assert` los casos del spec (350.000 / 150.000 / 200.000)

## 2. Diálogo

- [ ] 2.1 En `DialogoChequesEmitidos` agregar filtros proveedor (`Select` searchable/clearable) y fecha desde/hasta (`FechaInput`), filtrando en el cliente; la selección no se toca. Verificar en `pnpm dev` que un elegido oculto por filtro sigue en la operación al aceptar
- [ ] 2.2 Mostrar total filtrado con cantidad, vencidos, por vencer y total elegidos usando `totalesCheques`. Verificar en `pnpm dev` que se recalculan al filtrar y el de elegidos no

## 3. Impresión

- [x] 3.1 Crear `src/lib/htmlChequesPropios.ts` que arma el HTML (banco, fecha contable, filtros, tabla, totales, texto escapado, diseño de los PDF de órdenes, impresión automática) y verificar que el proveedor con `<` o `&` se imprime literal
- [ ] 3.2 Botón Imprimir en el diálogo (deshabilitado sin cheques visibles) que abre el HTML con Blob URL; aviso si el popup es bloqueado. Pasar `bancoNombre` desde `FilaEditor.tsx`. Verificar en `pnpm dev` que se abre la impresión con el listado filtrado
- [x] 3.3 Correr `pnpm lint` y `pnpm build` sin errores

## Workflow follow-up

- Archivar con `/opsx:archive` cuando el cambio `tesoreria` esté archivado o junto con él.
