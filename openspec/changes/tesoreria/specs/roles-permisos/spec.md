## MODIFIED Requirements

### Requirement: Roles del sistema
El sistema SHALL tener cinco roles, uno por empleado: `ADMIN` ("Admin"), `MANAGER` ("Manager"), `EMPLEADO` ("Encargado"), `EMPLEADO_BASICO` ("Empleado") y `TESORERO` ("Tesorero"). Los permisos se definen por lista explícita de roles, no por nivel jerárquico.

#### Scenario: Etiqueta visible del rol
- **WHEN** se muestra el rol de un empleado en la UI
- **THEN** se usa la etiqueta de `ROLE_LABELS` (`src/lib/auth.ts`)

#### Scenario: Asignar el rol Tesorero
- **WHEN** un `ADMIN` crea o edita un empleado
- **THEN** el selector de rol ofrece "Tesorero" junto a los demás roles

#### Scenario: Manager y cuentas de Tesorero
- **WHEN** un `MANAGER` intenta crear un empleado `TESORERO`, asignar ese rol o editar, cambiar la contraseña o activar/desactivar un empleado `TESORERO`
- **THEN** la UI no ofrece la acción y la API responde 403, igual que con empleados `ADMIN`

### Requirement: Administración restringida a Admin y Manager
`ADMIN` y `MANAGER` SHALL acceder a todas las secciones, incluidas Empleados y Configuración, salvo Tesorería, que solo `ADMIN` ve entre los dos. Limpiar la caché de Odoo (`POST /api/cache/clear`) SHALL ser exclusivo de `ADMIN`.

#### Scenario: Menú de administración
- **WHEN** un `ADMIN` o `MANAGER` abre la app
- **THEN** el menú muestra además "Empleados" y "Configuración"

#### Scenario: Manager sin Tesorería
- **WHEN** un `MANAGER` abre la app
- **THEN** el menú no muestra "Tesorería"

## ADDED Requirements

### Requirement: Tesorero limitado a Tesorería
El rol `TESORERO` SHALL acceder solo al módulo de Tesorería, sin su configuración.

#### Scenario: Navegación de tesorero
- **WHEN** un `TESORERO` abre la app
- **THEN** el menú muestra solo "Tesorería" y la raíz `/` lo lleva a `/tesoreria`

#### Scenario: Tesorero pide otra sección
- **WHEN** un `TESORERO` pide una página fuera de `/tesoreria` (incluida `/configuracion`)
- **THEN** el proxy lo redirige a `/tesoreria`

#### Scenario: Tesorero llama a otra API
- **WHEN** un `TESORERO` llama a una API fuera de `/api/tesoreria/**` y `/api/auth/*`, o modifica la configuración de Tesorería
- **THEN** el sistema responde 403 `{"error":"Sin permisos"}`

### Requirement: Acceso a Tesorería
Tesorería (`/tesoreria/**` y `/api/tesoreria/**`) SHALL estar disponible solo para `TESORERO` y `ADMIN`. La Configuración de Tesorería SHALL ser exclusiva de `ADMIN`.

#### Scenario: Rol sin acceso pide Tesorería
- **WHEN** un `MANAGER`, `EMPLEADO` o `EMPLEADO_BASICO` pide `/tesoreria`
- **THEN** el proxy lo redirige a su pantalla de inicio (o responde 403 en `/api/tesoreria/**`)

#### Scenario: Admin en Tesorería
- **WHEN** un `ADMIN` abre la app
- **THEN** el menú muestra "Tesorería" y en Configuración ve la pestaña "Tesorería"
