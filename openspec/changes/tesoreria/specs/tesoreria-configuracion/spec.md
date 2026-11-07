## Purpose

Permitir que `ADMIN` defina qué diarios y cuentas de Odoo usa Tesorería y qué cuentas fijas aplican en sus operaciones, sin cambiar código.

## ADDED Requirements

### Requirement: Diarios habilitados y su orden
`ADMIN` SHALL elegir qué diarios de Odoo en ARS (efectivo, banco, billeteras y Cheques de Terceros) usa Tesorería y en qué orden. Esos diarios SHALL ser las columnas de la Vista General y los únicos ofrecidos en las operaciones.

#### Scenario: Habilitar y ordenar diarios
- **WHEN** `ADMIN` habilita "Efectivo Administracion", "Banco Bica" y "Cheques de Terceros" en ese orden y guarda
- **THEN** la Vista General muestra esas tres columnas en ese orden y las operaciones solo ofrecen esos diarios

#### Scenario: Diario archivado en Odoo
- **WHEN** un diario habilitado se archiva en Odoo
- **THEN** la configuración lo marca como inválido y deja de ofrecerse en las operaciones

#### Scenario: Diario en USD
- **WHEN** `ADMIN` busca diarios para habilitar
- **THEN** los diarios en USD no se ofrecen

### Requirement: Listas de cuentas por uso
`ADMIN` SHALL mantener tres listas de cuentas de Odoo: Gasto, Ingreso y Socios. Gasto e Ingreso SHALL precargarse con las cuentas usadas en los diarios habilitados; Socios con las cuentas de retiro de socios (3.3.1 y 3.3.2).

#### Scenario: Primera apertura de la configuración
- **WHEN** `ADMIN` abre la configuración y las listas están vacías
- **THEN** la app propone las cuentas usadas como contrapartida en los diarios habilitados y `ADMIN` confirma cuáles quedan

#### Scenario: Cuenta fuera de la lista
- **WHEN** el servidor recibe un Gasto con una cuenta que no está en la lista de Gasto
- **THEN** rechaza la operación con un error de validación

### Requirement: Cuentas y diarios fijos
`ADMIN` SHALL configurar: cuenta de ganancia y cuenta de pérdida del cambio de cheques, cuenta puente de movimientos entre diarios (default 6.1 Movimiento entre Bancos), diario para los asientos de ajuste (cambio de cheques y Gasto con cheque propio), diario de compras con comprobantes (factura A), diario de compras sin comprobantes (factura B y C) y diario de efectivo por defecto (default Efectivo Administracion).

#### Scenario: Cambio de cheques sin cuentas configuradas
- **WHEN** falta la cuenta de ganancia o de pérdida y un usuario confirma un Cambio de cheque con diferencia distinta de 0
- **THEN** la app no ejecuta y avisa que falta configurar la cuenta, indicando que la configura un Admin

### Requirement: Configuración exclusiva de Admin
La configuración de Tesorería SHALL ser una pestaña "Tesorería" de la sección Configuración existente (`/configuracion`), después de "Promociones bancarias", visible y editable solo por `ADMIN`. `TESORERO` SHALL poder leer la configuración vigente para operar.

#### Scenario: Pestaña en Configuración
- **WHEN** un `ADMIN` abre Configuración
- **THEN** ve la pestaña "Tesorería" después de "Promociones bancarias"; un `MANAGER` no la ve

#### Scenario: Tesorero intenta guardar configuración
- **WHEN** un `TESORERO` envía un cambio de configuración a la API
- **THEN** recibe 403 `{"error":"Sin permisos"}`
