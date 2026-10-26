# autenticacion Specification

## Purpose
Identificar al empleado que usa la app mediante usuario y contraseña locales (tabla `employees`) y mantener su sesión con un JWT en cookie. Implementación: `src/app/api/auth/**`, `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/withAuth.ts`, `src/components/auth/LoginForm.tsx`.

## Requirements

### Requirement: Login con credenciales locales
El sistema SHALL validar usuario y contraseña contra la tabla `employees` (hash bcrypt) y SHALL rechazar cualquier fallo con el mismo mensaje genérico, sin revelar si el usuario existe o está inactivo.

#### Scenario: Credenciales válidas
- **WHEN** un empleado activo envía usuario y contraseña correctos a `POST /api/auth/login`
- **THEN** el sistema emite un JWT HS256 con `employeeId`, `username`, `name` y `role`, válido 365 días
- **AND** lo guarda en la cookie `auth_token` (httpOnly, sameSite lax, `secure` en producción, path `/`)
- **AND** la UI redirige a `/existencias`, sin importar el rol

#### Scenario: Credenciales inválidas o empleado inactivo
- **WHEN** falta el usuario o la contraseña, el usuario no existe, está inactivo o la contraseña no coincide
- **THEN** el sistema responde 401 con `"Credenciales inválidas"`

### Requirement: Logout
El sistema SHALL cerrar la sesión borrando la cookie `auth_token`. El token no se invalida del lado servidor.

#### Scenario: Cerrar sesión
- **WHEN** el usuario pulsa "Cerrar sesión" en el menú lateral
- **THEN** se llama a `POST /api/auth/logout`, la cookie se borra y la UI navega a `/login`

### Requirement: Protección de rutas
El middleware `src/proxy.ts` SHALL exigir un JWT válido en toda ruta salvo `/login`, `/api/auth/*` y assets estáticos. La validez se determina solo por la firma y expiración del token, sin consultar la base de datos.

#### Scenario: Página sin sesión
- **WHEN** un usuario sin token válido pide una página
- **THEN** es redirigido a `/login?from=<ruta>` y la cookie inválida se borra

#### Scenario: API sin sesión
- **WHEN** se llama a una ruta `/api/*` protegida sin token válido
- **THEN** el sistema responde 401 JSON `{"error":"No autenticado"}` sin redirigir

### Requirement: Empleado actual
El sistema SHALL exponer los datos del empleado logueado en `GET /api/auth/me`, tomados del token.

#### Scenario: Consultar empleado actual
- **WHEN** un usuario autenticado llama a `/api/auth/me`
- **THEN** recibe `employeeId`, `username`, `name` y `role`
