## Purpose

Pantalla principal de Tesorería: muestra los movimientos de fondos por diario en un período y es el lugar desde donde se dan de alta, revisan, reanudan y anulan las operaciones.

## ADDED Requirements

### Requirement: Pantalla principal del módulo
`/tesoreria` SHALL mostrar arriba el botón "Nueva operación", el período y los filtros, y abajo la matriz de movimientos. Es la pantalla de entrada del módulo.

#### Scenario: Entrar al módulo
- **WHEN** un `TESORERO` entra a `/tesoreria`
- **THEN** ve la Vista General del día de hoy (hora de Argentina) en período "Día"

### Requirement: Período día, mes y año
La vista SHALL tener selector de período Día / Mes / Año con navegación anterior / siguiente. No SHALL permitir navegar a períodos futuros.

#### Scenario: Cambiar a mes
- **WHEN** el usuario elige "Mes" estando en el 24/10/2026
- **THEN** la matriz muestra los movimientos de octubre de 2026

### Requirement: Columnas por diario
La matriz SHALL tener columnas Concepto, Contacto y Cuenta / detalle, seguidas de una columna por cada diario habilitado en la configuración, en el orden configurado.

#### Scenario: Diarios configurados
- **WHEN** la configuración habilita Efectivo Administracion, Banco Bica y Cheques de Terceros
- **THEN** la matriz muestra esas tres columnas de diario, en ese orden

### Requirement: Filas en período día
En período Día SHALL haber una fila por operación, con el importe neto en la columna de cada diario que afecta: positivo si entra, negativo si sale. Una operación de varias líneas en un mismo diario SHALL verse como un único importe en ese diario.

#### Scenario: Orden cronológico
- **WHEN** el día tiene una operación de la app confirmada a las 10:00, un movimiento cargado en Odoo a las 11:00 y un borrador creado a las 12:00
- **THEN** las filas aparecen mezcladas por hora, lo más nuevo arriba: el borrador, el movimiento de Odoo y la operación de la app (la app usa la hora de confirmación o, si no se confirmó, la de creación; Odoo, la de creación del registro)

#### Scenario: Cambio de cheque en una fila
- **WHEN** el día tiene un Cambio de cheque (recibo) de $100.000 en cheques por $90.000 en efectivo
- **THEN** hay una sola fila con +100.000 en Cheques de Terceros y −90.000 en Efectivo Administracion

#### Scenario: Gasto en varias cuentas
- **WHEN** un Gasto de $50.000 en Efectivo Administracion se reparte en dos cuentas
- **THEN** la fila muestra −50.000 en Efectivo Administracion

### Requirement: Filas en período mes y año
En períodos Mes y Año SHALL haber una fila por cuenta de contrapartida con la suma por diario; al expandir la cuenta se ven sus operaciones del período.

#### Scenario: Desglose de una cuenta
- **WHEN** el usuario expande la fila "5.2.7 Servicios" en período Mes
- **THEN** ve debajo las operaciones del mes imputadas a esa cuenta, cada una con sus importes por diario

### Requirement: Movimientos cargados fuera de la app
La vista SHALL incluir los movimientos de los diarios habilitados cargados directamente en Odoo, marcados como "Cargado en Odoo", para que los totales cuadren con Odoo. No SHALL ofrecer Anular ni Reanudar sobre ellos.

#### Scenario: Línea de extracto externa
- **WHEN** Máximo cargó en Odoo una línea de extracto en Banco Bica del día
- **THEN** aparece como fila propia marcada "Cargado en Odoo", suma en el TOTAL y su detalle no ofrece acciones

### Requirement: Fila TOTAL
La matriz SHALL terminar con una fila TOTAL que suma cada columna de diario en el período, incluyendo movimientos de la app y externos y excluyendo borradores y operaciones anuladas.

#### Scenario: Total del día
- **WHEN** el día tiene un Gasto de −50.000 y un Ingreso de +20.000 en Efectivo Administracion
- **THEN** el TOTAL de esa columna es −30.000

### Requirement: Cheque propio pendiente de débito
Cada cheque propio entregado y no debitado SHALL mostrarse entre paréntesis en la columna del banco, como importe pendiente, y no SHALL sumar en el TOTAL hasta que se registre su débito.

#### Scenario: Pago con cheque propio
- **WHEN** se paga $150.000 con un cheque propio de ICBC
- **THEN** la columna ICBC muestra (−150.000,00), la fila figura "Pendiente de débito" y el TOTAL de ICBC no cambia

#### Scenario: Varios cheques, uno debitado
- **WHEN** un Pago se hizo con dos cheques propios de ICBC ($50.000 y $80.000) y ya se debitó el de $50.000
- **THEN** la fila del Pago muestra (−80.000,00) en ICBC

### Requirement: Tipo visible en cada fila
Cada fila de una operación de la app SHALL mostrar su tipo (por ejemplo "Pago a proveedor") debajo del concepto; las cargadas en Odoo, "Movimiento en Odoo".

#### Scenario: Ver el tipo
- **WHEN** el día tiene un Pago y un Gasto
- **THEN** cada fila muestra debajo del concepto "Pago a proveedor" y "Gasto"

### Requirement: Filtros
La vista SHALL tener filtros por texto (concepto, contacto, cuenta o TES-{id}), tipo de operación (incluido "Cargado en Odoo") y estado (pendientes, completadas, pendientes de débito, anuladas, cargadas en Odoo). Con filtros activos el TOTAL SHALL sumar solo lo visible y decir "(filtrado)".

#### Scenario: Filtrar por tipo
- **WHEN** el usuario filtra por "Gasto" en período Mes
- **THEN** cada cuenta muestra solo sus gastos, el TOTAL suma solo esos y dice "(filtrado)"

### Requirement: Operación borrada en Odoo
Una operación confirmada cuyos registros ya no aparecen en Odoo SHALL mostrarse con el chip "No está en Odoo", tachada y sin sumar en el TOTAL. Desde el detalle SHALL poder marcarse como Anulada, solo si el servidor verifica que no queda ningún registro vivo en Odoo.

#### Scenario: Línea borrada en Odoo
- **WHEN** alguien borra en Odoo la línea de extracto de un Gasto confirmado
- **THEN** la fila muestra "No está en Odoo", no suma en el TOTAL y el detalle ofrece "Marcar como anulada"

### Requirement: Estados visibles
Cada fila SHALL mostrar su estado: Borrador, Completada, Pendiente de débito, Requiere atención, Anulada o Cargado en Odoo. Los importes negativos SHALL verse en rojo y los positivos en verde, en formato es-AR con 2 decimales.

#### Scenario: Operación anulada
- **WHEN** una operación del día fue anulada
- **THEN** su fila sigue visible marcada "Anulada" y no suma en el TOTAL

### Requirement: Detalle de la operación en un diálogo
Un clic en el concepto de una fila SHALL abrir un diálogo centrado con el detalle: resumen, movimiento por diario, cuentas y cheques, registros en Odoo con su resultado, historial y las acciones que correspondan (Seguir cargando / Eliminar borrador, Reanudar; Anular va en un menú ⋯ en el encabezado del diálogo). En un borrador, el clic retoma directamente la carga.

#### Scenario: Operación que requiere atención
- **WHEN** el usuario abre una operación en "Requiere atención"
- **THEN** ve qué paso falló con un mensaje en lenguaje llano, qué pasos quedaron hechos y el botón Reanudar

#### Scenario: Anular desde el menú
- **WHEN** el usuario abre el menú ⋯ del diálogo de una operación completada y elige Anular
- **THEN** el diálogo pide la confirmación de la anulación antes de ejecutarla

### Requirement: Confirmación desde el diálogo
Al apretar Confirmar en el panel de carga, el borrador SHALL guardarse y abrirse su diálogo de detalle con la pregunta "¿Confirmar?". Recién al aceptar ahí SHALL registrarse en Odoo, y el diálogo SHALL mostrar el avance de los pasos.

#### Scenario: Confirmar desde el diálogo
- **WHEN** el usuario aprieta Confirmar en el panel de carga
- **THEN** se abre el detalle del borrador con "¿Confirmar?" y no se registra nada en Odoo hasta que acepta ahí

### Requirement: Borradores en la grilla
Los borradores SHALL aparecer como filas en el día de su fecha contable, marcados "Borrador", sin sumar en el TOTAL.

#### Scenario: Retomar un borrador
- **WHEN** el usuario hace clic en el concepto de un borrador o en su marca "Borrador"
- **THEN** la fila vuelve a ser editable con los datos guardados, sin un botón aparte que agrande la fila

### Requirement: Odoo no disponible
Si Odoo no responde, la vista SHALL mostrar un banner, listar los borradores guardados y permitir crear o editar borradores, sin mostrar la matriz de movimientos ni permitir confirmar.

#### Scenario: Odoo caído
- **WHEN** Odoo no responde al cargar la Vista General
- **THEN** se ve el banner "Odoo no está disponible", los borradores y el botón Confirmar deshabilitado

### Requirement: Uso en celular
La vista SHALL ser usable en celular: la matriz con scroll horizontal y la columna Concepto fija; los diálogos a pantalla completa.

#### Scenario: Pantalla angosta
- **WHEN** se abre la Vista General en un celular
- **THEN** la matriz se desplaza horizontalmente sin desplazar la página y la columna Concepto queda visible

### Requirement: Ocultar columnas
La matriz de la Vista General y la fila de la operación en carga SHALL tener cada una un menú "Columnas" para ocultar y volver a mostrar las columnas Contacto, Cuenta / detalle y las de cada diario. Concepto no se puede ocultar. Las columnas ocultas se recuerdan en el navegador, por separado para cada grilla. Ocultar una columna no borra los importes cargados en ella ni los saca del TOTAL.

#### Scenario: Achicar la grilla
- **WHEN** el usuario desmarca un diario en el menú "Columnas"
- **THEN** la columna desaparece de la grilla y el botón indica cuántas columnas están ocultas

#### Scenario: Volver a mostrar
- **WHEN** el usuario vuelve a marcar la columna
- **THEN** la columna reaparece con sus importes
