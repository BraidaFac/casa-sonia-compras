# Tasks

## 1. Lectura de Odoo

- [x] 1.1 Probar contra Odoo (solo lectura) `formatted_read_group` de `account.move.line` con `balance:sum` para un diario y `date < desde`; verificar que el resultado coincide con la suma por `search_read` del mismo dominio; si la firma no funciona, aplicar el fallback de design D1/Riesgos y anotarlo en `design.md`
- [ ] 1.2 `src/lib/tesoreriaExtracto.ts` con `armarExtracto` (design D1: validación de diario, saldo inicial, líneas, `is_reconciled`, agrupación por operación, etiqueta, balance acumulado, aviso si se supera el límite de líneas); verificar con un día real de Efectivo Administracion que el saldo final coincide con el saldo de la cuenta en Odoo a esa fecha
- [ ] 1.3 `GET /api/tesoreria/extracto` con `withAuth` (`ADMIN`, `TESORERO`), validación de parámetros y respuesta sin Odoo (design D3); verificar 400 con diario no habilitado, 403 con `MANAGER` y `odooDisponible: false` cortando la URL de Odoo
- [x] 1.4 Hook `useTesoreriaExtracto` y clave `queryKeys.tesoreria.extracto`; invalidar `["tesoreria", "extracto"]` donde hoy se invalida `["tesoreria", "movimientos"]`; verificar que al confirmar una operación el extracto abierto se actualiza

## 2. Pantalla

- [ ] 2.1 Extraer la navegación de período de `src/app/(app)/tesoreria/page.tsx` a un componente compartido y pasar `periodo` y `fecha` a la URL; verificar que la Vista General funciona igual que antes (día, mes, año, anterior/siguiente, sin futuros) y que recargar conserva el período
- [ ] 2.2 Pestañas "Vista General / Extracto" en las dos páginas, conservando `periodo` y `fecha`; verificar el escenario "Pasar al extracto"
- [ ] 2.3 `src/app/(app)/tesoreria/extracto/page.tsx`: selector de diario (habilitados, orden de la config, el primero por defecto), fila Saldo inicial, tabla Fecha · Etiqueta · Contacto · Importe · Balance · Conciliado con colores, marca "Cargado en Odoo", aviso "Sin movimientos" y fila TOTAL; verificar los escenarios de "Columnas del extracto", "Saldo acumulado", "Estado de conciliación" y "Agrupación por operación"
- [ ] 2.4 Filtro "Solo sin conciliar" y TOTAL de filas visibles (design D2); verificar el escenario "Filtrar"
- [ ] 2.5 Clic en fila: `DialogoOperacion` para la app y asiento en Odoo en pestaña nueva para externas; verificar ambos escenarios de "Abrir el movimiento"
- [ ] 2.6 Banner de Odoo no disponible y layout de celular (scroll horizontal, Fecha fija); verificar cortando la URL de Odoo y en viewport de 375 px
- [x] 2.7 Agregar `/tesoreria/extracto` y `/api/tesoreria/extracto` a la matriz de permisos de `docs/arquitectura.md`; verificar que la fila nueva tiene los mismos roles que `/tesoreria`

## 3. Integración

- [ ] 3.1 `pnpm lint` y `pnpm build` sin errores
- [ ] 3.2 Recorrido con usuario `TESORERO`: un mes de Banco Bica con movimientos de la app y externos; verificar que el saldo final y los ✓/✗ coinciden con Odoo y que un Gasto multi-cuenta se ve en una fila

## 4. Rango de fechas

- [ ] 4.1 `src/components/ui/DateRangeInput.tsx` (design D6); verificar en escritorio 2 meses, en 375 px 1 mes, y que no permite fechas futuras
- [x] 4.2 `armarExtracto(diario, desde, hasta)` y `GET /api/tesoreria/extracto?diario=&desde=&hasta=` (design D1, D3); verificar 400 con `desde > hasta` y con `desde` futuro, y que Mes y Año en curso responden bien
- [x] 4.3 Hook y clave con `desde`/`hasta`; verificar que la invalidación tras confirmar una operación sigue andando
- [ ] 4.4 Controles del Extracto: atajos Día/Mes/Año, selector con el rango efectivo, `periodo=rango` en la URL, flechas con largo igual, título del rango en "Sin movimientos" y pestañas a `fecha=hasta`; verificar los escenarios de "Período día, mes y año", "Rango de fechas personalizado" y "Volver a la Vista General con rango", y que la Vista General y el Resumen PN no cambian

## Workflow follow-up

- Archivar el cambio `tesoreria` antes que este (este depende de su capacidad `tesoreria-vista-general`).
- Archivar con `/opsx:archive` cuando esté implementado y revisado.
