# empleados Specification

## Purpose
Alta, edición y activación de los empleados que usan la app. Pantalla `/empleados`, API `src/app/api/employees/**`, modelo `Employee`.

## Requirements

### Requirement: Acceso a la gestión de empleados
Solo `ADMIN` y `MANAGER` SHALL listar, crear, editar y activar/desactivar empleados.

#### Scenario: Listado
- **WHEN** un `ADMIN` o `MANAGER` abre `/empleados`
- **THEN** ve todos los empleados (activos e inactivos) sin datos de contraseña

#### Scenario: Otro rol entra a la pantalla
- **WHEN** un `EMPLEADO` o `EMPLEADO_BASICO` intenta abrir `/empleados`
- **THEN** es redirigido fuera de la pantalla

### Requirement: Alta de empleado
El sistema SHALL crear un empleado con `username` único, `name`, `role` y contraseña guardada con bcrypt (costo 12). El empleado nace activo.

#### Scenario: Alta válida
- **WHEN** se envían usuario, contraseña, nombre y rol
- **THEN** el empleado queda creado y activo

#### Scenario: Faltan campos
- **WHEN** falta alguno de usuario, contraseña, nombre o rol
- **THEN** el sistema responde 400 `"Faltan campos requeridos"`

#### Scenario: Usuario repetido
- **WHEN** el `username` ya existe
- **THEN** el sistema responde 409 `"El username ya existe"`

### Requirement: Edición de empleado
El sistema SHALL permitir cambiar usuario, nombre y rol, y opcionalmente la contraseña (vacía = se mantiene).

#### Scenario: Cambio de usuario a uno existente
- **WHEN** se cambia el `username` por uno que ya usa otro empleado
- **THEN** el sistema responde 409

### Requirement: Manager no administra administradores
Un `MANAGER` SHALL NOT crear, editar, activar ni desactivar empleados `ADMIN`, ni asignar el rol `ADMIN`.

#### Scenario: Manager asigna rol Admin
- **WHEN** un `MANAGER` crea o edita un empleado con rol `ADMIN`
- **THEN** el sistema responde 403 y el selector de rol de la UI no ofrece "Admin"

#### Scenario: Manager actúa sobre un Admin
- **WHEN** un `MANAGER` intenta editar o desactivar a un `ADMIN`
- **THEN** el sistema responde 403 y la UI no muestra esas acciones

### Requirement: Activar y desactivar
El sistema SHALL alternar el estado `active` de un empleado. Un empleado inactivo no puede iniciar sesión nueva. Nadie puede cambiar el estado de su propia cuenta.

#### Scenario: Desactivar la propia cuenta
- **WHEN** un usuario intenta alternar su propio estado
- **THEN** el sistema responde 400 `"No podés desactivar tu propia cuenta"` y la UI deshabilita el control
