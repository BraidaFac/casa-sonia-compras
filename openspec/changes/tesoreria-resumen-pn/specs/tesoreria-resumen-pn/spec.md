## Purpose

Pantalla de Tesorería que muestra la posición neta: el saldo de cada diario al inicio y al final de un período, lo que se movió y los cheques propios entregados todavía no debitados, para saber cuánta plata hay en total.

## ADDED Requirements

### Requirement: Acceso al Resumen PN
`/tesoreria/resumen` SHALL estar disponible para `TESORERO` y `ADMIN`. Los demás roles no SHALL acceder a la pantalla ni a sus datos.

#### Scenario: Tesorero entra
- **WHEN** un `TESORERO` entra a `/tesoreria/resumen`
- **THEN** ve el Resumen PN

#### Scenario: Manager no accede
- **WHEN** un `MANAGER` pide `/tesoreria/resumen` o sus datos
- **THEN** no ve la pantalla y la consulta de datos responde 403

### Requirement: Pestaña Resumen PN
Las pestañas de Tesorería SHALL incluir "Resumen PN" después de "Vista General" y "Extracto". Al cambiar de pestaña se SHALL conservar el período y la fecha elegidos.

#### Scenario: Pasar al resumen
- **WHEN** el usuario está en la Vista General en período Mes, octubre de 2026, y elige "Resumen PN"
- **THEN** ve el Resumen PN de octubre de 2026 en período Mes

### Requirement: Período día, mes y año
La vista SHALL tener selector de período Día / Mes / Año con navegación anterior / siguiente, sin períodos futuros. Al entrar sin fecha SHALL mostrar el día de hoy (hora de Argentina).

#### Scenario: Año
- **WHEN** el usuario elige "Año" estando en el 24/10/2026
- **THEN** el resumen cubre del 1/1/2026 al 31/12/2026

### Requirement: Filas por diario
La vista SHALL mostrar una fila por cada diario habilitado en la configuración de Tesorería, en el orden configurado, solo en pesos. Un diario sin movimientos en el período SHALL figurar igual, con Movimientos 0,00.

#### Scenario: Diario sin movimientos
- **WHEN** Banco ICBC no tuvo movimientos en el período y tenía $200.000 al inicio
- **THEN** su fila muestra 200.000,00 · 0,00 · 200.000,00

#### Scenario: Diario en dólares
- **WHEN** existe el diario Dolar USD Administracion en Odoo
- **THEN** no figura en el resumen

### Requirement: Saldos de cada diario
Para cada diario, Saldo al inicio SHALL ser el saldo de su cuenta en Odoo al cierre del día anterior al período; Movimientos, la suma de lo publicado en el período; y Saldo al final, Saldo al inicio más Movimientos. Solo SHALL contar lo publicado en Odoo, no borradores.

#### Scenario: Un día
- **WHEN** Efectivo Administracion tenía $10.000 al cierre del 23/10 y el 24/10 entró $5.000 y salió $3.000
- **THEN** su fila del 24/10 muestra 10.000,00 · 2.000,00 · 12.000,00

### Requirement: Fila Cheques Propios
La vista SHALL mostrar, después de los diarios, una fila "Cheques Propios" con los cheques propios entregados desde diarios habilitados y no debitados, en negativo: Saldo al inicio = pendientes al cierre del día anterior al período; Movimientos = emitidos en el período menos debitados en el período; Saldo al final = pendientes al cierre del período.

#### Scenario: Emisión y débito en el mes
- **WHEN** al 30/09 había un cheque propio de $50.000 sin debitar, en octubre se debitó y se entregó otro de $80.000 que sigue sin debitar
- **THEN** la fila de octubre muestra −50.000,00 · −30.000,00 · −80.000,00

#### Scenario: Pago con varios cheques
- **WHEN** al 30/09 había un Pago con dos cheques propios sin debitar ($50.000 y $80.000) y en octubre se debitó solo el de $50.000
- **THEN** la fila de octubre muestra −130.000,00 · 50.000,00 · −80.000,00, aunque Odoo muestre el pago como pagado

#### Scenario: Cheque anulado
- **WHEN** un cheque propio se entregó y después se anuló el pago
- **THEN** no cuenta en ningún saldo de la fila

### Requirement: Fila Total
La vista SHALL mostrar al final una fila Total con la suma de las tres columnas de todas las filas, Cheques Propios incluida: la posición neta.

#### Scenario: Total con cheques
- **WHEN** los diarios suman $1.000.000 al final y Cheques Propios es −$80.000
- **THEN** el Saldo al final del Total es 920.000,00

### Requirement: Colores
Los importes negativos SHALL verse en rojo y los positivos en verde, en todas las columnas.

#### Scenario: Saldo negativo
- **WHEN** un banco cierra el período en descubierto por $15.000
- **THEN** su Saldo al final muestra −15.000,00 en rojo

### Requirement: Abrir el extracto de un diario
Al hacer clic en la fila de un diario SHALL abrirse su Vista Extracto con el mismo período y fecha.

#### Scenario: Ir al extracto
- **WHEN** el usuario está en el Resumen PN de octubre de 2026 y hace clic en Banco Bica
- **THEN** ve el Extracto de Banco Bica de octubre de 2026

### Requirement: Solo lectura de Odoo
La vista SHALL leer los saldos de Odoo y no SHALL escribir nada en Odoo ni en la base de la app.

#### Scenario: Consultar
- **WHEN** el usuario recorre varios períodos
- **THEN** no se crea ni modifica ningún registro en Odoo

### Requirement: Carga y Odoo no disponible
Mientras se cargan los datos de un período, la vista SHALL mantener título, pestañas y selector de período, con el indicador de carga en el lugar de la tabla. Si Odoo no responde, SHALL mostrar el banner de Odoo no disponible sin cifras y permitir reintentar.

#### Scenario: Odoo caído
- **WHEN** el usuario abre el resumen y Odoo no responde
- **THEN** ve el banner de Odoo no disponible y ninguna cifra

### Requirement: Uso en celular
La vista SHALL poder usarse en un ancho de 375 px, con scroll horizontal de la tabla y la columna del nombre fija.

#### Scenario: Celular
- **WHEN** el usuario abre el resumen en un celular de 375 px de ancho
- **THEN** puede elegir el período y ver las tres columnas con scroll horizontal
