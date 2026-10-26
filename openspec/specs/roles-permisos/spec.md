# roles-permisos Specification

## Purpose
Definir qué puede ver y hacer cada rol. Los permisos se aplican en tres capas que MUST mantenerse alineadas: `src/proxy.ts` (bloqueo por prefijo de ruta), `withAuth(handler, { roles })` en cada ruta API y los filtros de `src/components/layout/Sidebar.tsx`. La matriz completa ruta por ruta está en `docs/arquitectura.md`.

## Requirements

### Requirement: Roles del sistema
El sistema SHALL tener cuatro roles, uno por empleado: `ADMIN` ("Admin"), `MANAGER` ("Manager"), `EMPLEADO` ("Encargado") y `EMPLEADO_BASICO` ("Empleado"). Los permisos se definen por lista explícita de roles, no por nivel jerárquico.

#### Scenario: Etiqueta visible del rol
- **WHEN** se muestra el rol de un empleado en la UI
- **THEN** se usa la etiqueta de `ROLE_LABELS` (`src/lib/auth.ts`)

### Requirement: Empleado básico limitado a consulta
El rol `EMPLEADO_BASICO` SHALL acceder solo a Existencias y Promociones vigentes.

#### Scenario: Navegación de empleado básico
- **WHEN** un `EMPLEADO_BASICO` abre la app
- **THEN** el menú muestra solo "Existencias" y "Promociones"

#### Scenario: Empleado básico pide otra sección
- **WHEN** un `EMPLEADO_BASICO` pide una página fuera de `/existencias` o `/promociones-vigentes`
- **THEN** el proxy lo redirige a `/existencias`

#### Scenario: Empleado básico llama a otra API
- **WHEN** un `EMPLEADO_BASICO` llama a una API fuera de `/api/existencias`, `/api/config/vigentes`, `/api/search-history` y `/api/auth/*`
- **THEN** el sistema responde 403 `{"error":"Sin permisos"}`

### Requirement: Encargado opera compras e inventario
El rol `EMPLEADO` SHALL operar órdenes de compra, conteos de inventario e historial Odoo, sin gestionar empleados ni configuración comercial, sin confirmar inventarios y sin usar las funciones de IA (descripción, sugerencia de HEX).

#### Scenario: Encargado intenta gestionar empleados
- **WHEN** un `EMPLEADO` pide `/empleados`
- **THEN** el proxy lo redirige a `/orders/new` (o responde 403 en `/api/employees`)

#### Scenario: Encargado intenta confirmar un inventario
- **WHEN** un `EMPLEADO` llama a `POST /api/inventario/[id]/confirm`
- **THEN** el sistema responde 403

### Requirement: Administración restringida a Admin y Manager
`ADMIN` y `MANAGER` SHALL acceder a todas las secciones, incluidas Empleados y Configuración. Limpiar la caché de Odoo (`POST /api/cache/clear`) SHALL ser exclusivo de `ADMIN`.

#### Scenario: Menú de administración
- **WHEN** un `ADMIN` o `MANAGER` abre la app
- **THEN** el menú muestra además "Empleados" y "Configuración"

### Requirement: Rechazo uniforme por rol en la API
Toda ruta API con restricción de rol SHALL responder 403 `{"error":"Sin permisos"}` cuando el rol del token no está en la lista permitida, y 401 `{"error":"No autenticado"}` sin sesión.

#### Scenario: Rol no permitido
- **WHEN** un usuario autenticado llama a una ruta cuyo `withAuth` no incluye su rol
- **THEN** recibe 403 sin que se ejecute el handler
