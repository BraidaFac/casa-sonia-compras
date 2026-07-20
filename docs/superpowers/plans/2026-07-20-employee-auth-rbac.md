# Employee Auth & RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace env-var login with employee-based auth (bcrypt + JWT), add RBAC with three roles (ADMIN/MANAGER/EMPLEADO), and record who created and confirmed each Order/Inventory.

**Architecture:** JWT payload extended to carry `{ employeeId, username, name, role }`. New `getRequestPayload()` helper replaces `authenticateRequest()` in routes that need the identity. `requireRole()` guard used in confirm routes and employee CRUD routes. Soft-deleted employees preserve FK integrity for audit trail.

**Tech Stack:** Prisma 7 (MySQL via MariaDB adapter), bcryptjs, jose (existing), Mantine 9, TanStack Query 5, Next.js App Router.

## Global Constraints

- All commands run from `casa-sonia-compras/`
- Prisma client import: `import { prisma } from "@/lib/prisma"` (generated at `prisma/generated/client`)
- Path alias `@/*` → `src/*`
- Mantine 9 dark theme, amber primary color (`var(--mantine-color-amber-6)`)
- Inline styles consistent with existing components (see `Sidebar.tsx`)
- No test framework — verify manually via `pnpm dev`
- bcrypt cost factor: 12
- JWT: HS256, 365d, httpOnly cookie `auth_token`
- Soft delete only — never hard-delete employees

---

### Task 1: DB Schema, Migration, and Seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `Employee` Prisma model with fields `{ id, username, passwordHash, name, role, active, createdAt, updatedAt }`; `Role` enum `ADMIN | MANAGER | EMPLEADO`; `Order.createdById`, `Order.confirmedById`, `Inventory.createdById`, `Inventory.confirmedById` (all `Int?`)

- [ ] **Step 1: Install bcryptjs**

```bash
pnpm add bcryptjs
pnpm add -D @types/bcryptjs tsx
```

Expected: packages added without errors.

- [ ] **Step 2: Update prisma/schema.prisma**

Replace the entire file contents:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "./generated/client"
}

datasource db {
  provider = "mysql"
}

enum OrderStatus {
  DRAFT
  CONFIRMED
  ERROR
}

enum InventoryStatus {
  BORRADOR
  CONFIRMADO
}

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

  createdOrders        Order[]     @relation("OrderCreatedBy")
  confirmedOrders      Order[]     @relation("OrderConfirmedBy")
  createdInventories   Inventory[] @relation("InventoryCreatedBy")
  confirmedInventories Inventory[] @relation("InventoryConfirmedBy")

  @@map("employees")
}

model Order {
  id            Int         @id @default(autoincrement())
  status        OrderStatus @default(DRAFT)
  odooOrderId   Int?        @map("odoo_order_id")
  odooOrderName String?     @map("odoo_order_name")
  errorDetail   String?     @db.Text @map("error_detail")
  supplierId    Int         @map("supplier_id")
  supplierName  String      @map("supplier_name")
  brandId       Int?        @map("brand_id")
  brandName     String?     @map("brand_name")
  compradoraIds  Json        @default("[]") @map("compradora_ids")
  date          String
  warehouseIds  Json        @map("warehouse_ids")
  articles      Json
  printColumns  Json        @map("print_columns")
  printValues   Json        @map("print_values")
  createdById   Int?        @map("created_by_id")
  confirmedById Int?        @map("confirmed_by_id")
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  createdBy   Employee? @relation("OrderCreatedBy",   fields: [createdById],   references: [id])
  confirmedBy Employee? @relation("OrderConfirmedBy", fields: [confirmedById], references: [id])

  @@map("orders")
}

model Inventory {
  id                  Int             @id @default(autoincrement())
  status              InventoryStatus @default(BORRADOR)
  warehouseId         Int             @map("warehouse_id")
  warehouseName       String          @map("warehouse_name")
  name                String?
  countDate           String?         @map("count_date")
  accountingDate      String?         @map("accounting_date")
  articles            Json            @default("[]")
  confirmationSummary Json?           @map("confirmation_summary")
  odooRef             String?         @map("odoo_ref")
  errorDetail         String?         @db.Text @map("error_detail")
  createdById         Int?            @map("created_by_id")
  confirmedById       Int?            @map("confirmed_by_id")
  createdAt           DateTime        @default(now()) @map("created_at")
  updatedAt           DateTime        @updatedAt @map("updated_at")

  createdBy   Employee? @relation("InventoryCreatedBy",   fields: [createdById],   references: [id])
  confirmedBy Employee? @relation("InventoryConfirmedBy", fields: [confirmedById], references: [id])

  @@map("inventories")
}
```

- [ ] **Step 3: Run migration**

```bash
pnpm db:migrate --name employee_auth
```

Expected: migration files created in `prisma/migrations/`, schema applied to DB. `pnpm db:generate` runs automatically.

- [ ] **Step 4: Write prisma/seed.ts**

```ts
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/client";

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must be set");
  }

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.employee.findUnique({ where: { username } });
  if (existing) {
    console.log(`Admin "${username}" already exists — skipping.`);
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.employee.create({
    data: { username, passwordHash, name: "Admin", role: "ADMIN" },
  });

  console.log(`Admin "${username}" created.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 5: Add seed config to package.json**

In `package.json`, add a top-level `"prisma"` key (alongside `"scripts"`, `"dependencies"`, etc.):

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
},
```

- [ ] **Step 6: Add SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD to .env, then run seed**

```bash
pnpm prisma db seed
```

Expected output: `Admin "<username>" created.`

Run a second time — expected: `Admin "<username>" already exists — skipping.`

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts package.json pnpm-lock.yaml
git commit -m "feat(auth): add Employee model, Role enum, audit FKs on Order/Inventory, seed script"
```

---

### Task 2: Auth Layer — Extended Payload, Login Route, /api/auth/me

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/me/route.ts`

**Interfaces:**
- Consumes: `Employee` model from Task 1
- Produces:
  - `TokenPayload` type exported from `@/lib/auth`
  - `getRequestPayload(request): Promise<TokenPayload | null>` exported from `@/lib/auth`
  - `requireRole(payload, roles): NextResponse | null` exported from `@/lib/auth`
  - `GET /api/auth/me` → `{ employeeId, username, name, role }`

- [ ] **Step 1: Rewrite src/lib/auth.ts**

```ts
import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type TokenPayload = {
  employeeId: number;
  username: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "EMPLEADO";
};

export async function verifyToken(token: string): Promise<TokenPayload> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as TokenPayload;
}

export async function getRequestPayload(
  request: NextRequest,
): Promise<TokenPayload | null> {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function authenticateRequest(request: NextRequest): Promise<boolean> {
  return (await getRequestPayload(request)) !== null;
}

/**
 * Returns a 403 NextResponse if payload.role is not in roles, otherwise null.
 * Usage: const denied = requireRole(payload, ["ADMIN", "MANAGER"]); if (denied) return denied;
 */
export function requireRole(
  payload: TokenPayload,
  roles: Array<"ADMIN" | "MANAGER" | "EMPLEADO">,
): NextResponse | null {
  if (!roles.includes(payload.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  return null;
}
```

- [ ] **Step 2: Rewrite src/app/api/auth/login/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const employee = await prisma.employee.findUnique({ where: { username } });

  if (!employee || !employee.active) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, employee.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({
    employeeId: employee.id,
    username: employee.username,
    name: employee.name,
    role: employee.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("365d")
    .setIssuedAt()
    .sign(secret);

  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return response;
}
```

- [ ] **Step 3: Create src/app/api/auth/me/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getRequestPayload } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const payload = await getRequestPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    employeeId: payload.employeeId,
    username: payload.username,
    name: payload.name,
    role: payload.role,
  });
}
```

- [ ] **Step 4: Verify login works**

Run `pnpm dev`. Navigate to `/login`. Log in with the seeded admin credentials. Verify redirect to `/orders/new` succeeds.

Open devtools → Application → Cookies → confirm `auth_token` is set (httpOnly).

Fetch `http://localhost:3000/api/auth/me` in the browser — should return `{ employeeId, username, name, role }`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/login/route.ts src/app/api/auth/me/route.ts
git commit -m "feat(auth): extend JWT payload with employee identity, add requireRole helper, add /api/auth/me"
```

---

### Task 3: Employee API Routes

**Files:**
- Create: `src/app/api/employees/route.ts`
- Create: `src/app/api/employees/[id]/route.ts`
- Create: `src/app/api/employees/[id]/toggle/route.ts`

**Interfaces:**
- Consumes: `getRequestPayload`, `requireRole` from `@/lib/auth` (Task 2); `Employee` model (Task 1)
- Produces:
  - `GET /api/employees` → `Array<{ id, username, name, role, active, createdAt }>`
  - `POST /api/employees` body `{ username, password, name, role }` → `{ id, username, name, role, active, createdAt }` 201
  - `PUT /api/employees/[id]` body `{ username, name, role, password? }` → updated employee 200
  - `PATCH /api/employees/[id]/toggle` → updated employee 200

- [ ] **Step 1: Create src/app/api/employees/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getRequestPayload, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export async function GET(request: NextRequest) {
  const payload = await getRequestPayload(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireRole(payload, ["ADMIN", "MANAGER"]);
  if (denied) return denied;

  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    select: SELECT,
  });

  return NextResponse.json(employees);
}

export async function POST(request: NextRequest) {
  const payload = await getRequestPayload(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireRole(payload, ["ADMIN", "MANAGER"]);
  if (denied) return denied;

  const { username, password, name, role } = await request.json();

  if (!username || !password || !name || !role) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  if (payload.role === "MANAGER" && role === "ADMIN") {
    return NextResponse.json(
      { error: "Sin permisos para crear empleados con rol ADMIN" },
      { status: 403 },
    );
  }

  const existing = await prisma.employee.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "El username ya existe" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const employee = await prisma.employee.create({
    data: { username, passwordHash, name, role },
    select: SELECT,
  });

  return NextResponse.json(employee, { status: 201 });
}
```

- [ ] **Step 2: Create src/app/api/employees/[id]/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getRequestPayload, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const payload = await getRequestPayload(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireRole(payload, ["ADMIN", "MANAGER"]);
  if (denied) return denied;

  const { id } = await params;
  const empId = parseInt(id, 10);
  if (isNaN(empId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const target = await prisma.employee.findUnique({ where: { id: empId } });
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (payload.role === "MANAGER" && target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Sin permisos para editar empleados ADMIN" },
      { status: 403 },
    );
  }

  const { username, name, role, password } = await request.json();

  if (!username || !name || !role) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  if (payload.role === "MANAGER" && role === "ADMIN") {
    return NextResponse.json(
      { error: "Sin permisos para asignar rol ADMIN" },
      { status: 403 },
    );
  }

  if (username !== target.username) {
    const existing = await prisma.employee.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "El username ya existe" }, { status: 409 });
    }
  }

  const data: Record<string, unknown> = { username, name, role };
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 12);
  }

  const updated = await prisma.employee.update({
    where: { id: empId },
    data,
    select: SELECT,
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 3: Create src/app/api/employees/[id]/toggle/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getRequestPayload, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const payload = await getRequestPayload(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireRole(payload, ["ADMIN", "MANAGER"]);
  if (denied) return denied;

  const { id } = await params;
  const empId = parseInt(id, 10);
  if (isNaN(empId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const target = await prisma.employee.findUnique({ where: { id: empId } });
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (payload.role === "MANAGER" && target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Sin permisos para modificar empleados ADMIN" },
      { status: 403 },
    );
  }

  if (empId === payload.employeeId) {
    return NextResponse.json(
      { error: "No podés desactivar tu propia cuenta" },
      { status: 400 },
    );
  }

  const updated = await prisma.employee.update({
    where: { id: empId },
    data: { active: !target.active },
    select: SELECT,
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 4: Verify API routes manually**

With `pnpm dev` running and logged in as admin, test via browser devtools:

```js
// List employees
fetch('/api/employees').then(r => r.json()).then(console.log)

// Create employee
fetch('/api/employees', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test', password: 'test123', name: 'Test User', role: 'EMPLEADO' })
}).then(r => r.json()).then(console.log)
```

Expected: 200 list, 201 create. Repeat create — expect 409. Try creating ADMIN as MANAGER — expect 403.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/employees/
git commit -m "feat(employees): add CRUD API routes with role-based guards"
```

---

### Task 4: Audit Trail — Wire createdById and confirmedById

**Files:**
- Modify: `src/app/api/local-orders/route.ts`
- Modify: `src/app/api/inventario/route.ts`
- Modify: `src/app/api/local-orders/[id]/confirm/route.ts`
- Modify: `src/app/api/inventario/[id]/confirm/route.ts`

**Interfaces:**
- Consumes: `getRequestPayload`, `requireRole` from `@/lib/auth` (Task 2)
- Produces: `Order.createdById` set on create; `Order.confirmedById` set on confirm; same for Inventory; confirm routes return 403 for EMPLEADO role

- [ ] **Step 1: Update POST in src/app/api/local-orders/route.ts**

Find the POST handler. Replace:
```ts
export async function POST(request: NextRequest) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```

With:
```ts
export async function POST(request: NextRequest) {
  const payload = await getRequestPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```

Also update the import at the top — replace `authenticateRequest` with `getRequestPayload`:
```ts
import { getRequestPayload } from "@/lib/auth";
```

Then find the `prisma.order.create({ data: { ... } })` call and add `createdById: payload.employeeId` to the data object. The exact location is after the existing fields — add it alongside `supplierId`, `supplierName`, etc.:

```ts
const order = await prisma.order.create({
  data: {
    supplierId,
    supplierName,
    brandId: brandId ?? null,
    brandName: brandName ?? null,
    compradoraIds: compradoraIds ?? [],
    date,
    articles: strippedForDB as unknown as object[],
    warehouseIds: warehouseIds ?? [],
    printColumns: printColumns as unknown as object[],
    printValues: printValues as unknown as object,
    createdById: payload.employeeId,
  },
});
```

(Adapt the exact field list to match what is already in the file — only add `createdById: payload.employeeId`.)

- [ ] **Step 2: Update POST in src/app/api/inventario/route.ts**

Same pattern. Replace `authenticateRequest` import with `getRequestPayload`. Replace:
```ts
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```
With:
```ts
  const payload = await getRequestPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```

Add `createdById: payload.employeeId` to the `prisma.inventory.create` data:
```ts
  const inventory = await prisma.inventory.create({
    data: {
      warehouseId,
      warehouseName,
      name: name ?? null,
      countDate: countDate ?? null,
      accountingDate: accountingDate ?? null,
      articles: [] as unknown as object[],
      createdById: payload.employeeId,
    },
  });
```

- [ ] **Step 3: Update POST in src/app/api/local-orders/[id]/confirm/route.ts**

At top, update import:
```ts
import { getRequestPayload, requireRole } from "@/lib/auth";
```

Replace the auth check at the start of the handler:
```ts
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```

With:
```ts
  const payload = await getRequestPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = requireRole(payload, ["ADMIN", "MANAGER"]);
  if (denied) return denied;
```

Then in the `prisma.order.update` call that sets `status: "CONFIRMED"` (around line 146), add `confirmedById`:
```ts
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CONFIRMED",
        odooOrderId: result.purchaseOrderId,
        odooOrderName: result.purchaseOrderName,
        errorDetail: null,
        articles: updatedLocalArticles as unknown as object,
        confirmedById: payload.employeeId,
      },
    });
```

- [ ] **Step 4: Update POST in src/app/api/inventario/[id]/confirm/route.ts**

Same auth pattern as Step 3. Add `getRequestPayload` and `requireRole` import. Replace auth check with:
```ts
  const payload = await getRequestPayload(request);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = requireRole(payload, ["ADMIN", "MANAGER"]);
  if (denied) return denied;
```

Find the `prisma.inventory.update` call that sets `status: "CONFIRMADO"` and add `confirmedById: payload.employeeId` to the data object.

- [ ] **Step 5: Verify**

Log in as EMPLEADO (create one via the API from Task 3). Try to confirm an order — expect 403.  
Log in as MANAGER — confirm should succeed and DB row should have `confirmed_by_id` set.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/local-orders/route.ts src/app/api/inventario/route.ts \
        src/app/api/local-orders/[id]/confirm/route.ts \
        src/app/api/inventario/[id]/confirm/route.ts
git commit -m "feat(audit): record createdById/confirmedById on orders and inventories, block EMPLEADO from confirming"
```

---

### Task 5: Sidebar — Current Employee Display and Empleados Link

**Files:**
- Create: `src/hooks/useCurrentEmployee.ts`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/me` (Task 2)
- Produces: `useCurrentEmployee()` hook → `{ data: { employeeId, username, name, role } | undefined }`; Sidebar shows name + role chip + "Empleados" nav link for ADMIN/MANAGER

- [ ] **Step 1: Create src/hooks/useCurrentEmployee.ts**

```ts
import { useQuery } from "@tanstack/react-query";

export type CurrentEmployee = {
  employeeId: number;
  username: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "EMPLEADO";
};

async function fetchCurrentEmployee(): Promise<CurrentEmployee> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export function useCurrentEmployee() {
  return useQuery<CurrentEmployee>({
    queryKey: ["currentEmployee"],
    queryFn: fetchCurrentEmployee,
    staleTime: Infinity,
    retry: false,
  });
}
```

- [ ] **Step 2: Update src/components/layout/Sidebar.tsx**

Add import at top:
```ts
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { Users } from "lucide-react";
```

Inside the `Sidebar` component body, add after the existing state declarations:
```ts
  const { data: currentEmployee } = useCurrentEmployee();
  const canManageEmployees =
    currentEmployee?.role === "ADMIN" || currentEmployee?.role === "MANAGER";
```

Add a role label helper before the return:
```ts
  const roleLabel: Record<string, string> = {
    ADMIN: "Admin",
    MANAGER: "Manager",
    EMPLEADO: "Empleado",
  };
```

In the `<nav>` section, after the existing `NAV_ITEMS.map(...)` block and before the `<div style={{ borderTop... }}/>` divider, add:

```tsx
        {canManageEmployees && (
          <Tooltip label="Empleados" disabled={!collapsed} position="right" withArrow>
            <button
              onClick={() => router.push("/empleados")}
              style={{
                width: "100%",
                background:
                  pathname === "/empleados" || pathname.startsWith("/empleados/")
                    ? "color-mix(in srgb, var(--mantine-color-amber-6) 12%, transparent)"
                    : "none",
                border: "none",
                borderLeft:
                  pathname === "/empleados" || pathname.startsWith("/empleados/")
                    ? "2px solid var(--mantine-color-amber-6)"
                    : "2px solid transparent",
                borderRadius:
                  pathname === "/empleados" || pathname.startsWith("/empleados/") ? "0 6px 6px 0" : 6,
                padding: exp ? "10px 12px" : "10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: exp ? "flex-start" : "center",
                gap: 10,
                color:
                  pathname === "/empleados" || pathname.startsWith("/empleados/")
                    ? "var(--mantine-color-amber-4)"
                    : "var(--text2)",
                fontSize: 13,
                fontWeight:
                  pathname === "/empleados" || pathname.startsWith("/empleados/") ? 600 : 400,
                fontFamily: "var(--font-sans)",
                marginBottom: 2,
                transition: "background 150ms, color 150ms",
              }}
              onMouseEnter={(e) => {
                const active =
                  pathname === "/empleados" || pathname.startsWith("/empleados/");
                if (!active)
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--surface2, rgba(255,255,255,0.05))";
              }}
              onMouseLeave={(e) => {
                const active =
                  pathname === "/empleados" || pathname.startsWith("/empleados/");
                if (!active) (e.currentTarget as HTMLElement).style.background = "none";
              }}
            >
              <Users size={16} />
              {exp && "Empleados"}
            </button>
          </Tooltip>
        )}
```

Replace the current footer `<div>` (the one with the refresh cache button) with one that also shows employee info above it:

```tsx
      {/* Footer */}
      <div style={{ padding: exp ? "10px 16px" : "10px 8px" }}>
        {/* Current employee */}
        {currentEmployee && (
          <div
            style={{
              marginBottom: 8,
              padding: exp ? "8px 12px" : "8px",
              borderRadius: 6,
              background: "var(--surface2, rgba(255,255,255,0.04))",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--mantine-color-amber-8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--mantine-color-amber-1)",
                flexShrink: 0,
              }}
            >
              {currentEmployee.name.charAt(0).toUpperCase()}
            </div>
            {exp && (
              <div style={{ overflow: "hidden" }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text1)",
                    fontFamily: "var(--font-sans)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {currentEmployee.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--mantine-color-amber-4)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {roleLabel[currentEmployee.role] ?? currentEmployee.role}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Refresh cache button — keep existing implementation unchanged */}
        <Tooltip
          label={
            exp
              ? "Actualiza los datos de artículos, colores y talles desde Odoo. Útil si agregaste productos nuevos o modificaste atributos."
              : "Refrescar catálogo"
          }
          position="right"
          withArrow
          multiline
          w={220}
        >
          <button
            onClick={handleRefreshCache}
            disabled={isRefreshing}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              borderRadius: 6,
              padding: exp ? "8px 12px" : "8px",
              cursor: isRefreshing ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: exp ? "flex-start" : "center",
              gap: 8,
              color: "var(--text3)",
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              opacity: isRefreshing ? 0.5 : 1,
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: isRefreshing ? "spin 1s linear infinite" : "none",
              }}
            />
            {exp && (isRefreshing ? "Refrescando..." : "Refrescar")}
          </button>
        </Tooltip>
      </div>
```

- [ ] **Step 3: Verify**

`pnpm dev`. Log in. Sidebar should show the employee avatar + name + role at the bottom (expanded) or just avatar (collapsed). "Empleados" link should appear for ADMIN/MANAGER, not for EMPLEADO.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCurrentEmployee.ts src/components/layout/Sidebar.tsx
git commit -m "feat(ui): show current employee in sidebar, add Empleados nav link for managers"
```

---

### Task 6: Confirm Button Guard for EMPLEADO Role

**Files:**
- Modify: `src/components/orders/ConfirmModal.tsx`
- Modify: `src/app/(app)/inventario/[id]/page.tsx`

**Interfaces:**
- Consumes: `useCurrentEmployee` from `@/hooks/useCurrentEmployee` (Task 5)
- Produces: Confirm button disabled with tooltip "Sin permisos" when role = EMPLEADO

- [ ] **Step 1: Guard confirm in ConfirmModal.tsx**

Add import at top of `src/components/orders/ConfirmModal.tsx`:
```ts
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
```

Inside the `ConfirmModal` component (it's a named export function), add after existing state:
```ts
  const { data: currentEmployee } = useCurrentEmployee();
  const canConfirm =
    currentEmployee?.role === "ADMIN" || currentEmployee?.role === "MANAGER";
```

Find the confirm button (it calls `confirmMutation.mutate(...)` or similar). Wrap it in a `<Tooltip>`:

```tsx
<Tooltip
  label="Sin permisos para confirmar"
  disabled={canConfirm}
  withArrow
>
  <Button
    /* existing props */
    disabled={!canConfirm || /* existing disabled conditions */}
  >
    Confirmar
  </Button>
</Tooltip>
```

(Adapt to the exact JSX in the file — find the confirm/submit button and add the `disabled={!canConfirm || ...}` condition and the wrapping Tooltip.)

- [ ] **Step 2: Guard confirm in inventario/[id]/page.tsx**

Add import at top of `src/app/(app)/inventario/[id]/page.tsx`:
```ts
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
```

Inside the page component, add:
```ts
  const { data: currentEmployee } = useCurrentEmployee();
  const canConfirm =
    currentEmployee?.role === "ADMIN" || currentEmployee?.role === "MANAGER";
```

Find the "Confirmar Inventario" button (around line 1044). It's already inside a `<Tooltip>`. Update it:

```tsx
<Tooltip
  label={
    !canConfirm
      ? "Sin permisos para confirmar"
      : articles.length === 0
        ? "Agregá al menos un artículo para confirmar"
        : undefined
  }
  withArrow
  disabled={canConfirm && articles.length > 0}
>
  <Button
    /* existing props */
    disabled={!canConfirm || articles.length === 0}
    onClick={() => setResumenOpen(true)}
  >
    Confirmar Inventario
  </Button>
</Tooltip>
```

- [ ] **Step 3: Verify**

Log in as EMPLEADO. Open an order or inventory. "Confirmar" button should be visually disabled and show tooltip "Sin permisos para confirmar" on hover. Log in as MANAGER — button should be enabled.

- [ ] **Step 4: Commit**

```bash
git add src/components/orders/ConfirmModal.tsx src/app/\(app\)/inventario/\[id\]/page.tsx
git commit -m "feat(rbac): disable confirm button for EMPLEADO role with tooltip"
```

---

### Task 7: Empleados Page — Employee Management UI

**Files:**
- Create: `src/app/(app)/empleados/page.tsx`
- Create: `src/components/empleados/EmployeeModal.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/employees`, `PUT /api/employees/[id]`, `PATCH /api/employees/[id]/toggle` (Task 3); `useCurrentEmployee` (Task 5)
- Produces: Full CRUD UI at `/empleados`

- [ ] **Step 1: Create src/components/empleados/EmployeeModal.tsx**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Modal, TextInput, PasswordInput, Select, Button, Group, Stack } from "@mantine/core";
import type { CurrentEmployee } from "@/hooks/useCurrentEmployee";

export type EmployeeFormData = {
  username: string;
  name: string;
  role: string;
  password: string;
};

type Employee = {
  id: number;
  username: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
};

interface Props {
  opened: boolean;
  onClose: () => void;
  onSave: (data: EmployeeFormData) => Promise<void>;
  employee: Employee | null; // null = create mode
  currentEmployee: CurrentEmployee;
  saving: boolean;
  error: string | null;
}

export function EmployeeModal({
  opened,
  onClose,
  onSave,
  employee,
  currentEmployee,
  saving,
  error,
}: Props) {
  const isEdit = employee !== null;

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("EMPLEADO");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (opened) {
      setUsername(employee?.username ?? "");
      setName(employee?.name ?? "");
      setRole(employee?.role ?? "EMPLEADO");
      setPassword("");
    }
  }, [opened, employee]);

  const roleOptions =
    currentEmployee.role === "ADMIN"
      ? [
          { value: "EMPLEADO", label: "Empleado" },
          { value: "MANAGER", label: "Manager" },
          { value: "ADMIN", label: "Admin" },
        ]
      : [
          { value: "EMPLEADO", label: "Empleado" },
          { value: "MANAGER", label: "Manager" },
        ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave({ username, name, role, password });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? "Editar empleado" : "Nuevo empleado"}
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          <TextInput
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            autoFocus
          />
          <TextInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            required
          />
          <Select
            label="Rol"
            value={role}
            onChange={(v) => setRole(v ?? "EMPLEADO")}
            data={roleOptions}
            required
          />
          <PasswordInput
            label={isEdit ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required={!isEdit}
          />
          {error && (
            <div style={{ color: "var(--mantine-color-red-4)", fontSize: 13 }}>{error}</div>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Create src/app/(app)/empleados/page.tsx**

```tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Badge, Tooltip, Text, Group } from "@mantine/core";
import { Plus, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { EmployeeModal } from "@/components/empleados/EmployeeModal";
import type { EmployeeFormData } from "@/components/empleados/EmployeeModal";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Employee = {
  id: number;
  username: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EMPLEADO: "Empleado",
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "red",
  MANAGER: "blue",
  EMPLEADO: "gray",
};

async function fetchEmployees(): Promise<Employee[]> {
  const res = await fetch("/api/employees");
  if (!res.ok) throw new Error("Error al cargar empleados");
  return res.json();
}

export default function EmpleadosPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: currentEmployee, isLoading: loadingMe } = useCurrentEmployee();

  // Redirect if no permission
  useEffect(() => {
    if (!loadingMe && currentEmployee?.role === "EMPLEADO") {
      router.replace("/orders");
    }
  }, [currentEmployee, loadingMe, router]);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
    enabled: !!currentEmployee && currentEmployee.role !== "EMPLEADO",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (data: EmployeeFormData & { id?: number }) => {
      const { id, ...body } = data;
      const url = id ? `/api/employees/${id}` : "/api/employees";
      const method = id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error al guardar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setModalOpen(false);
      setEditTarget(null);
      setModalError(null);
    },
    onError: (e: Error) => {
      setModalError(e.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/employees/${id}/toggle`, { method: "PATCH" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  function openCreate() {
    setEditTarget(null);
    setModalError(null);
    setModalOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditTarget(emp);
    setModalError(null);
    setModalOpen(true);
  }

  async function handleSave(data: EmployeeFormData) {
    saveMutation.mutate({ ...data, id: editTarget?.id });
  }

  function canActOn(emp: Employee): boolean {
    if (!currentEmployee) return false;
    if (currentEmployee.role === "ADMIN") return true;
    // MANAGER cannot act on ADMIN accounts
    return emp.role !== "ADMIN";
  }

  if (loadingMe || isLoading) {
    return (
      <div style={{ padding: 32, color: "var(--text2)", fontFamily: "var(--font-sans)" }}>
        Cargando...
      </div>
    );
  }

  if (!currentEmployee || currentEmployee.role === "EMPLEADO") return null;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900 }}>
      <Group justify="space-between" mb={24} align="center">
        <Text
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            color: "var(--text1)",
          }}
        >
          Empleados
        </Text>
        <Button leftSection={<Plus size={16} />} onClick={openCreate}>
          Nuevo empleado
        </Button>
      </Group>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--surface2, rgba(255,255,255,0.03))",
              }}
            >
              {["Nombre", "Username", "Rol", "Estado", "Acciones"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text3)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const canAct = canActOn(emp);
              return (
                <tr
                  key={emp.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    opacity: emp.active ? 1 : 0.5,
                  }}
                >
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: 14,
                      color: "var(--text1)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {emp.name}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: 13,
                      color: "var(--text2)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {emp.username}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Badge color={ROLE_COLOR[emp.role] ?? "gray"} variant="light" size="sm">
                      {ROLE_LABEL[emp.role] ?? emp.role}
                    </Badge>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Badge color={emp.active ? "green" : "gray"} variant="dot" size="sm">
                      {emp.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Group gap={8}>
                      <Tooltip
                        label={canAct ? "Editar" : "Sin permisos"}
                        withArrow
                        position="top"
                      >
                        <button
                          onClick={() => canAct && openEdit(emp)}
                          disabled={!canAct}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: canAct ? "pointer" : "not-allowed",
                            color: canAct ? "var(--text2)" : "var(--text3)",
                            padding: 4,
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip
                        label={
                          !canAct
                            ? "Sin permisos"
                            : emp.id === currentEmployee.employeeId
                              ? "No podés desactivar tu propia cuenta"
                              : emp.active
                                ? "Desactivar"
                                : "Activar"
                        }
                        withArrow
                        position="top"
                      >
                        <button
                          onClick={() =>
                            canAct &&
                            emp.id !== currentEmployee.employeeId &&
                            toggleMutation.mutate(emp.id)
                          }
                          disabled={!canAct || emp.id === currentEmployee.employeeId}
                          style={{
                            background: "none",
                            border: "none",
                            cursor:
                              canAct && emp.id !== currentEmployee.employeeId
                                ? "pointer"
                                : "not-allowed",
                            color:
                              canAct && emp.id !== currentEmployee.employeeId
                                ? "var(--text2)"
                                : "var(--text3)",
                            padding: 4,
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {emp.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                      </Tooltip>
                    </Group>
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: "32px 16px",
                    textAlign: "center",
                    color: "var(--text3)",
                    fontSize: 13,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  No hay empleados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {currentEmployee && (
        <EmployeeModal
          opened={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditTarget(null);
            setModalError(null);
          }}
          onSave={handleSave}
          employee={editTarget}
          currentEmployee={currentEmployee}
          saving={saveMutation.isPending}
          error={modalError}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify full flow**

`pnpm dev`. Navigate to `/empleados` as ADMIN:
- Table loads with admin employee
- "Nuevo empleado" → modal opens → create MANAGER and EMPLEADO accounts → verify they appear in table
- Edit a MANAGER → change name → save → table updates
- Toggle deactivate → row shows 50% opacity + "Inactivo" badge
- Navigate to `/empleados` as EMPLEADO → should redirect to `/orders`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/empleados/ src/components/empleados/
git commit -m "feat(empleados): add employee management page with CRUD and role guards"
```

---

## Self-Review Checklist

- [x] Employee model, Role enum, FK fields on Order/Inventory — Task 1
- [x] bcrypt password storage with cost 12 — Task 1, 3
- [x] Idempotent admin seed — Task 1
- [x] JWT payload extended with employeeId, name, role — Task 2
- [x] `getRequestPayload` + `requireRole` helpers — Task 2
- [x] `/api/auth/me` endpoint — Task 2
- [x] Employee CRUD routes with MANAGER-cannot-touch-ADMIN guards — Task 3
- [x] `createdById` set on Order/Inventory creation — Task 4
- [x] `confirmedById` set on Order/Inventory confirmation — Task 4
- [x] EMPLEADO blocked from confirm routes (403) — Task 4
- [x] Sidebar shows current employee name + role — Task 5
- [x] Empleados nav link visible only to ADMIN/MANAGER — Task 5
- [x] Confirm button disabled for EMPLEADO with tooltip — Task 6
- [x] `/empleados` page with full CRUD + modal — Task 7
- [x] Redirect EMPLEADO away from `/empleados` — Task 7
- [x] Soft delete (toggle active) preserves FK integrity — Task 3, 7
