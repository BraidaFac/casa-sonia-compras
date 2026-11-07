## Purpose

Pantalla de Tesorería que muestra los movimientos de un diario en un período, con saldo acumulado y estado de conciliación, para controlar una caja o un banco contra el arqueo o el resumen sin entrar a Odoo.

## ADDED Requirements

### Requirement: Acceso a la Vista Extracto
`/tesoreria/extracto` SHALL estar disponible para `TESORERO` y `ADMIN`, igual que el resto de Tesorería. Los demás roles no SHALL acceder a la pantalla ni a sus datos.

#### Scenario: Tesorero entra
- **WHEN** un `TESORERO` entra a `/tesoreria/extracto`
- **THEN** ve la Vista Extracto

#### Scenario: Manager no accede
- **WHEN** un `MANAGER` pide `/tesoreria/extracto` o sus datos
- **THEN** no ve la pantalla y la consulta de datos responde 403

### Requirement: Pestañas entre vistas
La Vista General y la Vista Extracto SHALL mostrar arriba pestañas "Vista General" y "Extracto" para pasar de una a otra. Al cambiar de pestaña se SHALL conservar el período y la fecha elegidos.

#### Scenario: Pasar al extracto
- **WHEN** el usuario está en la Vista General en período Mes, octubre de 2026, y elige la pestaña "Extracto"
- **THEN** ve la Vista Extracto de octubre de 2026 en período Mes

#### Scenario: Volver a la Vista General con rango
- **WHEN** el usuario está en el Extracto con rango del 05/10/2026 al 20/10/2026 y elige "Vista General"
- **THEN** ve la Vista General del día 20/10/2026

### Requirement: Selector de diario
La vista SHALL tener un selector con los diarios habilitados en la configuración de Tesorería, en el orden configurado, solo en pesos. Al entrar sin diario elegido SHALL mostrar el primero.

#### Scenario: Diario por defecto
- **WHEN** la configuración habilita Efectivo Administracion, Banco Bica y Cheques de Terceros, en ese orden, y el usuario entra a la vista
- **THEN** ve el extracto de Efectivo Administracion

#### Scenario: Diario en dólares
- **WHEN** existe el diario Dolar USD Administracion en Odoo
- **THEN** no figura en el selector

### Requirement: Período día, mes y año
La vista SHALL tener atajos de período Día / Mes / Año con navegación anterior / siguiente, igual que la Vista General, sin permitir períodos futuros. Al entrar sin fecha SHALL mostrar el día de hoy (hora de Argentina).

#### Scenario: Mes
- **WHEN** el usuario elige "Mes" estando en el 24/10/2026
- **THEN** ve los movimientos del diario del 1 al 31 de octubre de 2026 y el selector de rango muestra 01/10/2026 – 31/10/2026

### Requirement: Rango de fechas personalizado
La vista SHALL tener un selector de rango (desde–hasta) que muestre el rango efectivo del período. Elegir un rango SHALL pasar a rango personalizado; un solo día SHALL ser válido. Con rango personalizado, anterior / siguiente SHALL mover un rango del mismo largo. No SHALL permitir fechas futuras.

#### Scenario: Rango personalizado
- **WHEN** el usuario elige en el selector del 05/10/2026 al 20/10/2026
- **THEN** ve los movimientos de esos 16 días, con Saldo inicial al cierre del 04/10/2026

#### Scenario: Siguiente con rango
- **WHEN** el rango es del 01/10/2026 al 10/10/2026 y el usuario toca "Siguiente"
- **THEN** ve del 11/10/2026 al 20/10/2026

#### Scenario: Sin futuros
- **WHEN** hoy es 24/10/2026 y el usuario intenta elegir un rango que termina el 25/10/2026
- **THEN** el selector no permite elegir fechas posteriores al 24/10/2026

### Requirement: Columnas del extracto
Cada fila SHALL mostrar Fecha, Etiqueta, Contacto, Importe, Balance y Conciliado. El Importe SHALL verse en rojo si es negativo y en verde si es positivo. Las filas SHALL ir en orden cronológico ascendente (fecha contable y, dentro del día, orden de registro en Odoo).

#### Scenario: Una línea de pago
- **WHEN** el 14/08/2026 se pagó $150.000 a Bando S.A. desde Banco Bica, con etiqueta "pago bando", y el saldo anterior era $4.650.000
- **THEN** la fila muestra 14/08/2026 · pago bando · Bando S.A. · −150.000,00 en rojo · 4.500.000,00 · ✓

### Requirement: Saldo acumulado
El Balance de cada fila SHALL ser el saldo del diario en Odoo después de ese movimiento: el saldo al inicio del período más los importes de las filas hasta esa inclusive. La vista SHALL mostrar arriba una fila "Saldo inicial" con el saldo del diario al cierre del día anterior al período.

#### Scenario: Saldo inicial y acumulado
- **WHEN** el diario tenía $10.000 al cierre del 23/10 y el 24/10 tiene un ingreso de $5.000 y un egreso de $3.000, en ese orden
- **THEN** el Saldo inicial es 10.000,00 y los Balances son 15.000,00 y 12.000,00

#### Scenario: Período sin movimientos
- **WHEN** el período elegido no tiene movimientos en el diario
- **THEN** la vista muestra el Saldo inicial, el aviso "Sin movimientos" y el TOTAL con importe 0,00 y saldo igual al inicial

### Requirement: Estado de conciliación
La columna Conciliado SHALL mostrar ✓ cuando el movimiento está conciliado en Odoo y ✗ cuando no. El ✓ SHALL tomar el color del signo del importe (rojo o verde). Un movimiento agrupado SHALL verse conciliado solo si todas sus líneas lo están. Un asiento cargado en Odoo directo sobre la cuenta del diario, sin línea de extracto, SHALL verse conciliado.

#### Scenario: Línea sin conciliar
- **WHEN** una línea de extracto cargada en Odoo no está conciliada con ningún pago ni cuenta
- **THEN** la fila muestra ✗

#### Scenario: Gasto parcialmente conciliado
- **WHEN** un Gasto de la app tiene dos líneas en el diario y solo una está conciliada
- **THEN** la fila muestra ✗

### Requirement: Agrupación por operación
Las líneas de una misma operación de la app en el diario SHALL verse como una sola fila con el importe neto y la etiqueta de la operación. Las líneas cargadas en Odoo fuera de la app SHALL verse una fila por línea, con la etiqueta de Odoo y una marca de "Cargado en Odoo".

#### Scenario: Gasto en varias cuentas
- **WHEN** un Gasto de $50.000 en Efectivo Administracion se reparte en dos cuentas ($30.000 y $20.000)
- **THEN** el extracto de Efectivo Administracion muestra una sola fila de −50.000,00

#### Scenario: Movimiento externo
- **WHEN** alguien cargó en Odoo una línea de extracto en el diario sin pasar por la app
- **THEN** aparece como una fila propia, marcada "Cargado en Odoo"

### Requirement: Fila TOTAL
La vista SHALL mostrar al final una fila TOTAL con la suma de los importes de las filas visibles y, en Balance, el saldo del diario al final del período.

#### Scenario: Total del día
- **WHEN** el día tiene un ingreso de $5.000 y un egreso de $3.000 con saldo inicial $10.000
- **THEN** el TOTAL muestra 2.000,00 y Balance 12.000,00

### Requirement: Filtro solo sin conciliar
La vista SHALL tener un filtro "Solo sin conciliar" que muestre solo las filas con ✗. Con el filtro activo, el Balance de cada fila SHALL seguir siendo el saldo real del diario (calculado con todas las filas) y el TOTAL SHALL sumar solo las filas visibles.

#### Scenario: Filtrar
- **WHEN** el día tiene tres movimientos y solo uno de −$3.000 está sin conciliar, y el usuario activa "Solo sin conciliar"
- **THEN** ve una sola fila, con el mismo Balance que tenía sin filtro, y el TOTAL muestra −3.000,00

### Requirement: Abrir el movimiento
Al hacer clic en una fila de la app SHALL abrirse el detalle de la operación, el mismo de la Vista General. Al hacer clic en una fila cargada en Odoo SHALL abrirse ese asiento en Odoo en otra pestaña.

#### Scenario: Fila de la app
- **WHEN** el usuario hace clic en la fila de un Pago de la app
- **THEN** se abre el detalle de ese Pago con sus pasos y acciones

#### Scenario: Fila externa
- **WHEN** el usuario hace clic en una fila "Cargado en Odoo"
- **THEN** se abre el asiento en Odoo en una pestaña nueva

### Requirement: Solo lectura de Odoo
La vista SHALL mostrar únicamente lo publicado en Odoo para la cuenta del diario: no SHALL incluir borradores ni operaciones sin registrar en Odoo, ni cheques propios entregados y no debitados. No SHALL escribir nada en Odoo.

#### Scenario: Borrador
- **WHEN** hay un borrador de Gasto en el diario para el día
- **THEN** no aparece en el extracto ni afecta el Balance

### Requirement: Odoo no disponible
Si Odoo no responde, la vista SHALL mostrar el banner de Odoo no disponible, sin filas ni saldos, y permitir reintentar.

#### Scenario: Odoo caído
- **WHEN** el usuario abre el extracto y Odoo no responde
- **THEN** ve el banner de Odoo no disponible y ninguna cifra

### Requirement: Uso en celular
La vista SHALL poder usarse en un ancho de 375 px, con scroll horizontal de la tabla y la columna Fecha fija.

#### Scenario: Celular
- **WHEN** el usuario abre el extracto en un celular de 375 px de ancho
- **THEN** puede elegir diario y período y recorrer todas las columnas con scroll horizontal
