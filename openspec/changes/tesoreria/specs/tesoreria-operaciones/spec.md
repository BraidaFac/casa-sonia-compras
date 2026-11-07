## Purpose

Dar de alta desde la Vista General las operaciones de tesorería de etapa 1 y registrarlas en Odoo de forma completa, trazable, reanudable y anulable, sin que el usuario cargue cada registro contable a mano.

## ADDED Requirements

### Requirement: Panel de carga
Al elegir una operación en "Nueva operación" SHALL abrirse arriba de la grilla un panel que reúne la cabecera (tipo, fecha contable editable, Cancelar / Guardar borrador / Confirmar), la fila de carga con sus propias columnas (solo los diarios que aplican a esa operación) y una frase de resumen. Lo que no entra en una celda SHALL cargarse en un diálogo centrado con Cancelar y Aceptar.

#### Scenario: Abrir un Gasto
- **WHEN** el usuario elige "Gasto" en "Nueva operación"
- **THEN** se abre el panel de carga sin la columna Cheques de Terceros y con Efectivo Administracion como diario sugerido

#### Scenario: Resumen en castellano
- **WHEN** el usuario carga $50.000 en Efectivo Administracion en un Gasto
- **THEN** el pie del panel dice "Sale $ 50.000,00 de Efectivo Administracion."

#### Scenario: Al guardar o confirmar
- **WHEN** el usuario guarda el borrador o confirma la operación
- **THEN** el panel se cierra, la vista va al día de la operación y su fila queda resaltada unos segundos

#### Scenario: Editar un borrador
- **WHEN** el usuario retoma un borrador
- **THEN** se abre el mismo panel con el título "Borrador TES-{id}" y la fila del borrador en la grilla queda atenuada con la marca "En edición"

#### Scenario: Cancelar un diálogo
- **WHEN** el usuario cambia datos en el diálogo de cheques y elige Cancelar
- **THEN** los cambios hechos en el diálogo se descartan y la fila queda como estaba

### Requirement: Operaciones de etapa 1
El botón "Nueva operación" SHALL abrir un menú con las nueve operaciones agrupadas: Sale plata (Pago a proveedor, Gasto), Entra plata (Cobro de cliente, Ingreso), Entre cuentas (Movimiento entre diarios, Retiro / Depósito de socios) y Cheques (Cambio de cheque recibo y entrego, Pago de cheques propios). Todas operan solo en ARS y sin retenciones.

#### Scenario: Opciones del menú
- **WHEN** el usuario abre "Nueva operación"
- **THEN** ve las nueve operaciones en esos cuatro grupos y ninguna otra

### Requirement: Fecha contable
Cada operación SHALL tener una fecha contable, por defecto hoy en hora de Argentina y editable. Las fechas futuras SHALL rechazarse; las pasadas no tienen límite ni aviso. Todos los registros de una operación usan esa fecha.

#### Scenario: Fecha futura
- **WHEN** el usuario elige mañana como fecha contable
- **THEN** la app no permite confirmar y avisa que no se admiten fechas futuras

### Requirement: Importes positivos
Los importes SHALL ingresarse siempre en positivo; el sentido lo define la operación. SHALL rechazarse 0, negativos, no numéricos y más de 2 decimales. El servidor SHALL recalcular los totales antes de ejecutar.

#### Scenario: Importe negativo
- **WHEN** el usuario tipea −5.000 en una celda
- **THEN** la celda se marca inválida y la operación no se puede confirmar

### Requirement: Observación y etiqueta
La observación SHALL ser obligatoria en Gasto, Ingreso y ambos Cambios de cheque, y opcional en las demás. Si queda vacía, la etiqueta en Odoo SHALL generarse: `Pago {contacto}`, `Cobro {contacto}`, `Mov. {origen} → {destino}`, `{Retiro|Depósito} {socio}`, `Débito cheque {número}`.

#### Scenario: Pago sin observación
- **WHEN** se confirma un Pago a "Todo Color" sin observación
- **THEN** los registros en Odoo llevan la etiqueta "Pago Todo Color"

### Requirement: Contacto
El contacto SHALL ser obligatorio en Pago, Cobro, ambos Cambios de cheque y Gasto con factura fiscal o con cheque propio; opcional en el resto de Gasto e Ingreso; no aplica en Movimiento, Socios ni Pago de cheques propios. El selector busca contactos activos de Odoo por nombre o CUIT.

#### Scenario: Pago sin contacto
- **WHEN** el usuario intenta confirmar un Pago sin contacto
- **THEN** la app avisa "Falta el contacto" y no ejecuta

### Requirement: Alta rápida de contacto
Desde el selector de contacto SHALL poder crearse un contacto en Odoo con nombre, CUIT obligatorio con dígito verificador válido, condición frente al IVA y tipo cliente, proveedor o ambos.

#### Scenario: CUIT existente
- **WHEN** el CUIT ingresado ya pertenece a un contacto de Odoo
- **THEN** la app no crea uno nuevo y ofrece usar el existente

#### Scenario: CUIT inválido
- **WHEN** el dígito verificador del CUIT no es válido
- **THEN** la app no permite crear el contacto

### Requirement: Pago a proveedor
Un Pago SHALL tener contacto, uno o varios medios y observación opcional. Medios: importe en un diario de efectivo, banco o billetera; cheques de terceros de cartera; cheques propios de un banco. El importe del pago es la suma de los medios. Cada medio SHALL registrarse en Odoo como un pago propio. Si se eligieron facturas, los pagos SHALL quedar imputados a ellas (ver Imputación a facturas).

#### Scenario: Pago con dos medios
- **WHEN** se paga a "Todo Color" $100.000 en Efectivo Administracion y $200.000 por Banco Bica
- **THEN** Odoo queda con dos pagos al proveedor (uno por diario), cada uno con su línea de extracto conciliada, y la fila muestra −100.000 y −200.000

### Requirement: Selector de cartera
Para pagar o entregar cheques de terceros SHALL abrirse un selector con los cheques en cartera (Cheques de Terceros), filtrable por fecha de pago, banco, librador e importe, ordenado por fecha de pago, con el total seleccionado en vivo. No se tipea importe: es la suma de los elegidos. No bloquea vencidos.

#### Scenario: Elegir cheques
- **WHEN** el usuario elige dos cheques de $50.000 en el selector y acepta
- **THEN** la celda de Cheques de Terceros muestra −100.000

#### Scenario: Cheque que dejó de estar en cartera
- **WHEN** un cheque elegido se usó en Odoo antes de confirmar
- **THEN** la revalidación lo detecta, la operación no se ejecuta y se avisa qué cheque cambió

### Requirement: Emisión de cheque propio
Pagar con cheque propio SHALL pedir por cheque: banco, físico o e-cheq (por defecto e-cheq; los siguientes copian el tipo del anterior), número, fecha de pago e importe. Número de 8 dígitos en físico; se sugiere el último emitido del banco + 1, editable; número repetido en ese banco bloqueado; fecha de pago entre la fecha contable y 360 días después.

#### Scenario: Número repetido
- **WHEN** el número de cheque ya fue emitido en ese banco
- **THEN** la app bloquea el cheque y avisa que el número está usado

#### Scenario: Cheque propio emitido
- **WHEN** se confirma un Pago con un cheque propio de ICBC por $150.000
- **THEN** el cheque queda "Entregado" en Odoo hasta su débito y la operación figura "Pendiente de débito"

### Requirement: Cobro de cliente
Un Cobro SHALL ser espejo del Pago: contacto, uno o varios medios y observación opcional. Medios: importe en un diario de efectivo, banco o billetera, o cheques de terceros dados de alta en la operación. No admite cheque propio. Cada medio es un cobro propio en Odoo. Si se eligieron facturas de venta, los cobros SHALL quedar imputados a ellas (ver Imputación a facturas).

#### Scenario: Cobro con cheque
- **WHEN** se cobra a un cliente con un cheque de tercero de $80.000
- **THEN** el cheque queda en cartera en Cheques de Terceros y la fila muestra +80.000 en esa columna

### Requirement: Imputación a facturas
En Pago y Cobro, la columna Detalle SHALL tener el botón "Imputar facturas", deshabilitado sin contacto. Recién al abrirlo la app SHALL buscar en Odoo las facturas publicadas con saldo del contacto elegido (y sus contactos hijos), ordenadas por vencimiento: de compra en Pago, de venta en Cobro, con sus notas de crédito. Cambiar el contacto SHALL borrar la selección.

#### Scenario: Sin contacto
- **WHEN** el Pago no tiene contacto
- **THEN** el botón "Imputar facturas" está deshabilitado y la app no consulta facturas

#### Scenario: Cambio de contacto
- **WHEN** el usuario eligió facturas y después cambia el contacto
- **THEN** la selección queda vacía

### Requirement: Reparto de la imputación
El usuario marca facturas; no tipea importe. Odoo SHALL aplicar el total de la operación de la factura más vieja a la más nueva; lo que sobra queda a cuenta del contacto. Anular la operación SHALL devolver el saldo a las facturas sin cancelarlas.

#### Scenario: Pago menor al saldo
- **WHEN** se paga $150.000 imputando dos facturas de $100.000 (vence 01/10) y $80.000 (vence 15/10)
- **THEN** en Odoo la de 01/10 queda pagada y la de 15/10 queda parcialmente pagada con saldo $30.000

#### Scenario: Pago mayor al saldo
- **WHEN** se paga $250.000 imputando facturas por $180.000
- **THEN** las facturas quedan pagadas y $70.000 quedan a cuenta del proveedor

#### Scenario: Factura pagada antes de confirmar
- **WHEN** una factura elegida se pagó en Odoo antes de confirmar
- **THEN** la revalidación lo detecta, la operación no se ejecuta y se avisa qué factura cambió

#### Scenario: Ver las facturas imputadas
- **WHEN** el usuario abre el detalle de un Pago imputado
- **THEN** ve la tabla "Facturas imputadas" con número, vencimiento y saldo al elegirlas

#### Scenario: Anular un pago imputado
- **WHEN** se anula un Pago que imputó una factura
- **THEN** la factura vuelve a tener su saldo en Odoo y no se cancela

### Requirement: Memo de pagos con factura
Cuando un pago de Odoo queda conciliado con facturas (imputación en Pago o Cobro, o la factura del Gasto), su memo SHALL empezar con los números de factura separados por "/" (hasta 3, después "+N"), seguido de " - " y la etiqueta de la operación. El prefijo SHALL armarse al ejecutar, no se guarda en la observación. La línea de extracto SHALL conservar la etiqueta sin prefijo, para que los modelos de conciliación automática de Odoo no la concilien contra la factura.

#### Scenario: Pago imputado a dos facturas
- **WHEN** se confirma un Pago con observación "Pago de octubre" imputado a FA-A 00001-00000123 y FA-A 00001-00000124
- **THEN** el memo del pago en Odoo es "FA-A 00001-00000123/FA-A 00001-00000124 - Pago de octubre" y la línea de extracto dice "Pago de octubre"

#### Scenario: Más de tres facturas
- **WHEN** el Pago imputa cinco facturas
- **THEN** el memo lleva los tres primeros números y "+2" antes de la etiqueta

#### Scenario: Gasto con factura
- **WHEN** se confirma un Gasto con factura A 00008-12345678 y observación "Luz"
- **THEN** el memo del pago es "FA-A 00008-12345678 - Luz"

### Requirement: Alta de cheque de tercero
Cada cheque recibido SHALL cargarse con: físico o e-cheq, número, banco, CUIT del librador con dígito verificador (autocompleta el nombre si existe), fecha de pago e importe. Se bloquea el duplicado (número + banco + CUIT en Odoo o en la misma operación) y el CUIT de Casa Sonia. Sin restricción de fecha de pago.

#### Scenario: Cheque duplicado
- **WHEN** se carga un cheque con número, banco y CUIT de uno existente en Odoo
- **THEN** la app bloquea el cheque y avisa que ya existe

#### Scenario: Cheque de la propia empresa
- **WHEN** el CUIT del librador es 30717060284
- **THEN** la app bloquea el cheque

### Requirement: Gasto sin factura
Un Gasto SHALL admitir uno o varios diarios, y cada diario sus propias líneas de cuenta (cuenta de la lista de Gasto, importe > 0, descripción opcional; sin límite de líneas; cuenta repetible). En Odoo SHALL crearse una línea de extracto por cada par diario + cuenta, todas con la referencia de la operación, salvo en las columnas con cheque propio (ver Gasto con cheque propio).

#### Scenario: Gasto repartido en dos cuentas
- **WHEN** se registra un Gasto de luz de $50.000 en Efectivo Administracion: $49.500 a 5.2.7 Servicios y $500 a 1.4.9 Retenciones y percepciones varias
- **THEN** Odoo queda con dos líneas de extracto conciliadas contra esas cuentas y la Vista General muestra un único movimiento de −50.000 en Efectivo Administracion

### Requirement: Gasto con factura fiscal
La casilla "¿Lleva factura fiscal?" SHALL pedir proveedor, tipo de comprobante (A, B o C), número, fecha del comprobante (no posterior a la fecha contable) y alícuota de IVA por línea (21 %, 10,5 %, 27 % o exento; sin IVA en B y C). La app SHALL crear y publicar la factura de compra y pagarla con los diarios del gasto hasta su total (ver Importe de la factura).

#### Scenario: Gasto con factura A
- **WHEN** se confirma un Gasto con factura A de $121.000 (neto $100.000 a 5.2.7 Servicios + IVA 21 %) pagado en Banco Bica
- **THEN** Odoo queda con la factura publicada y pagada, el pago en Banco Bica con su línea de extracto conciliada

#### Scenario: Factura duplicada
- **WHEN** ya existe en Odoo una factura del mismo proveedor, tipo y número
- **THEN** la app bloquea la operación y avisa del duplicado

### Requirement: Comprobante y diario de la factura
La factura SHALL cargarse como la carga el contador. A: en el diario de compras con comprobantes, con un tipo de comprobante traído de Odoo (los de letra A usados en compras; por defecto Factura A) y el número como número de documento. B y C: en el diario de compras sin comprobantes, sin tipo, con el número del proveedor en la referencia y sin IVA.

#### Scenario: Factura A
- **WHEN** se confirma un Gasto con factura A 00002-00011165
- **THEN** Odoo queda con la factura "FA-A 00002-00011165" en el diario con comprobantes

#### Scenario: Factura B
- **WHEN** se confirma un Gasto con factura B 0000-00006369
- **THEN** Odoo queda con una factura en el diario sin comprobantes, con referencia "0000-00006369" y sin tipo de comprobante

#### Scenario: Falta el diario sin comprobantes
- **WHEN** no está configurado el diario de compras sin comprobantes y se confirma un Gasto con factura C
- **THEN** la app no ejecuta y avisa que falta configurarlo, indicando que lo configura un Admin

### Requirement: Factura en la fila y en la cabecera
En un Gasto, la factura SHALL manejarse desde un menú ⋯ en la columna Cuenta / detalle, igual al de las columnas de diario: "Factura fiscal…" sin factura; con factura, el menú se ve en ámbar, encabezado con tipo, número y total, y ofrece "Editar factura…" y "Adjuntar…". La cabecera del panel SHALL mostrar la factura (letra, número y total) con el total coloreado como en el diálogo.

#### Scenario: Gasto sin factura
- **WHEN** el usuario abre el menú ⋯ de la columna Cuenta / detalle de un Gasto sin factura
- **THEN** ve la opción "Factura fiscal…" y la fila no muestra otro botón

#### Scenario: Factura en la cabecera
- **WHEN** el Gasto tiene una factura C 0001-00000123 de $150.000 y se pagan $100.000
- **THEN** la cabecera muestra "Factura fiscal · C 0001-00000123 · $ 150.000,00" con el total en ámbar

#### Scenario: Cuenta por defecto en líneas nuevas
- **WHEN** el usuario eligió la cuenta 5.2.7 Servicios en la fila y agrega una línea en la factura
- **THEN** la línea nueva arranca con 5.2.7 Servicios; si ninguna columna tiene importe, el diálogo abre con una línea con esa cuenta

### Requirement: Importe de la factura
Las líneas de la factura (cuenta, neto, IVA en A) SHALL precargarse con las del gasto y ser editables, incluso sin importes en las columnas. El diálogo SHALL mostrar el total contra lo pagado: verde si coinciden, ámbar si la factura es mayor, rojo si es menor. Factura mayor: queda con saldo. Factura menor: los pagos la saldan y el excedente de cada línea SHALL registrarse como gasto sin factura contra su cuenta; en una columna con cheque propio, va al asiento de Gasto con cheque propio.

#### Scenario: Factura mayor que lo pagado
- **WHEN** se confirma un Gasto de $100.000 en Banco Bica con factura C de $150.000
- **THEN** Odoo queda con la factura publicada con saldo $50.000 y el pago de $100.000 imputado; el diálogo mostraba el total en ámbar y "la factura queda con saldo $50.000"

#### Scenario: Factura sin pago
- **WHEN** se confirma un Gasto sin importes en las columnas con factura B de $80.000
- **THEN** Odoo queda con la factura publicada sin pagar y ningún movimiento de fondos

#### Scenario: Factura menor que lo pagado
- **WHEN** se confirma un Gasto de $100.000 en Efectivo Administracion a 5.2.7 Servicios con factura C de $90.000
- **THEN** Odoo queda con la factura pagada por un pago de $90.000 y una línea de extracto de −10.000 contra 5.2.7 Servicios; el diálogo mostraba el total en rojo y el aviso del excedente

#### Scenario: Factura igual a lo pagado
- **WHEN** la factura suma lo mismo que el gasto
- **THEN** el total se ve en verde y la factura queda pagada, como un Gasto con factura sin cambios

### Requirement: Gasto con cheque propio
En un Gasto, cada columna de banco SHALL ofrecer "Cheque propio…" en su menú ⋯, con la misma carga que la Emisión de cheque propio. La suma de los cheques SHALL no superar el total de la columna; el resto sale del banco en el momento. Con cheque propio el contacto es obligatorio. Los cheques quedan Pendientes de débito como en un Pago; la Vista General muestra el pendiente contra la cuenta del contacto.

#### Scenario: Cheques mayores que la columna
- **WHEN** los cheques propios de la columna Banco ICBC suman más que sus líneas
- **THEN** la app avisa "Los cheques superan el total de Banco ICBC." y no ejecuta

#### Scenario: Sin contacto
- **WHEN** el usuario intenta confirmar un Gasto con cheque propio sin contacto
- **THEN** la app avisa "Falta el contacto" y no ejecuta

### Requirement: Registro en Odoo del Gasto con cheque propio
En una columna con cheque propio, lo que la columna no paga de la factura (sin factura: la columna entera) SHALL registrarse con un asiento en el diario de ajustes: las cuentas de gasto al Debe contra la cuenta de proveedores del contacto. La columna SHALL pagarse al contacto con un pago con cheque propio por los cheques y un pago con línea de extracto por el resto, conciliados en la cuenta del contacto con el asiento y la factura.

#### Scenario: Gasto sin factura pagado con cheque
- **WHEN** se confirma un Gasto a Juan Pérez de $100.000 en Banco ICBC ($99.500 a 5.2.7 Servicios y $500 a 1.4.9 Retenciones y percepciones varias) pagado con un e-cheq de $100.000
- **THEN** Odoo queda con un asiento en el diario de ajustes que carga las dos cuentas contra la cuenta de proveedores de Juan Pérez y un pago con cheque propio de $100.000 conciliado con ese asiento (saldo de Juan Pérez en 0), sin línea de extracto; la operación queda "Pendiente de débito"

#### Scenario: Parte con cheque y parte transferencia
- **WHEN** se confirma un Gasto de $100.000 en Banco ICBC con un cheque propio de $60.000
- **THEN** Odoo queda con un asiento por $100.000, un pago con cheque de $60.000 pendiente de débito y un pago de $40.000 con su línea de extracto de −40.000 en Banco ICBC, todo conciliado en la cuenta del contacto

#### Scenario: Con factura y excedente
- **WHEN** se confirma un Gasto de $100.000 en Banco ICBC a 5.2.7 Servicios con factura C de $90.000, pagado con un cheque propio de $100.000
- **THEN** Odoo queda con la factura pagada, un asiento de $10.000 a 5.2.7 Servicios contra la cuenta de proveedores del contacto y el pago con cheque conciliado con la factura y el asiento

#### Scenario: Falta el diario de ajustes
- **WHEN** no está configurado el diario de ajustes y se confirma un Gasto con cheque propio que requiere asiento
- **THEN** la app no ejecuta y avisa que falta configurarlo, indicando que lo configura un Admin

### Requirement: Ingreso
Un Ingreso SHALL ser espejo del Gasto sin factura, con las cuentas de la lista de Ingreso: varios diarios, varias líneas de cuenta por diario, una línea de extracto por par diario + cuenta.

#### Scenario: Ingreso a una cuenta
- **WHEN** se registra un Ingreso de $20.000 en Mercado Pago a 4.2.3 Intereses ganados
- **THEN** Odoo queda con una línea de extracto de +20.000 conciliada contra esa cuenta

### Requirement: Movimiento entre diarios
Un Movimiento SHALL tener diario origen, diario destino distinto, importe y observación opcional. No admite Cheques de Terceros. SHALL generar una línea de salida en origen y una de entrada en destino, ambas contra la cuenta puente, que queda en 0.

#### Scenario: Movimiento a banco
- **WHEN** se mueven $300.000 de Efectivo Administracion a Banco Bica
- **THEN** la fila muestra −300.000 y +300.000 y la cuenta puente no cambia su saldo

#### Scenario: Mismo diario
- **WHEN** origen y destino son el mismo diario
- **THEN** la app no permite confirmar

### Requirement: Retiro y depósito de socios
Socios SHALL tener sentido Retiro o Depósito, diario, cuenta del socio (lista de Socios), importe y observación opcional. SHALL generar una línea de extracto contra la cuenta del socio: salida en Retiro, entrada en Depósito.

#### Scenario: Retiro de socio
- **WHEN** se registra un Retiro de $500.000 de Efectivo Administracion a 3.3.1 Retiro Maximo
- **THEN** Odoo queda con una línea de −500.000 conciliada contra 3.3.1

### Requirement: Pago de cheques propios
La operación SHALL listar los cheques propios entregados y no debitados de un banco, ordenados por fecha de pago, para elegir uno o varios, aunque Odoo muestre su pago como pagado. Por cada cheque elegido SHALL crearse en el banco una línea de extracto por su importe, conciliada con la línea pendiente de ese cheque, en la fecha contable.

#### Scenario: Débito de dos cheques
- **WHEN** se registra el débito de dos cheques propios de ICBC de $100.000 y $200.000
- **THEN** Odoo queda con dos líneas de extracto en ICBC, cada una conciliada con la línea pendiente de su cheque, ambos cheques "Debitados", y la fila muestra −300.000 en ICBC

#### Scenario: Pago con varios cheques, se debita uno
- **WHEN** un Pago se hizo con dos cheques propios de ICBC ($50.000 y $80.000) y se registra el débito del de $50.000
- **THEN** ese cheque queda "Debitado", el de $80.000 sigue en la lista para debitar y el Pago sigue "Pendiente de débito"

#### Scenario: Cheque emitido fuera de la app
- **WHEN** hay un cheque propio emitido directamente en Odoo y no debitado
- **THEN** aparece en la lista igual que los emitidos desde la app

### Requirement: Cambio de cheque (recibo)
El contacto entrega cheques de terceros (alta como en Cobro) y recibe efectivo de un diario de efectivo o billetera. La diferencia = total de cheques − efectivo SHALL calcularse sola, solo lectura. En Odoo: cobro al contacto por los cheques, pago al contacto por el efectivo real y ajuste de la diferencia en la cuenta del contacto contra la cuenta de ganancia (o de pérdida si es negativa).

#### Scenario: Cambio con ganancia
- **WHEN** Manelo entrega dos cheques de $50.000 y recibe $90.000 de Efectivo Administracion
- **THEN** la fila muestra +100.000 en Cheques de Terceros y −90.000 en Efectivo, la cuenta de ganancia registra 10.000 y la cuenta de Manelo queda en 0

#### Scenario: Cambio a la par
- **WHEN** los cheques suman $400.000 y el efectivo entregado es $400.000
- **THEN** no se genera ajuste y la cuenta del contacto queda en 0

### Requirement: Cambio de cheque (entrego)
Se entregan cheques de cartera (selector de cartera) a un contacto y se recibe efectivo. La diferencia = total de cheques − efectivo SHALL calcularse sola. En Odoo: pago al contacto con los cheques, cobro al contacto por el efectivo real y ajuste de la diferencia en la cuenta del contacto contra la cuenta de pérdida (o de ganancia si es negativa).

#### Scenario: Cambio con interés
- **WHEN** se entrega un cheque de $542.840 a Valentín Braida y se reciben $500.000
- **THEN** la fila muestra −542.840 en Cheques de Terceros y +500.000 en Efectivo, la cuenta de pérdida registra 42.840 y la cuenta del contacto queda en 0

### Requirement: Borradores
Una operación SHALL poder guardarse como borrador en cualquier momento, incluso incompleta o con Odoo caído. Los borradores no vencen: se conservan hasta confirmarlos o eliminarlos a mano. Solo los borradores se editan.

#### Scenario: Guardar borrador incompleto
- **WHEN** el usuario guarda un Pago sin medios cargados
- **THEN** queda como borrador en la grilla y no se escribe nada en Odoo

### Requirement: Advertencia de posible duplicado
Al confirmar, si existe otra operación no anulada del mismo tipo, contacto, importe total y fecha contable, la app SHALL advertir con un enlace a la existente y ejecutar solo si el usuario acepta. Es la única advertencia de etapa 1.

#### Scenario: Pago repetido
- **WHEN** se confirma un Pago a "Todo Color" por $100.000 el mismo día que otro igual
- **THEN** la app muestra la advertencia con enlace al pago existente y espera la decisión del usuario

### Requirement: Revalidación antes de ejecutar
Antes de escribir en Odoo el servidor SHALL revalidar contacto, diarios y cuentas activos, cheques en el estado esperado y números no usados. Si algo cambió, SHALL no ejecutar nada, devolver la operación a borrador y avisar qué cambió. No hay reservas de cheques.

#### Scenario: Cuenta archivada
- **WHEN** la cuenta de un Gasto se archivó en Odoo después de guardar el borrador
- **THEN** la confirmación no escribe nada en Odoo y la app avisa que la cuenta ya no está disponible

### Requirement: Ejecución por pasos con progreso
Confirmar SHALL ejecutar la operación en Odoo dentro del mismo pedido, paso por paso, guardando cada paso en la base antes y después de llamar a Odoo. El usuario SHALL ver el progreso de los pasos mientras se ejecuta. Confirmar dos veces la misma operación SHALL ejecutarla una sola vez.

#### Scenario: Doble clic en Confirmar
- **WHEN** el usuario hace doble clic en Confirmar
- **THEN** la operación se ejecuta una sola vez y no se duplican registros en Odoo

#### Scenario: Ejecución exitosa
- **WHEN** todos los pasos terminan bien
- **THEN** la operación queda Completada (o Pendiente de débito si incluye cheques propios) y su fila se actualiza en la grilla

### Requirement: Trazabilidad en Odoo
Cada registro creado en Odoo SHALL llevar la referencia `TES-{id}-{paso}` y el registro principal la nota `Registrado por: {usuario} · Op: TES-{id}`. Las conciliaciones SHALL hacerse explícitamente sobre los registros creados, sin depender de la conciliación automática de Odoo.

#### Scenario: Buscar en Odoo
- **WHEN** el contador busca en Odoo la referencia TES-42
- **THEN** encuentra todos los registros creados por la operación 42

### Requirement: Requiere atención y Reanudar
Si un paso falla después de haber creado algo en Odoo, la operación SHALL quedar "Requiere atención" con un mensaje en lenguaje llano y la acción Reanudar, que continúa desde el paso fallido sin duplicar lo ya hecho. Si falla el primer paso sin crear nada, vuelve a borrador con el error.

#### Scenario: Corte de Odoo en el paso 3
- **WHEN** Odoo no responde al crear el cobro en efectivo (paso 3) y los pasos 1 y 2 quedaron hechos
- **THEN** la operación queda "Requiere atención" y Reanudar sigue desde el paso 3

#### Scenario: Respuesta perdida
- **WHEN** Odoo creó el registro pero la respuesta no llegó
- **THEN** al reanudar la app encuentra el registro por su referencia y no lo vuelve a crear

### Requirement: Anular
`TESORERO` y `ADMIN` SHALL poder anular una operación Completada o Pendiente de débito, sin ventana de tiempo, previa confirmación. La anulación revierte en Odoo todos sus registros en orden inverso; la operación queda en la grilla como Anulada. Una operación confirmada no se edita: se anula y se carga de nuevo.

#### Scenario: Anular un Pago con cheques de cartera
- **WHEN** se anula un Pago hecho con un cheque de tercero
- **THEN** Odoo queda sin el pago ni su línea de extracto, el cheque vuelve a cartera y la fila figura Anulada

#### Scenario: Falla al anular
- **WHEN** un paso de la anulación falla
- **THEN** la operación queda "Requiere atención" y Reanudar continúa la anulación

#### Scenario: Cheque propio ya debitado
- **WHEN** se intenta anular un Pago cuyo cheque propio ya tiene registrado el débito
- **THEN** la app no anula y avisa que primero hay que anular el Pago de cheques propios

#### Scenario: Cheque recibido ya usado
- **WHEN** se intenta anular un Cobro cuyo cheque de tercero ya salió de cartera
- **THEN** la app no anula y avisa en qué operación o registro se usó el cheque

### Requirement: Adjuntos por medio de pago
Cada celda de importe del panel de carga (un medio de pago en un diario) y la factura fiscal SHALL permitir adjuntar archivos (PDF o imagen, hasta 10 MB cada uno, también con la cámara del celular). Adjuntar no es obligatorio. La factura se adjunta desde su diálogo o desde su menú ⋯.

#### Scenario: Adjuntar la factura desde su diálogo
- **WHEN** el usuario carga la factura de un Gasto, adjunta el PDF en el diálogo y confirma la operación
- **THEN** el PDF queda como adjunto de la factura de compra en Odoo

#### Scenario: Factura descartada
- **WHEN** el usuario adjunta un archivo en el diálogo de una factura nueva y después cancela el diálogo o destilda "¿Lleva factura fiscal?"
- **THEN** el archivo no se guarda

#### Scenario: Adjuntar el comprobante de una transferencia
- **WHEN** el usuario carga un Pago con $50.000 en Banco Bica y adjunta el comprobante en esa celda, y confirma
- **THEN** el comprobante queda como adjunto del pago de Banco Bica en Odoo y ya no está guardado en la app

#### Scenario: Ver un adjunto
- **WHEN** el usuario abre el detalle de una operación completada y elige un adjunto
- **THEN** la app lo descarga desde Odoo y lo muestra

#### Scenario: Agregar después de completada
- **WHEN** el usuario agrega un archivo a un medio de una operación completada
- **THEN** se sube directo a Odoo como adjunto del registro de ese medio

#### Scenario: Quitar un adjunto de un borrador
- **WHEN** el usuario quita un archivo de un borrador
- **THEN** se borra de la app; los adjuntos ya subidos a Odoo se gestionan desde Odoo

### Requirement: Adjuntos en Odoo
Al confirmar, un paso de la ejecución SHALL subir los adjuntos a Odoo al registro de su medio (el pago, o el asiento de la línea de extracto si no hay pago) o a la factura, y luego SHALL borrarlos de la app. El detalle SHALL listar y abrir los adjuntos leyéndolos desde Odoo, incluidos los agregados allá.

#### Scenario: Adjunto agregado en Odoo
- **WHEN** el contador agrega en Odoo un archivo al pago de una operación
- **THEN** el detalle de la operación en la app lo lista y lo abre

### Requirement: Auditoría básica
Cada operación SHALL registrar quién y cuándo la creó, confirmó, reanudó o anuló, cada paso con su resultado, error e intentos, y las advertencias de duplicado aceptadas. Se ve en el detalle desplegado.

#### Scenario: Ver auditoría
- **WHEN** el usuario despliega una operación anulada
- **THEN** ve quién la creó, quién la confirmó, quién la anuló y cuándo
