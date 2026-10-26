# Employee Auth & RBAC — Design Spec

**Date:** 2026-07-20  
**Status:** Approved

## Overview

Replace the current single-user env-var login with a full employee authentication system. Introduces role-based access control (RBAC) and audit trail tracking (who created and confirmed each Order/Inventory).

## Roles

| Role | Description |
|---|---|
| ADMIN | Full access. Created via seed. Can manage all roles. |
| MANAGER | Can confirm to Odoo. Can manage EMPLEADO and MANAGER accounts. Cannot touch ADMIN accounts. |
| EMPLEADO | Can create orders/inventories but cannot confirm them to Odoo. No access to employee management. |

## Database Schema

### New model: `Employee`

```prisma
enum Role {
  ADMIN
  MANAGER
  EMPLEADO
}

model Employee {
  id           Int      @id @default(autoincrement())
  username     String   @unique
  passwordHash String   @map("password_hash")
  name         String
  role         Role     @default(EMPLEADO)
  active       Boolean  @default(true)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  createdOrders      Order[]     @relation("OrderCreatedBy")
  confirmedOrders    Order[]     @relation("OrderConfirmedBy")
  createdInventories Inventory[] @relation("InventoryCreatedBy")
  confirmedInventories Inventory[] @relation("InventoryConfirmedBy")

  @@map("employees")
}
```

**Soft delete:** Employees are never hard-deleted. Setting `active = false` disables the account and preserves audit trail FK integrity.

### Changes to `Order`

Add two nullable FK columns:

```prisma
createdById    Int? @map("created_by_id")
confirmedById  Int? @map("confirmed_by_id")

createdBy   Employee? @relation("OrderCreatedBy",    fields: [createdById],   references: [id])
confirmedBy Employee? @relation("OrderConfirmedBy",  fields: [confirmedById], references: [id])
```

### Changes to `Inventory`

Same two columns as Order:

```prisma
createdById    Int? @map("created_by_id")
confirmedById  Int? @map("confirmed_by_id")

createdBy   Employee? @relation("InventoryCreatedBy",   fields: [createdById],   references: [id])
confirmedBy Employee? @relation("InventoryConfirmedBy", fields: [confirmedById], references: [id])
```

Nullable on both models to preserve compatibility with existing records.

## Auth Flow

### Login

1. `POST /api/auth/login` receives `{ username, password }`
2. Query `employees` table by username
3. Assert `active === true` — return 401 if inactive
4. `bcrypt.compare(password, employee.passwordHash)` — return 401 if mismatch
5. Sign JWT with payload `{ employeeId, username, name, role }` using existing jose/HS256/365d/httpOnly cookie setup
6. Remove `APP_USER` / `APP_PASSWORD` env var dependency

### Token verification

Extend `src/lib/auth.ts:verifyToken()` to return the full typed payload:

```ts
type TokenPayload = {
  employeeId: number
  username: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'EMPLEADO'
}
```

### Role guard helper

New helper in `src/lib/auth.ts`:

```ts
function requireRole(payload: TokenPayload, roles: Role[]): void
// throws 403 response if payload.role not in roles
```

Used in all protected API routes that need role checks beyond basic auth.

## Permissions Matrix

| Operation | EMPLEADO | MANAGER | ADMIN |
|---|---|---|---|
| Create order/inventory | ✅ | ✅ | ✅ |
| Confirm to Odoo | ❌ | ✅ | ✅ |
| View /empleados | ❌ | ✅ | ✅ |
| Create/edit EMPLEADO | ❌ | ✅ | ✅ |
| Create/edit MANAGER | ❌ | ✅ | ✅ |
| Create/edit ADMIN | ❌ | ❌ | ✅ |
| Deactivate any employee | ❌ | ✅* | ✅ |

*Manager cannot deactivate ADMIN accounts.

## API Routes

### Auth

- `POST /api/auth/login` — updated to use DB lookup + bcrypt

### Employees (all require MANAGER or ADMIN)

| Method | Route | Notes |
|---|---|---|
| GET | `/api/employees` | List all employees |
| POST | `/api/employees` | Create employee |
| PUT | `/api/employees/[id]` | Edit employee |
| PATCH | `/api/employees/[id]/toggle` | Activate/deactivate |

Business rules enforced server-side:
- MANAGER cannot create/edit/deactivate an ADMIN account
- Username must be unique
- Password hashed with bcrypt (cost 12) before storage
- Password field optional on PUT — omit to keep existing hash

## Audit Trail

When an Order or Inventory is **created**: set `createdById` from JWT `employeeId`.  
When an Order or Inventory is **confirmed to Odoo**: set `confirmedById` from JWT `employeeId`.  
Both fields remain `null` for records created before this feature.

## UI

### Sidebar

- Show logged-in employee name + role badge at bottom
- Add "Empleados" nav link — visible only to MANAGER and ADMIN

### `/empleados` page

- Table columns: Nombre, Username, Rol, Estado (Activo/Inactivo), Acciones
- "Nuevo empleado" button opens create modal
- Row actions: Editar (opens edit modal), Activar/Desactivar toggle
- MANAGER sees all employees but cannot edit/deactivate ADMINs (actions disabled with tooltip)

### Create/Edit modal

- Fields: Nombre (text), Username (text), Rol (select), Contraseña (required on create, optional on edit)
- MANAGER role select options: EMPLEADO, MANAGER only (no ADMIN option rendered)
- ADMIN role select options: EMPLEADO, MANAGER, ADMIN

### Confirm button guard

- In `ConfirmModal.tsx` (orders): disable confirm button + tooltip "Sin permisos" if role = EMPLEADO
- In `src/app/(app)/inventario/[id]/page.tsx`: same guard on the inventory confirm action

## Seed

File: `prisma/seed.ts`

- Reads `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` from env
- Creates ADMIN employee if username does not already exist (idempotent)
- Run with: `pnpm prisma db seed`

Add to `package.json`:
```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

## Files Impacted

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add Employee model, Role enum, FK fields on Order/Inventory |
| `prisma/migrations/...` | New migration for schema changes |
| `prisma/seed.ts` | New — admin seed script |
| `src/lib/auth.ts` | Extend TokenPayload type, add requireRole helper |
| `src/app/api/auth/login/route.ts` | DB lookup + bcrypt instead of env vars |
| `src/app/api/employees/route.ts` | New — GET list, POST create |
| `src/app/api/employees/[id]/route.ts` | New — PUT edit |
| `src/app/api/employees/[id]/toggle/route.ts` | New — PATCH activate/deactivate |
| `src/components/layout/Sidebar.tsx` | Employee name/role display, Empleados nav link |
| `src/components/orders/ConfirmModal.tsx` | Disable confirm if EMPLEADO |
| `src/app/(app)/inventario/[id]/page.tsx` | Disable confirm if EMPLEADO |
| `src/app/(app)/empleados/page.tsx` | New — employee management page |

## Out of Scope

- Password reset flow
- Session invalidation / token blacklist
- Activity log / full audit history UI
- Odoo employee sync
