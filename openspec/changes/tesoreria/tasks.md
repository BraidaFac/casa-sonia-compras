# Tasks

## 1. Verificación técnica contra Odoo de prueba

- [ ] 1.1 Conseguir una base de prueba de Odoo (copia de producción) y su API key en `.env.local`; verificar con un `searchRead` de `account.journal` que responde la base de prueba y no producción
- [ ] 1.2 Probar por API línea de extracto + cambio de la cuenta de contrapartida a una cuenta de gasto; verificar en Odoo que la línea queda conciliada con esa cuenta
- [ ] 1.3 Probar por API pago en efectivo + línea de extracto + conciliación explícita; verificar estado "Pagado"
- [ ] 1.4 Probar por API cobro con cheque nuevo de tercero, pago con cheque existente de cartera y pago con cheque propio (`l10n_latam.check`); verificar diario actual del cheque, `issue_state = handed` del propio y su `outstanding_line_id` (uno por cheque si el pago tiene varios)
- [ ] 1.5 Probar débito de cheque propio (línea de extracto conciliada con `outstanding_line_id` del cheque, `issue_state = debited`) y factura de compra A con IVA pagada; anotar el formato del número y los tipos de documento disponibles
- [ ] 1.6 Probar la reversión de cada registro anterior (desconciliar, borrar línea, cancelar pago, cancelar factura/asiento); verificar que el cheque vuelve a cartera
- [ ] 1.7 Registrar los hallazgos en `design.md` (D3) y ajustar la mecánica si alguna prueba falló; verificar que D3 refleja lo probado

## 2. Rol TESORERO y permisos

- [x] 2.1 Agregar `TESORERO` al enum `Role` y generar la migración (`pnpm db:migrate`, `pnpm db:generate`); verificar la columna en MariaDB
- [ ] 2.2 Agregar el rol a los tipos y etiquetas (`src/lib/auth.ts`, `src/lib/withAuth.ts`, `src/hooks/useCurrentEmployee.ts`, `src/app/(app)/empleados/page.tsx`, `EmployeeModal.tsx`); verificar que se puede asignar "Tesorero" a un empleado
- [x] 2.3 Bloques de `TESORERO`, `MANAGER` y `EMPLEADO` en `src/proxy.ts` y redirección de `/` en `src/app/page.tsx`; verificar a mano cada escenario de `specs/roles-permisos`
- [ ] 2.4 Ítem "Tesorería" en `Sidebar.tsx` (ADMIN y TESORERO; TESORERO solo ese ítem); verificar el menú con cada rol
- [x] 2.5 Actualizar la matriz de permisos y la leyenda de `docs/arquitectura.md` con la columna TESORERO y las rutas de Tesorería; verificar que coincide con proxy y withAuth

## 3. Modelo y configuración

- [x] 3.1 Modelos Prisma `TesoreriaOperacion`, `TesoreriaPaso`, `TesoreriaEvento`, `TesoreriaDiario`, `TesoreriaCuenta`, `TesoreriaConfig` (design D1) con migración; verificar en `pnpm db:studio`
- [x] 3.2 `src/lib/odooTesoreria.ts` con lecturas de catálogos (diarios ARS, cuentas, contactos, bancos, cartera, cheques propios no debitados) y llamadas con timeout; verificar con `pnpm build`
- [x] 3.3 API `GET/PUT /api/tesoreria/config` (GET ADMIN+TESORERO, PUT solo ADMIN) con precarga de cuentas usadas en los diarios habilitados; verificar 403 de TESORERO en PUT
- [ ] 3.4 Pestaña "Tesorería" en `/configuracion` (solo ADMIN, después de Promociones bancarias): diarios habilitados y orden, listas Gasto/Ingreso/Socios, cuentas y diarios fijos; verificar los escenarios de `specs/tesoreria-configuracion`

## 4. Vista General (lectura)

- [x] 4.1 API `GET /api/tesoreria/movimientos?periodo=&fecha=` que arma filas desde Odoo + DB (design D4), incluidas externas, pendientes de débito y TOTAL; verificar contra Odoo que el TOTAL del día coincide con la suma de líneas de cada diario
- [ ] 4.2 Hook `useTesoreriaMovimientos` y claves en `queryKeys.ts`; página `/tesoreria` con fecha, período día/mes/año, matriz por diario, estados y colores; verificar con un día real de la base de prueba
- [ ] 4.3 Mes/año con fila por cuenta y desglose; verificar que la suma del desglose iguala la fila de la cuenta
- [ ] 4.4 Banner de Odoo no disponible (borradores visibles, Confirmar deshabilitado) y layout de celular con scroll horizontal y columna fija; verificar cortando la URL de Odoo y en viewport de 375 px

## 5. Motor de ejecución

- [x] 5.1 API de operaciones: crear/editar/borrar borrador, `GET` con pasos y eventos; verificar que guardar un borrador incompleto no llama a Odoo
- [ ] 5.2 Motor de pasos (design D2): transición atómica a PROCESANDO, persistencia antes/después de cada llamada, referencia `TES-{id}-{n}`, búsqueda por referencia al reintentar, BORRADOR / REQUIERE_ATENCION según el paso fallido; verificar doble clic en Confirmar (una sola ejecución) y un corte simulado en el paso 2
- [ ] 5.3 Revalidación previa (contacto, diarios, cuentas, cheques, números) y advertencia de posible duplicado con evento de aceptación; verificar ambos escenarios de la spec
- [ ] 5.4 Reanudar y Anular (fase ANULACION en orden inverso, chequeo de dependencias de cheques); verificar anular y reanudar una anulación fallida
- [ ] 5.5 Progreso en el cliente (consulta del detalle mientras el POST está abierto) y detalle desplegado en la grilla con pasos, auditoría y acciones; verificar con una operación de varios pasos

## 6. Alta en la grilla y operaciones

- [ ] 6.1 Combo "Nueva operación", fila editable, validaciones comunes (fecha, importes, observación, contacto) y diálogo centrado (Cancelar descarta); verificar los escenarios comunes de `specs/tesoreria-operaciones`
- [ ] 6.2 Selector de contacto con alta rápida (CUIT con dígito verificador, CUIT existente); verificar con un CUIT válido, uno inválido y uno existente
- [ ] 6.3 Gasto e Ingreso sin factura (varios diarios, varias cuentas por diario); verificar en Odoo una línea por diario + cuenta y una sola fila en la grilla
- [ ] 6.4 Movimiento entre diarios y Retiro/Depósito de socios; verificar puente en 0 y línea contra la cuenta del socio
- [ ] 6.5 Pago y Cobro con efectivo/banco/billetera multi-medio; verificar un pago de Odoo por medio, conciliado
- [ ] 6.6 Cheques: alta de cheque de tercero (Cobro), selector de cartera (Pago) y emisión de cheque propio (próximo número, repetido bloqueado); verificar cartera y "Pendiente de débito"
- [ ] 6.7 Pago de cheques propios; verificar los dos escenarios de la spec
- [ ] 6.8 Gasto con factura fiscal (A/B/C, IVA por línea, duplicado bloqueado); verificar factura publicada y pagada
- [ ] 6.10 Cheques propios por cheque y no por pago: débito (`conciliar_pago` contra `outstanding_line_id`), lista para debitar (`chequesPropiosPendientes` con `issue_state = handed`, sin filtrar el estado del pago) y paréntesis de la Vista General (`leerPartes`); verificar con PICBC/2026/00015 (pago Pagado, tres cheques Entregados) que aparece en la lista y en los paréntesis, y los escenarios "Pago con varios cheques, se debita uno" y "Varios cheques, uno debitado"
- [ ] 6.11 Gasto con cheque propio: `diarios[].cheques`, menú ⋯ "Cheque propio…" en columnas de banco, validación (cheques ≤ total de la columna, contacto obligatorio, número repetido), efecto pendiente, pasos (asiento en el diario de ajustes, pagos `own_checks` + `manual`, conciliación en la cuenta del contacto), revalidación del diario de ajustes; verificar los escenarios de "Gasto con cheque propio"
- [ ] 6.9 Cambio de cheque recibo y entrego con diferencia calculada y ajuste; verificar los ejemplos de Manelo ($100.000 / $90.000), a la par ($400.000) y Valentín Braida ($542.840 / $500.000) con la cuenta del contacto en 0

## 8. Adjuntos

- [ ] 8.1 Modelo `TesoreriaAdjunto` y migración; API de alta, baja (borrador) y listado/descarga desde Odoo
- [ ] 8.2 Paso `adjunto` en el motor (sube a Odoo, no duplica al reintentar, borra la copia local) y alta directa en operaciones completadas
- [ ] 8.3 UI: clip por celda de medio y en la factura, cámara en celular, lista y apertura en el detalle; verificar el escenario de transferencia de la spec

## 9. Imputación a facturas

- [ ] 9.1 Lectura de facturas pendientes en `src/lib/odooTesoreria.ts` y `GET /api/tesoreria/facturas-pendientes` (design D6); verificar que solo trae facturas del contacto, publicadas y con saldo
- [ ] 9.2 `Datos.imputaciones` (PAGO, COBRO), validación y revalidación (factura del contacto, publicada, con saldo); verificar el escenario "Factura pagada antes de confirmar"
- [ ] 9.3 Generalizar `conciliar_factura` (`pasoFactura` o `facturas`) y generarlo al final de Pago/Cobro con imputaciones; verificar en la base de prueba los escenarios pago menor y mayor al saldo
- [ ] 9.4 UI: botón "Imputar facturas" en Detalle, `DialogoImputacion` (también en celular), limpiar al cambiar el contacto; verificar los escenarios "Sin contacto" y "Cambio de contacto"
- [ ] 9.5 Anular un Pago imputado; verificar que la factura recupera su saldo y no se cancela
- [ ] 9.7 Importe de la factura editable: `factura.lineas`, `repartoFactura` (pagos hasta el total, excedente por línea contra su cuenta), validación, diálogo con líneas editables y total coloreado; verificar los escenarios de "Importe de la factura"
- [ ] 9.8 Factura A con tipo de comprobante de Odoo en el diario con comprobantes; B/C en el diario sin comprobantes con el número en referencia; segundo diario de compras en la configuración (migración); verificar los escenarios de "Comprobante y diario de la factura"
- [ ] 9.9 UI de la factura: menú ⋯ en Cuenta / detalle, factura en la cabecera con color, cuenta por defecto en líneas nuevas, adjunto desde el diálogo; borradores retomados desde el concepto o la marca "Borrador"; verificar los escenarios de "Factura en la fila y en la cabecera", "Adjuntos por medio de pago" y "Borradores en la grilla"
- [ ] 9.6 Memo del pago con los números de factura (Pago/Cobro imputados y Gasto con factura), línea de extracto sin prefijo; verificar los escenarios de "Memo de pagos con factura"

## 7. Integración

- [ ] 7.1 `pnpm lint` y `pnpm build` sin errores
- [ ] 7.2 Recorrido completo con usuario TESORERO en la base de prueba: una operación de cada tipo, una anulación y un reanudar; verificar que la Vista General cuadra con Odoo
- [x] 7.3 `npx @fission-ai/openspec validate tesoreria --strict` sin errores

## Workflow follow-up

- Archivar el cambio con `/opsx:archive` cuando el cliente valide la etapa 1 (actualiza `openspec/specs/`).
- Actualizar `docs/borradores/tesoreria-decisiones.md` con el estado y mover lo aplicado a la spec viva.
