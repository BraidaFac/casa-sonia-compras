# Tesorería — registro de revisión

Revisión punto por punto de [`tesoreria-odoo-v2.md`](tesoreria-odoo-v2.md) contra el código y contra Odoo ([`tesoreria-fase0-odoo.md`](tesoreria-fase0-odoo.md)). Lo que no figura acá como decidido **no** se da por bueno.

## Decidido

| # | Decisión | Fecha |
|---|---|---|
| R1 | Se entrega **por etapas**, como una única funcionalidad (un solo cambio de OpenSpec) | 2026-10-26 |
| R2 | Rol nuevo **`TESORERO`**: Mariano solo usa Tesorería (como `EMPLEADO_BASICO` con Existencias) | 2026-10-26 |
| R3 | Los roles **Revisor y Supervisor** los inventó la spec; se descartan. Solo consta en R1 que Jan revisa los pendientes de conciliación (una vista, no un rol) | 2026-10-26 |
| R4 | **Retenciones fuera de la 1ª etapa**: Odoo no tiene retenciones configuradas ni grupo de pagos | 2026-10-26 |
| R5 | **USD y Compra/Venta de divisas fuera de la 1ª etapa**: no hay cotizaciones cargadas y hay un solo diario USD | 2026-10-26 |
| R6 | **Extractos diarios con cierre en etapa posterior**: hoy no se usan extractos en Odoo | 2026-10-26 |
| R7 | **Cambio de cheques por la cuenta corriente del contacto (esquema A2)**: cobro al contacto con los cheques por su total + pago al contacto por el efectivo **real** + ajuste de la diferencia en la cuenta del contacto contra Resultados financieros. El contacto queda en 0 y su cuenta muestra cheques, pago y descuento; la caja muestra una sola línea por el efectivo real. Se descarta la cuenta puente 1.2.7 / 2.1.3 (solo la usó una prueba del 21/04). Reemplaza la secuencia de §10.8/§10.9 (A1) | 2026-10-26 |
| R8 | El cambio de cheques admite **diferencia 0** (cambio a la par): el cambio real de Manelo del 21/10 ($400.000 en cheques por $400.000 en efectivo) fue así | 2026-10-26 |
| R10 | **Etapa 1** (solo ARS, sin retenciones, sin cierre diario): operaciones **Gasto e Ingreso sin factura**, **Pago a proveedor y Cobro de cliente sin retenciones**; vistas **Vista General** y **Vista Extracto**. Quedan para etapas posteriores: Movimiento entre diarios, Socios, Cambio de cheques, Pago de cheques propios, Factura de compra, Depósito y rechazos, Resumen PN, Cartera y cheques propios, USD, retenciones, cierre diario | 2026-10-26 |
| R11 | Pago y Cobro de etapa 1: **multi-método** (una operación = un pago de Odoo por método); métodos **efectivo / transferencia / billetera**, **cheque de tercero** (alta en Cobro, selección de cartera en Pago) y **cheque propio** (emisión en Pago; queda "En proceso" hasta el débito, que se registra en Odoo hasta que entre "Pago de cheques propios"); **imputación a facturas y notas de crédito abiertas**, total o parcial, o a cuenta sin selección | 2026-10-26 |
| R12 | **Ejecución en el request con pasos persistidos**: el usuario ve el progreso; cada paso se guarda en la DB antes y después de llamar a Odoo; si falla queda "Requiere atención" con acción Reanudar. Sin cola ni worker en segundo plano | 2026-10-26 |
| R13 | **Fecha contable**: hoy (hora de Argentina) por defecto, editable; prohibidas las futuras; sin límite ni aviso hacia atrás | 2026-10-26 |
| R14 | **Importes siempre positivos**; el sentido lo define la operación (confirma D7) | 2026-10-26 |
| R15 | **Sin adjuntos en etapa 1** | 2026-10-26 |
| R16 | **Observación** obligatoria en Gasto e Ingreso, opcional en Pago y Cobro (D16). Si queda vacía se genera la etiqueta automática (`Pago {proveedor}` / `Cobro {cliente}` + ` — Fc {números}` si imputa). Sin mínimo ni máximo propios | 2026-10-26 |
| R17 | **Contacto** obligatorio en Pago y Cobro, opcional en Gasto e Ingreso. Entra el **alta rápida** de contactos desde la app (campos y validaciones a definir) | 2026-10-26 |
| R18 | **"Encargado por" obligatorio**, elegido entre los empleados activos de la app | 2026-10-26 |
| R19 | **Cuentas de Gasto e Ingreso por lista blanca configurable** (solo ADMIN), una lista para Gasto y otra para Ingreso, precargada con las cuentas usadas en diarios de tesorería | 2026-10-26 |
| R20 | **Diarios habilitados configurables por ADMIN** en la configuración de Tesorería (qué diarios de Odoo se ofrecen como método en Gasto, Ingreso, Pago y Cobro) | 2026-10-26 |
| R21 | **Anulación entra en etapa 1**, la pueden hacer TESORERO y ADMIN, sin ventana de tiempo. No se edita una operación completada: se anula (revierte en Odoo en orden inverso) y se carga de nuevo | 2026-10-26 |
| R22 | **Borradores sin vencimiento**: se guardan hasta confirmarlos o borrarlos a mano (se descarta el "7 días" de la spec) | 2026-10-26 |
| R23 | **Sin reservas** de cheques ni facturas: se revalida contra Odoo justo antes de ejecutar; si algo cambió, se avisa y no se ejecuta (se descartan los "15 min" de la spec) | 2026-10-26 |
| R24 | Única advertencia de etapa 1: **posible duplicado** (mismo contacto + importe + día + tipo) con link a la operación existente. Sin advertencia de saldo insuficiente | 2026-10-26 |
| R25 | Decisiones técnicas: **conciliación explícita** por ID (no depender del auto-match), **referencia `TES-{id}-{paso}`** en cada registro creado en Odoo (búsqueda ante cortes, evita duplicar al reanudar) y **nota "Registrado por / Encargado por / Op."** en el registro principal | 2026-10-26 |
| R26 | **Gasto e Ingreso** (sin factura): **varios diarios** y **varias cuentas** por operación; diario por defecto **Efectivo Administración**; líneas de cuenta sin límite, cuenta repetible, importe > 0, descripción opcional. Ingreso es espejo de Gasto con la lista de cuentas de Ingreso. **Cada diario lleva sus propias líneas de cuenta** (las asigna el usuario). Odoo no permite varias contrapartidas en una línea de extracto: **se crea una línea de extracto por cada par diario + cuenta**, todas con la misma referencia de la operación; **la app las agrupa y las muestra como un único movimiento por diario** (Vista Extracto y Vista General). En Odoo se ven separadas | 2026-10-26 |
| R27 | **Pago — métodos menores que lo imputado**: no se puede confirmar; Mariano ajusta a mano los importes imputados (sin reducción FIFO automática) | 2026-10-26 |
| R28 | **Pago — pagos a cuenta previos** del proveedor: no se ofrecen en etapa 1 (se imputan en Odoo) | 2026-10-26 |
| R29 | **Cheque propio**: físico y **e-cheq**; número de 8 dígitos en físico; se **sugiere el próximo número** del banco (último emitido + 1, editable); **número repetido bloqueado** en ese banco; fecha de pago desde la fecha contable hasta 360 días | 2026-10-26 |
| R30 | **Pago — métodos mayores que lo imputado**: al confirmar, la app pregunta qué hacer con el excedente: **dejar a cuenta del proveedor**, **registrar vuelto recibido** (se elige el diario donde entra), **imputar a otra factura** abierta o **volver y corregir** | 2026-10-26 |
| R31 | **Cobro** es espejo del Pago: si cobra menos que lo imputado no confirma (ajuste manual); si cobra de más pregunta: dejar a cuenta del cliente / registrar vuelto entregado / imputar a otra factura / volver y corregir | 2026-10-26 |
| R32 | **Alta de cheque de tercero** (físico o **e-cheq**): CUIT del librador con dígito verificador (autocompleta nombre si existe); bloquea duplicado (número + banco + CUIT en Odoo o en la misma operación); bloquea CUIT de Casa Sonia. **Sin restricción de rango de fecha de pago** | 2026-10-26 |
| R33 | **Selector de cartera** (Pago con cheque de tercero): filtros por fecha de pago, banco, librador e importe; orden por fecha de pago; total seleccionado en vivo contra lo que falta pagar. **No bloquea vencidos ni marca "próximo a vencer"** | 2026-10-26 |
| R34 | **Vista General**: en día, una fila por operación; en mes y año, una fila por cuenta **con desglose** (expandir la cuenta para ver sus operaciones) | 2026-10-26 |
| R35 | **Vistas** muestran también lo cargado en Odoo **fuera de la app**, marcado como tal, para que los saldos cuadren con Odoo. Columnas/diarios = los habilitados en configuración (R20). **Sin exportación** en etapa 1 | 2026-10-26 |
| R36 | **Vista Extracto** como §11.3: diario + período día/mes/año; Fecha · Etiqueta · Contacto · Importe · Balance · Conciliado ✓/✗; fila TOTAL; filtro "solo sin conciliar"; click abre la operación (o la línea en Odoo si es externa) | 2026-10-26 |
| R37 | Pantallas de apoyo en etapa 1: **Inicio** (menú, borradores, operaciones que requieren atención), **Historial**, **Detalle de operación** (pasos en Odoo, Anular, Reanudar) y **Configuración de Tesorería** (diarios habilitados y orden, listas blancas de cuentas) | 2026-10-26 |
| R38 | **Permisos**: TESORERO usa todo el módulo menos Configuración; **ADMIN** todo + Configuración; **MANAGER, EMPLEADO y EMPLEADO_BASICO sin acceso** | 2026-10-26 |
| R39 | **Responsive**: todo el módulo usable en celular (matrices con scroll horizontal) | 2026-10-26 |
| R40 | **Alta rápida de contacto**: nombre, **CUIT obligatorio** con dígito verificador (si ya existe en Odoo ofrece usar ese contacto), condición frente al IVA y tipo cliente / proveedor (puede ser ambos) | 2026-10-26 |
| R41 | **Odoo no disponible**: banner; se pueden guardar borradores, no confirmar ni consultar vistas | 2026-10-26 |
| R42 | **Pendientes de conciliación** (vista consolidada, R1) entra en etapa 1: todos los diarios habilitados, líneas de extracto sin conciliar y pagos en proceso (cheques propios sin debitar), con antigüedad y filtros. Destinatario: Jan (contador), que **entra con un usuario ADMIN o TESORERO** (no hay rol propio) | 2026-10-26 |
| R43 | **Retenciones sufridas** (Cobro) quedan para la etapa de retenciones, junto con las practicadas | 2026-10-26 |
| R44 | **Auditoría básica** en etapa 1: por operación, quién y cuándo la creó, confirmó o anuló, cada paso con su resultado y error, reintentos y advertencias aceptadas (duplicado); visible en el Detalle. Sin log de cambios de configuración | 2026-10-26 |
| R45 | **Se amplía la etapa 1** (revisión por pantalla en curso): además de Pago, Cobro, Gasto e Ingreso entran **Movimiento entre diarios, Retiro/Depósito de socios, Pago de cheques propios y Cambio de cheques (recibo y entrego)**. Reemplaza la parte de operaciones de R10 | 2026-10-26 |
| R46 | **Vista General es la pantalla principal** del módulo: fecha contable y menú "Nueva operación" arriba, matriz de movimientos abajo; desde ahí se da de alta. **Una operación confirmada en Odoo no se edita** (solo los borradores) | 2026-10-26 |
| R47 | **Sin imputación a facturas** en Pago y Cobro: D5 solo figura en la spec (fuente "RC", documento que no tenemos) y en las reuniones los pagos y cobros se mostraron sin facturas. Pago y Cobro = contacto, uno o varios medios, importe, observación. Anula la parte de imputación de R11, R27, R28, R30, R31 y V10 | 2026-10-26 |
| R48 | **Gasto con factura fiscal entra en etapa 1**: casilla "¿Lleva factura fiscal?" (planilla \*6, reunión 22/10); la app crea la factura de compra en Odoo con la cuenta elegida y la paga en el acto. Reemplaza lo que estaba en standby / etapa 2 | 2026-10-26 |
| R49 | **Alta en la grilla**: combo "Nueva operación" (no botones); al elegir, aparece una fila editable arriba de la matriz; importes positivos en la columna de cada diario (R14); lo que no entra en la celda (cheques, cheque propio, factura fiscal, varias cuentas) se carga en un **popover sobre la celda**. Sin paneles laterales ni modales. El detalle de una operación se despliega dentro de la grilla | 2026-10-26 |
| R50 | **Sin "Encargado por"**: se quita el campo de la operación (anula R18 y V3). En Odoo queda solo la nota "Registrado por" con el usuario de la app | 2026-10-27 |
| R51 | Los datos que no entran en la celda se cargan en un **diálogo centrado** (fondo oscurecido, Cancelar / Aceptar; pantalla completa en celular). Cancelar descarta lo cambiado en el diálogo. Reemplaza el popover de R49 | 2026-10-27 |
| R52 | **Etapa 1 = Vista General y sus flujos**: la pantalla (día / mes / año, matriz por diario, TOTAL), el alta en la grilla de las 9 operaciones (Pago, Cobro, Gasto con o sin factura fiscal, Ingreso, Movimiento entre diarios, Retiro/Depósito de socios, Pago de cheques propios, Cambio de cheque recibo y entrego), borradores, detalle desplegado, Anular y Reanudar. Más lo mínimo para que funcione: rol TESORERO y configuración (diarios habilitados y orden, listas de cuentas de Gasto e Ingreso, cuentas de ganancia y pérdida del cambio de cheques). **Pasan a etapa 2**: Vista Extracto, Pendientes de conciliación, Historial. Reemplaza R10, R37 y R42 en lo que se contradigan | 2026-10-27 |
| R53 | Cambio de cheques: **se confirma A2** (R7) y la **ganancia o interés se calcula automáticamente** = total de cheques − efectivo; solo lectura; diferencia 0 no genera registro. Cierra V8 | 2026-10-27 |
| R9 | La **cuenta de ganancia** y la **cuenta de pérdida** del cambio de cheques son **configuración de la app** (Tesorería, solo ADMIN). Odoo no tiene ninguna cuenta definida para esto | 2026-10-26 |

## Abierto con el cliente

| # | Pregunta | Para | Contexto |
|---|---|---|---|
| C1 | ¿Qué cuentas usar para la ganancia y la pérdida del cambio de cheques? | Contador | Candidatas: ganancia 4.2.1 Resultados Financieros o 4.2.3 Intereses ganados; pérdida 5.6.3 Intereses Pagados. 4.2.1 es de tipo ingreso |
| C2 | Las cuentas 1.2.7 y 2.1.3 las creó Máximo el 21/04 para una prueba (1.2.7 tiene solo los 4 asientos de prueba por $105; 2.1.3 no tiene movimientos). La app no las va a usar: ¿las archiva? ¿Revierte los asientos de prueba, que siguen publicados en Efectivo Administración y Cheques de Terceros? | Máximo | No las referencia ningún diario ni método de pago |

## Contraste con las reuniones y la planilla (2026-10-26)

Comparado contra las notas de R1–R4 y la planilla `mvp_app_contable`. Puntos a validar con el cliente, detallados en [`tesoreria-plan.html`](tesoreria-plan.html):

| # | Tema | Fuente dice | Plan dice |
|---|---|---|---|
| V1 | Adjuntos | En todas las pantallas; obligatorio en cambio de cheques | Sin adjuntos en etapa 1 (R15) |
| V2 | Pago de cheques propios | Pedido en R1 y R4 (op. 7 de la planilla) | Etapa 2 (R10) |
| V3 | Encargado por | Usuarios de Odoo | Empleados de la app (R18) |
| V4 | Cuentas de Gasto/Ingreso | Directo del plan de cuentas, se actualiza solo | Lista blanca configurable (R19) |
| V5 | Fecha contable | Evaluar recordar la última (carga a día vencido) | Hoy por defecto (R13) |
| V6 | Importes | Negativos tipeados; la planilla delega la decisión | Siempre positivos (R14) |
| V7 | Gasto | Un medio de pago | Varios diarios (R26) |
| V8 | Cambio de cheques | Pago por el total + ingreso de la diferencia en caja contra Resultados financieros (A1) | Pago por el efectivo real + ajuste en la cuenta del contacto (A2, R7) |
| V9 | Agregados | — | Alta de contactos, duplicado, borradores, anulación, pendientes, celular |
| V10 | Imputación a facturas | No aparece en reuniones; sí en respuestas posteriores | Etapa 1 (R11) |

Además: R4 indica Resultados financieros para la ganancia y para la pérdida del cambio (insumo para C1). R2 propone una casilla "ingreso de cajas locales" contra Recibos pendientes (etapa 2).

## Supuestos del modelo a confirmar (no aplicar hasta resolver)

Plazos y números sin fuente: borrador descartado a los 7 días · reserva 15 min · confirmación si la fecha tiene > 7 días · 3 reintentos · adjuntos 10 MB / 10 archivos · observación 3–200 caracteres · umbrales 15% · próximo a vencer 5 días · alerta de depósito a 3 días hábiles · redondeo $1 · máximo 10 líneas multi-cuenta · calendario 30/60/90 · vencido a 30 días y fecha de pago hasta 360 días (coinciden con la ley de cheques).

Marcados `[DECIDIDO]` pero elegidos por el modelo: D7 (importes positivos), D12 (Socios separado), D13 (cambio inverso simétrico), D16 (etiqueta autogenerada), contenido de las operaciones 5b, 10, 11 y 12 y del ciclo de vida de cheques.

Comportamientos no pedidos: arqueo y ajuste contra Diferencias de caja · ventana de anulación y reapertura de días · advertencias de duplicado, saldo y proveedor sujeto a retención · alta rápida de contactos · referencia `TES-{id}-{n}` en Odoo · cajas locales como columnas ocultas · defaults de P7 · custodia de e-cheqs · exportar a Excel/PDF · uso en móvil con cámara · HEIC.

## Correcciones de datos de la spec

- "Kiver" es **Quiver**. "Vale USD" no existe. Los cupones son diarios ("Cupones a Liquidar …"), no cuentas.
- Socios con cuenta: solo **Retiro Maximo** (3.3.1) y **Retiro Mariano** (3.3.2).
- Mariano no tiene usuario en Odoo; hoy carga Máximo.

## Estado al 2026-10-27 (para retomar)

**Próximo paso:** armar la propuesta OpenSpec de la etapa 1 (`/opsx:propose`), un único cambio "tesoreria" con alcance R52. Leer este archivo completo antes: las decisiones posteriores anulan a las anteriores cuando lo dicen (ver R45–R53).

**Material:**
- Spec base del cliente (sin validar): [`tesoreria-odoo-v2.md`](tesoreria-odoo-v2.md).
- Relevamiento de Odoo (producción, solo lectura): [`tesoreria-fase0-odoo.md`](tesoreria-fase0-odoo.md).
- Boceto interactivo de la Vista General: https://claude.ai/artifact/GkDd4akqbwAmyBENkPAzvQ (fuente en [`tesoreria-boceto/`](tesoreria-boceto/)).
- HTML del plan para el cliente: https://claude.ai/artifact/QK4kN1PVxbJ6KhaynC5RiN ([`tesoreria-plan.html`](tesoreria-plan.html)). **Desactualizado** (todavía tiene imputación a facturas, "encargado por" y las etapas viejas); el usuario pidió no actualizarlo por ahora.
- Notas de reuniones R1–R4 y planilla `mvp_app_contable`: Google Docs/Sheet públicos que pasó el usuario (no copiados al repo).

**Abierto para la etapa 1:**
- C1: cuentas de ganancia y pérdida del cambio de cheques (contador). Son configurables en la app (R9).
- Factura fiscal en Gasto: tipos de comprobante, formato del número (en la reunión: "00812345678"), percepciones.
- Base de prueba de Odoo para desarrollar (las operaciones escriben en Odoo).
- C2: cuentas 1.2.7 / 2.1.3 y asientos de prueba (Máximo; no bloquea).
- Dato a tener en cuenta: en Odoo hoy hay pagos con cheque propio cuya descripción lista facturas (Textil Federal, 24/09): la imputación existe fuera de la app aunque R47 la saca del módulo.

## Pendiente para la etapa 1

- Verificaciones técnicas antes de implementar (prueba contra Odoo): alta y entrega de cheques (`l10n_latam.check`) por API; pago + imputación a facturas + conciliación explícita por API; reversión de cada paso para Anular.

## Etapas posteriores (no revisadas)

Movimiento entre diarios, Socios, Cambio de cheques (R7–R9 ya decididos), Pago de cheques propios, Factura de compra, Depósito y rechazos, Resumen PN, Cartera y cheques propios, USD y divisas, retenciones, extractos con cierre diario, adjuntos, exportación.
