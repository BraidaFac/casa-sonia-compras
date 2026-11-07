# Tasks

## 1. Lectura de Odoo

- [x] 1.1 Probar contra Odoo (solo lectura) `formatted_read_group` de `account.move.line` agrupado por `journal_id` con `balance:sum` y anotar en `design.md` el formato de la clave del grupo; verificar que cada suma coincide con `search_read` del mismo dominio
- [ ] 1.2 Generalizar la suma del Extracto a `sumaBalancePorDiario` (design D1) y hacer que el Extracto la use; verificar que el saldo inicial del Extracto no cambia para un diario y período reales
- [ ] 1.3 `src/lib/tesoreriaResumen.ts`: saldos por diario (D1) y Cheques Propios (D2); verificar con un mes real que el Saldo al final de cada diario coincide con el saldo de su cuenta en Odoo y que Cheques Propios al final de hoy coincide con la suma de los cheques propios "Entregados" en Odoo (incluidos los de pagos ya "Pagados", como PICBC/2026/00015)
- [ ] 1.4 `GET /api/tesoreria/resumen` (`withAuth` `ADMIN`, `TESORERO`), validación y respuesta sin Odoo; hook `useTesoreriaResumen` con `keepPreviousData` y clave en `queryKeys.ts`; verificar 400 con parámetros inválidos, 403 con `MANAGER` y `odooDisponible: false` cortando la URL de Odoo

## 2. Pantalla

- [ ] 2.1 Pestaña "Resumen PN" en `PestanasTesoreria`; verificar el escenario "Pasar al resumen"
- [ ] 2.2 `src/app/(app)/tesoreria/resumen/page.tsx`: tabla Saldo al inicio · Movimientos · Saldo al final con filas de diarios, Cheques Propios y Total, colores, spinner en el lugar de la tabla y banner de Odoo; verificar los escenarios de "Filas por diario", "Saldos de cada diario", "Fila Cheques Propios", "Fila Total" y "Colores"
- [ ] 2.3 Clic en un diario abre su Extracto con el mismo período; verificar el escenario "Ir al extracto"
- [ ] 2.4 Layout de celular (scroll horizontal, nombre fijo); verificar en viewport de 375 px
- [x] 2.5 Agregar `/tesoreria/resumen` a la matriz de permisos de `docs/arquitectura.md`; verificar que tiene los mismos roles que `/tesoreria`

## 3. Integración

- [ ] 3.1 Typecheck, `pnpm build` y eslint de los archivos tocados sin errores
- [ ] 3.2 Recorrido con usuario `TESORERO`: día, mes y año; verificar que el Total del Resumen coincide con la suma de los saldos finales de los Extractos de cada diario más Cheques Propios

## Workflow follow-up

- Archivar `tesoreria` y `tesoreria-vista-extracto` antes que este cambio.
- Archivar con `/opsx:archive` cuando esté implementado y revisado.
