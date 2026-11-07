# Design

## Context

- Motivación y alcance: `proposal.md`. Decisiones de negocio: `docs/borradores/tesoreria-decisiones.md` (las posteriores anulan a las anteriores; alcance en R52). Relevamiento de Odoo: `docs/borradores/tesoreria-fase0-odoo.md`. Boceto de la Vista General: `docs/borradores/tesoreria-boceto/`.
- Odoo 19 Enterprise con localización ADHOC (`l10n_latam_check`, `l10n_ar`). Sin grupo de pagos: un `account.payment` = un diario = un método. Sin extractos (`account.bank.statement`): se usan líneas de extracto sueltas. Sin fechas de bloqueo.
- `src/lib/odoo.ts` ya expone `create`, `write`, `unlink`, `call`, `searchRead`; no tiene timeout. Hasta hoy la app escribe órdenes de compra y productos, nunca contabilidad.
- Permisos en tres capas (`src/proxy.ts`, `withAuth`, `Sidebar.tsx`). `proxy.ts` ya tiene el patrón de allowlist por prefijo para `EMPLEADO_BASICO`.
- No hay modelo de configuración clave-valor reutilizable.

## Goals / Non-Goals

**Goals:**
- Un motor único de ejecución por pasos (saga) que sirva a las 9 operaciones, con persistencia, reanudación y anulación.
- La Vista General se arma leyendo Odoo, no la DB: la DB solo agrega el vínculo a la operación de la app, su estado y los borradores.
- Cada operación se define como datos (lista de pasos derivada del borrador) + un ejecutor por tipo de paso.

**Non-Goals:**
- Cola o worker en segundo plano (R12): la ejecución vive en el request.
- Caché de movimientos: se leen frescos al entrar y después de cada operación.
- Compatibilidad USD, retenciones o extractos con cierre (etapas posteriores).

## Decisions

### D1. Modelo de datos (Prisma)

| Modelo | Campos clave |
|---|---|
| `TesoreriaOperacion` | `id`, `tipo` (enum de las 9), `estado` (`BORRADOR`, `PROCESANDO`, `COMPLETADA`, `PENDIENTE_DEBITO`, `REQUIERE_ATENCION`, `ANULANDO`, `ANULADA`), `fechaContable`, `contactoId`/`contactoNombre` (Odoo), `observacion`, `total`, `datos` (JSON con medios, cheques, líneas, factura; en Gasto, cada diario puede llevar `cheques?: ChequePropio[]`), `error`, `creadoPorId`, `confirmadoPorId/En`, `anuladoPorId/En`, `creadoEn`, `actualizadoEn` |
| `TesoreriaPaso` | `operacionId`, `fase` (`EJECUCION` / `ANULACION`), `orden`, `tipo`, `payload` JSON, `estado` (`PENDIENTE`, `EN_CURSO`, `OK`, `ERROR`), `odooModelo`, `odooId`, `referencia` (`TES-{id}-{orden}`), `error`, `errorTecnico`, `intentos`, `iniciadoEn`, `finalizadoEn` |
| `TesoreriaEvento` | `operacionId`, `tipo` (creada, confirmada, duplicado aceptado, reanudada, anulada…), `empleadoId`, `detalle`, `creadoEn` — auditoría (R44) |
| `TesoreriaDiario` | `odooJournalId`, `nombre`, `tipo` (efectivo/banco/cheques), `orden`, `activo` |
| `TesoreriaCuenta` | `odooAccountId`, `codigo`, `nombre`, `uso` (`GASTO`, `INGRESO`, `SOCIO`) |
| `TesoreriaConfig` | fila única: cuentas de ganancia, pérdida y puente; diario de ajustes, de compras y de efectivo por defecto |

`datos` como JSON: el detalle varía por tipo y solo lo lee la propia operación; normalizar 9 formas en tablas no aporta consultas. Validación por tipo en el servidor con funciones propias (el proyecto no usa zod; no se agrega dependencia).

Alternativa descartada: guardar los movimientos en la DB y sincronizar con Odoo. Duplica la fuente de verdad y no muestra lo cargado fuera de la app (R35).

### D2. Saga en el request

- `POST /api/tesoreria/operaciones/[id]/confirmar`: transición atómica `BORRADOR → PROCESANDO` con `updateMany where estado = BORRADOR` (si actualiza 0 filas, otro request ya la tomó → idempotencia del doble clic). Luego revalida (R23), genera los pasos y los ejecuta en orden.
- Cada paso: `EN_CURSO` + guardado → llamada a Odoo → `OK` con `odooId` o `ERROR`. Antes de crear, si el paso tiene `intentos > 0`, busca en Odoo por `referencia` (R25) para no duplicar.
- Progreso visible: mientras el POST está abierto, el cliente consulta `GET /api/tesoreria/operaciones/[id]` cada ~1 s y pinta los pasos. Sin SSE ni websockets: alcanza para 3 a 10 pasos.
- Falla en el paso 1 sin `odooId` → vuelve a `BORRADOR` con `error`. Falla posterior → `REQUIERE_ATENCION`. Reanudar = mismo motor desde el primer paso no `OK`.
- Timeout por llamada (AbortSignal, ~30 s) en una variante de `request` para tesorería; un timeout se trata como respuesta ambigua (buscar por referencia al reanudar).
- `maxDuration` de la ruta ajustado para operaciones largas (20 cheques).

Alternativa descartada: worker/cola. R12 lo excluye y la app no tiene infraestructura para eso.

### D3. Registros en Odoo por operación

| Operación | Pasos (fase EJECUCION) |
|---|---|
| Gasto / Ingreso sin factura | por cada diario + cuenta: crear `account.bank.statement.line` (importe con signo, `payment_ref`, contacto) → reemplazar la cuenta de la contrapartida de suspenso por la cuenta elegida (queda conciliada) |
| Gasto con factura | crear `account.move` `in_invoice` (tipo de documento, número, `factura.lineas` con cuenta, neto e IVA) → `action_post` → reparto (`repartoFactura`): las líneas del gasto cubren el total de la factura en orden de columna; por cada diario con parte cubierta: `account.payment` saliente → `action_post` → línea de extracto + conciliar con el pago; por cada línea con excedente: línea de extracto contra su cuenta (como Gasto sin factura) → conciliar pagos con factura (si hay pagos). Factura mayor que lo pagado: queda con saldo |
| Gasto con cheque propio | por columna de banco con cheques: lo que la columna no paga de la factura (sin factura: toda la columna) → asiento `entry` en el diario de ajustes (Debe cuentas de gasto / Haber proveedores del contacto) → `action_post`; `account.payment` `own_checks` al contacto por los cheques → `action_post` (sin línea de extracto, Pendiente de débito); si queda resto: `account.payment` `manual` → `action_post` → línea de extracto + conciliar → conciliar las líneas del contacto (factura, asiento y pagos). La anulación ya cubre el asiento (`cancelar_asiento`) y el bloqueo por cheques debitados (`bloqueoAnulacion`) |
| Pago / Cobro (efectivo, banco, billetera) | por medio: `account.payment` (`outbound`/`inbound`, `supplier`/`customer`) → `action_post` → línea de extracto en el diario → conciliar la línea con el pendiente del pago. Si hay imputaciones, al final de todos los medios (cheques incluidos): `conciliar_factura` con las facturas elegidas y los pagos de la operación |
| Pago con cheque de tercero | `account.payment` en Cheques de Terceros, método "Cheque de Terceros Existente", cheques en `l10n_latam_move_check_ids` → `action_post` → línea de extracto en Cheques de Terceros → conciliar |
| Cobro con cheque de tercero | `account.payment` en Cheques de Terceros, método "Nuevo cheque de Terceros", cheques nuevos en `l10n_latam_new_check_ids` → `action_post` → línea de extracto → conciliar |
| Pago con cheque propio | `account.payment` en el banco, método "Cheques Propios", cheques nuevos → `action_post`. Sin línea de extracto: cada cheque queda `handed` (Pendiente de débito). Con varios cheques, `l10n_latam_check` separa el pendiente en un asiento con una línea por cheque (cuenta 1.4.6) y la guarda en `l10n_latam.check.outstanding_line_id`; el pago puede figurar `paid` con los cheques todavía `handed`. Con un cheque, `outstanding_line_id` es la línea del pago |
| Pago de cheques propios | por cheque: línea de extracto en el banco → conciliar con `outstanding_line_id` del cheque → `issue_state` pasa a `debited` |
| Movimiento | línea en origen (−) contra puente → línea en destino (+) contra puente |
| Socios | línea de extracto contra la cuenta del socio |
| Cambio (recibo) | Cobro con cheques nuevos (como arriba) → Pago al contacto por el efectivo real (como arriba) → si diferencia ≠ 0: asiento `entry` en el diario de ajustes, cuenta del contacto contra ganancia/pérdida → `action_post` → conciliar las líneas de la cuenta del contacto |
| Cambio (entrego) | Pago con cheques de cartera → Cobro del contacto por el efectivo real → ajuste análogo contra pérdida/ganancia → conciliar |

**Imputación:** `conciliar_factura` acepta `pasoFactura` (Gasto, factura creada en la operación) o `facturas: number[]` (Pago/Cobro, facturas existentes). En ambos casos junta las líneas a pagar/cobrar sin conciliar y llama a `reconcile`; Odoo aplica de la más vieja a la más nueva y el sobrante queda abierto en la cuenta del contacto (a cuenta). La revalidación previa vuelve a leer las facturas: siguen del contacto, publicadas y con saldo.

**Memo:** el paso `pago` lleva `memo` aparte de `etiqueta`: con facturas, `prefijoFacturas(números) + " - " + etiqueta`; la línea de extracto (`conciliar_pago`) usa solo `etiqueta`. En Gasto el número se arma como `FA-{letra} {número normalizado}` (nombre que Odoo da a los tipos 1 / 6 / 11).

En los cambios, los dos pagos usan el mismo `partner_type` (customer en recibo, supplier en entrego) para que todo pase por una sola cuenta del contacto y el ajuste la deje en 0 (A2, R7/R53).

**Anulación** (fase ANULACION, orden inverso a los pasos OK): `remove_move_reconcile` / desconciliar → `unlink` de líneas de extracto → `action_draft` + `action_cancel` de pagos (los cheques vuelven a cartera o se anulan los propios) → `button_draft` + `button_cancel` de factura y asiento de ajuste. El `action_draft` del pago desconcilia solo; las facturas imputadas no las creó la app y no se cancelan, recuperan su saldo. Antes de anular se verifica que los cheques recibidos sigan en cartera y que los cheques propios no tengan débito (spec: Anular).

### D4. Lectura de la Vista General

- Fuente: `account.move.line` de las cuentas de liquidez de los diarios habilitados en el período (cubre líneas de extracto y pagos), más los cheques propios `issue_state = handed` de esos diarios (para los paréntesis, uno por cheque, atribuidos a la operación por la referencia de su pago). Se agrupan por `ref`/`payment_ref` con prefijo `TES-{id}`: lo que matchea con una operación de la DB es una fila de la app; lo que no, fila "Cargado en Odoo" (una por asiento).
- Mes/año: agrupación por cuenta de contrapartida (cuenta elegida en Gasto/Ingreso/Socios, puente en Movimiento, cuenta del contacto en Pago/Cobro/Cambio y en el pendiente de un Gasto con cheque propio); desglose = filas de operación.
- Borradores y operaciones no completadas salen de la DB.
- `formatted_read_group` para mes/año si la paginación de `searchRead` resulta lenta.

### D5. Permisos

- `proxy.ts`: bloque `TESORERO` con allowlist `["/tesoreria", "/api/tesoreria", "/api/auth/"]` → redirect `/tesoreria`; `TESORERO` no llega a `/configuracion`. `/tesoreria` y `/api/tesoreria` bloqueados para `MANAGER` y `EMPLEADO` (`EMPLEADO_BASICO` ya queda afuera por su allowlist).
- `withAuth({ roles: ["ADMIN", "TESORERO"] })` en todo `/api/tesoreria/**`; escritura de configuración `["ADMIN"]`.
- `Sidebar.tsx`: ítem "Tesorería" para `ADMIN` y `TESORERO`; `TESORERO` ve solo ese ítem.

### D6. UI

- `src/app/(app)/tesoreria/page.tsx` (Vista General). La configuración es la pestaña "Tesorería" de `src/app/(app)/configuracion/page.tsx` (solo `ADMIN`), con el formulario en `src/components/tesoreria/ConfigTesoreria.tsx`; el botón de la Vista General abre `/configuracion?tab=tesoreria`.
- Fechas con el `DateInput` de la app (`src/components/ui/DateInput.tsx`), envuelto en `FechaInput` para trabajar con `YYYY-MM-DD`.
- Componentes en `src/components/tesoreria/`: matriz, fila editable por tipo, diálogos (`Modal` de Mantine centrado, `fullScreen` en celular) para cheques, cheque propio, factura y varias cuentas.
- Factura del Gasto: menú ⋯ en Cuenta / detalle (`FilaEditor`), con encabezado (tipo, número, total); la cabecera de `PanelOperacion` muestra la factura con el total coloreado por `colorReparto` (el mismo del diálogo). `DialogoFactura` recibe la cuenta elegida en la fila (líneas nuevas), los tipos de comprobante del catálogo y el clip de adjuntos de la ranura null.
- Borradores en la grilla: se retoman con clic en el concepto o en la marca "Borrador"; sin botón aparte.
- Imputación: botón en la columna Detalle de Pago/Cobro (deshabilitado sin contacto) → `DialogoImputacion`. `useTesoreriaFacturasPendientes(contactoId, tipo)` con `enabled` solo con el diálogo abierto; `GET /api/tesoreria/facturas-pendientes?contactoId=&tipo=` con dominio `commercial_partner_id` = contacto, `move_type` in (`in_invoice`, `in_refund`) o (`out_invoice`, `out_refund`), `state = posted`, `payment_state` in (`not_paid`, `partial`), `amount_residual > 0`, orden `invoice_date_due`. Cambiar el contacto limpia `datos.imputaciones`.
- Hooks: `useTesoreriaMovimientos`, `useTesoreriaOperacion(es)`, `useTesoreriaConfig`, `useTesoreriaCatalogos` (diarios, cuentas, bancos, cartera); claves en `queryKeys.ts`.
- El boceto define la interacción; no se copia su código.

### D7. Seguro de escritura y mecánica relevada

- `src/lib/odooTesoreria.ts` rechaza todo método que no sea de lectura salvo `TESORERIA_ODOO_ESCRITURA=1`. Hasta completar la verificación (sección 1 de `tasks.md`) queda en `0`: confirmar una operación vuelve a borrador con el aviso, sin tocar Odoo.
- Relevado en producción (solo lectura): una línea de extracto puede ir directo contra una cuenta (así se cargan hoy los retiros de socios). La app crea la línea con `counterpart_account_id`; para pagos, la contrapartida es la cuenta de pagos/cobros pendientes del método (1.4.6 / 1.2.4) y se concilia contra la línea del pago con `account.move.line.reconcile`.
- Referencias: líneas de extracto y asientos llevan `TES-{id}-{paso}` en `ref`; pagos y factura en `payment_reference`.
- Factura A: la línea de cuenta es el neto gravado; lo que sale del diario es neto + IVA. Diarios relevados en producción: "Purchases" (CMP-A) usa comprobantes y tiene las A; "Compras B" (CMP-B) no usa comprobantes y tiene B/C con el número en `ref`. La A lleva `l10n_latam_document_type_id` (lista de Odoo: tipos de letra A usados en compras, con su `doc_code_prefix`); su nombre es `{prefijo} {número}` y el duplicado se busca por `name` (`l10n_latam_document_number` no es buscable). B/C: diario sin comprobantes, `ref` = número, duplicado por `ref` + proveedor + diario; impuestos de compra por nombre ("IVA 21% Compras", "IVA 10.5%", "IVA 27%", "IVA Exen"; B y C con "IVA No Corresp").
- Cambio de cheques: el ajuste se calcula al ejecutar con el saldo real de la cuenta del contacto después de los dos pagos (deudor → pérdida, acreedor → ganancia) y se concilian las tres líneas.

### D8. Adjuntos (R55)

- **Ranura** = medio de pago: el diario de la celda (`diarioId`) o la factura (`diarioId` null).
- **Borrador:** tabla `TesoreriaAdjunto` (operación, diarioId?, nombre, mimetype, contenido `LongBlob`, creadoPor). Las celdas de una operación nueva guardan los archivos en memoria y se suben al guardar el borrador.
- **Confirmar:** por cada adjunto, un paso `adjunto` al final con los pasos destino de su ranura (los `pago` de ese diario; si no hay, las `linea` / `conciliar_pago`; la `factura` para null). El ejecutor crea `ir.attachment` (`res_model` `account.payment` o `account.move`, el asiento de la línea de extracto) con `description` = referencia del paso para no duplicar al reintentar, y al terminar borra la fila local.
- **Lectura:** el detalle lista `ir.attachment` de los registros de la operación (fuente de verdad) más los pendientes locales; descarga por la app verificando que el adjunto pertenezca a un registro de esa operación.
- **Después de completada:** sube directo a Odoo a los registros de la ranura.
- Límite 10 MB por archivo, PDF e imágenes.

## Risks / Trade-offs

- [Mecánica de Odoo no verificada por API: alta/entrega de cheques, cambio de cuenta de la contrapartida de una línea de extracto, conciliación explícita, reversión] → tareas de verificación (sección 1 de `tasks.md`) contra una base de prueba antes de escribir los ejecutores; si un mecanismo falla se ajusta D3, no la spec.
- [No hay base de prueba de Odoo] → bloqueante para desarrollar los ejecutores; la UI, el modelo y los permisos avanzan sin ella. Nunca probar escrituras contra producción.
- [Separación por cheque relevada solo en pagos cargados a mano en Odoo (8 pagos, relevado 2026-10-29)] → verificar en la primera escritura que un pago con varios cheques creado por la app también queda con `outstanding_line_id` por cheque; si no, la app crea el asiento de separación.
- [Request largo cortado (cierre de pestaña, deploy)] → los pasos persistidos permiten Reanudar; el paso en `EN_CURSO` se trata como ambiguo y se busca por referencia.
- [Operación en `PROCESANDO` huérfana si el proceso muere] → al leerla, si `actualizadoEn` tiene más de N minutos en `PROCESANDO`, se muestra como "Requiere atención".
- [Lectura de la vista anual con muchas líneas (~3.000 / 90 días en todas las cajas)] → solo diarios habilitados (sin cajas locales) y `formatted_read_group` para agregados.
- [Alguien edita en Odoo un registro creado por la app] → la vista muestra lo que dice Odoo; la anulación puede fallar y queda "Requiere atención".

## Migration Plan

1. Migración Prisma: `TESORERO` en el enum `Role` + tablas nuevas. Aditiva, sin datos que migrar.
2. Deploy con el módulo visible solo para `ADMIN` hasta cargar la configuración (diarios, cuentas, cuentas fijas).
3. Asignar el rol `TESORERO` al usuario de Mariano.
4. Rollback: ocultar el ítem del menú; las tablas nuevas no afectan a otros módulos. Lo escrito en Odoo se anula desde la app o en Odoo.

## Open Questions

- C1: qué cuentas usa el contador para ganancia y pérdida del cambio de cheques. Se cargan en la configuración; no cambia el diseño.
- Formato exacto del número de factura de compra (en la reunión: "00812345678") y tipos de comprobante habilitados: se confirma en la verificación técnica contra `l10n_latam.document.type`.
- Observación obligatoria en Cambio de cheques: tomada del boceto y de la spec v2 (R16 solo nombra Gasto e Ingreso). Confirmar con Mariano; cambiarlo es una regla de validación.
