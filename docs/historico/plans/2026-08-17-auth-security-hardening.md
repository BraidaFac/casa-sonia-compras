# Auth Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate unauthenticated API access and React hydration mismatches by centralizing auth in a `withAuth` HOC wrapper and rendering the Sidebar client-only.

**Architecture:** Create `src/lib/withAuth.ts` — a higher-order function that wraps Next.js route handlers with auth + optional role checks. Replace all ad-hoc auth patterns in API routes with this wrapper. Fix Sidebar hydration by disabling SSR via `dynamic(..., { ssr: false })` and using `initialRole` (server cookie, always fresh) as the sole role source for nav filtering.

**Tech Stack:** Next.js 15 App Router, TypeScript, jose (JWT), `next/dynamic`

## Global Constraints

- App root: `casa-sonia-compras/` — all paths below are relative to this directory
- Import Prisma from `prisma/generated/client/`, not `@prisma/client`
- Cookie name is `auth_token` (not `token`) — confirmed in `src/lib/auth.ts:28`
- Run `pnpm lint` after every task — zero new errors allowed
- No test framework configured — verify manually as described in each task
- Roles hierarchy: `ADMIN` > `MANAGER` > `EMPLEADO` > `EMPLEADO_BASICO`
- `EMPLEADO_BASICO` can only access `/existencias`, `/api/existencias/*`, `/api/search-history`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/lib/withAuth.ts` | HOC wrapper: parse JWT, check role, call handler |
| Modify | `src/lib/auth.ts` | Fix `requireRole` TypeScript cast |
| Modify | `src/app/(app)/layout.tsx` | Use `dynamic(..., { ssr: false })` |
| Modify | `src/components/layout/Sidebar.tsx` | Remove `mounted` pattern, use `const role = initialRole` |
| Modify | `src/app/api/suppliers/route.ts` | Add any-auth guard |
| Modify | `src/app/api/brands/route.ts` | Add any-auth guard |
| Modify | `src/app/api/product-types/route.ts` | Add any-auth guard |
| Modify | `src/app/api/warehouses/route.ts` | Add any-auth guard |
| Modify | `src/app/api/categories/route.ts` | Add any-auth guard |
| Modify | `src/app/api/attributes/route.ts` | Add any-auth guard |
| Modify | `src/app/api/attributes/all/route.ts` | Add any-auth guard |
| Modify | `src/app/api/attributes/values/route.ts` | Add any-auth guard |
| Modify | `src/app/api/size-attributes/route.ts` | Add any-auth guard |
| Modify | `src/app/api/color-base-options/route.ts` | Add any-auth guard |
| Modify | `src/app/api/compradora/route.ts` | Add any-auth guard |
| Modify | `src/app/api/products/route.ts` | Add ADMIN\|MANAGER\|EMPLEADO guard |
| Modify | `src/app/api/products/[id]/detail/route.ts` | Add ADMIN\|MANAGER\|EMPLEADO guard |
| Modify | `src/app/api/products/[id]/images/route.ts` | Add ADMIN\|MANAGER\|EMPLEADO guard |
| Modify | `src/app/api/products/[id]/sync-images/route.ts` | Add ADMIN\|MANAGER\|EMPLEADO guard |
| Modify | `src/app/api/pdf/route.ts` | Add ADMIN\|MANAGER\|EMPLEADO guard |
| Modify | `src/app/api/orders/[id]/route.ts` | Add ADMIN\|MANAGER\|EMPLEADO guard |
| Modify | `src/app/api/orders/[id]/pdf/route.ts` | Add ADMIN\|MANAGER\|EMPLEADO guard |
| Modify | `src/app/api/description/route.ts` | Add ADMIN\|MANAGER guard |
| Modify | `src/app/api/suggest-hex/route.ts` | Add ADMIN\|MANAGER guard |
| Modify | `src/app/api/cache/clear/route.ts` | Fix cookie bug + add ADMIN guard |
| Modify | `src/app/api/inventario/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/inventario/[id]/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/inventario/[id]/confirm/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/inventario/[id]/summary-data/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/inventario/barcode/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/inventario/category-products/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/inventario/category-warmup/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/inventario/product-update/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/inventario/variant-search/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/inventario/variants/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/local-orders/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/local-orders/[id]/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/local-orders/[id]/confirm/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/local-orders/[id]/duplicate/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/local-orders/[id]/images/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/orders/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/employees/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/employees/[id]/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/employees/[id]/toggle/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/auth/me/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/existencias/barcode/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/existencias/search/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/existencias/stock/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/existencias/product/route.ts` | Standardize to withAuth |
| Modify | `src/app/api/search-history/route.ts` | Standardize to withAuth |
| Modify | `src/proxy.ts` | Block EMPLEADO from /empleados page + remove debug logs |

---

## Task 1: Sidebar hydration fix

Fix the React hydration mismatch caused by Sidebar rendering role-conditional nav items on the server. Root cause: Mantine `useLayoutEffect` fires during React 18 concurrent hydration, so the `mounted` guard pattern doesn't prevent the mismatch.

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `initialRole?: string` prop passed from layout to Sidebar (unchanged)
- Produces: Sidebar renders only on client; `role` is always `initialRole` for nav filtering

**Background:** The layout is a React Server Component that reads the `auth_token` cookie, verifies the JWT, and passes `initialRole` to Sidebar. Currently Sidebar is imported normally (renders on server too), causing hydration mismatches when role-based filtering differs. The fix: import Sidebar with `ssr: false` so it renders nothing on the server and hydrates fresh on the client. The layout already has `style={{ marginLeft: "var(--sidebar-width, 220px)" }}` with a safe 220px default — Sidebar's existing `useEffect` sets the correct value on mount.

- [ ] **Step 1: Update `src/app/(app)/layout.tsx`**

Replace the file content:

```tsx
import dynamic from "next/dynamic";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

const Sidebar = dynamic(
  () => import("@/components/layout/Sidebar").then((m) => m.Sidebar),
  { ssr: false },
);

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let initialRole: string | undefined;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (token) {
      const payload = await verifyToken(token);
      initialRole = payload.role as string;
    }
  } catch {
    // invalid token — proxy handles redirect
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <Sidebar initialRole={initialRole} />
      <main
        style={{
          marginLeft: "var(--sidebar-width, 220px)",
          transition: "margin-left 200ms ease",
          minWidth: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Remove `mounted` state from `src/components/layout/Sidebar.tsx`**

Find and delete these two lines (currently lines 49–50):
```tsx
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
```

- [ ] **Step 3: Use `initialRole` as sole role source**

Find line 55:
```tsx
  const role = mounted ? (currentEmployee?.role ?? initialRole) : initialRole;
```
Replace with:
```tsx
  const role = initialRole;
```

- [ ] **Step 4: Remove `mounted &&` guards**

Find (line ~167):
```tsx
        {mounted && NAV_ITEMS.filter((item) => {
```
Replace with:
```tsx
        {NAV_ITEMS.filter((item) => {
```

Find (line ~217):
```tsx
        {mounted && canManageEmployees && (
```
Replace with:
```tsx
        {canManageEmployees && (
```

Find (line ~330):
```tsx
        {mounted && currentEmployee && (
```
Replace with:
```tsx
        {currentEmployee && (
```

- [ ] **Step 5: Lint check**

```bash
cd casa-sonia-compras && pnpm lint
```
Expected: no new errors. `useState` is still used for other state vars — leave the import.

- [ ] **Step 6: Manual test**

```
1. pnpm dev
2. Open browser → /login → log in as ADMIN
3. Navigate to /orders → sidebar renders correctly with all nav items
4. Hard-reload (Ctrl+Shift+R) → no hydration error in DevTools console
5. Log out → log in as EMPLEADO_BASICO
6. Hard-reload → sidebar shows ONLY Existencias item, no console errors
```

- [ ] **Step 7: Commit**

```bash
cd casa-sonia-compras
git add "src/app/(app)/layout.tsx" src/components/layout/Sidebar.tsx
git commit -m "fix: eliminate Sidebar hydration mismatch via ssr:false + initialRole"
```

---

## Task 2: Create `withAuth` wrapper + fix `requireRole` TypeScript cast

**Files:**
- Create: `src/lib/withAuth.ts`
- Modify: `src/lib/auth.ts`

**Interfaces:**
- Produces: `withAuth(handler, options?)` consumed by all subsequent tasks
  - `handler: (req: NextRequest, payload: TokenPayload, context: object) => Promise<Response>`
  - `options?: { roles?: Array<"ADMIN" | "MANAGER" | "EMPLEADO" | "EMPLEADO_BASICO"> }`
  - Returns: `(req: NextRequest, context?: object) => Promise<Response>` — drop-in for Next.js route export

**Background:** `src/lib/auth.ts:49` has a TypeScript error in `requireRole`: `payload.role` can be `"EMPLEADO_BASICO"` but the `roles` array type is `Array<"ADMIN" | "MANAGER" | "EMPLEADO">`, so `includes(payload.role)` fails the type check. Fix with a `readonly string[]` cast. The `withAuth` wrapper is the new standard — future routes use it instead of the 3-line auth boilerplate.

- [ ] **Step 1: Fix `requireRole` TypeScript cast in `src/lib/auth.ts`**

Find (line 49):
```typescript
  if (!roles.includes(payload.role)) {
```
Replace with:
```typescript
  if (!(roles as readonly string[]).includes(payload.role)) {
```

- [ ] **Step 2: Create `src/lib/withAuth.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getRequestPayload } from "@/lib/auth";
import type { TokenPayload } from "@/lib/auth";

type Role = "ADMIN" | "MANAGER" | "EMPLEADO" | "EMPLEADO_BASICO";

interface WithAuthOptions {
  /** If provided, request is rejected with 403 if payload.role is not in this list */
  roles?: Role[];
}

/**
 * Wraps a Next.js route handler with authentication and optional role enforcement.
 *
 * Usage — any authenticated user:
 *   export const GET = withAuth(async (req, payload) => { ... });
 *
 * Usage — role-restricted:
 *   export const POST = withAuth(
 *     async (req, payload) => { ... },
 *     { roles: ["ADMIN", "MANAGER"] }
 *   );
 *
 * Usage — dynamic routes (e.g. /api/employees/[id]):
 *   export const GET = withAuth(async (req, payload, ctx) => {
 *     const { id } = (ctx as { params: { id: string } }).params;
 *   });
 */
export function withAuth(
  handler: (req: NextRequest, payload: TokenPayload, context: object) => Promise<Response>,
  options: WithAuthOptions = {},
): (req: NextRequest, context?: object) => Promise<Response> {
  return async (req: NextRequest, context: object = {}) => {
    const payload = await getRequestPayload(req);
    if (!payload) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (options.roles && !(options.roles as string[]).includes(payload.role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }
    return handler(req, payload, context);
  };
}
```

- [ ] **Step 3: Lint check**

```bash
cd casa-sonia-compras && pnpm lint
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd casa-sonia-compras
git add src/lib/withAuth.ts src/lib/auth.ts
git commit -m "feat: add withAuth HOC wrapper for centralized route auth"
```

---

## Task 3: Guard catalog/utility API routes (any auth)

These 11 routes have no authentication. Anyone — unauthenticated browser, external script — can call them and retrieve Odoo data.

**Files (all Modify):**
- `src/app/api/suppliers/route.ts`
- `src/app/api/brands/route.ts`
- `src/app/api/product-types/route.ts`
- `src/app/api/warehouses/route.ts`
- `src/app/api/categories/route.ts`
- `src/app/api/attributes/route.ts`
- `src/app/api/attributes/all/route.ts`
- `src/app/api/attributes/values/route.ts`
- `src/app/api/size-attributes/route.ts`
- `src/app/api/color-base-options/route.ts`
- `src/app/api/compradora/route.ts`

**Interfaces:**
- Consumes: `withAuth` from Task 2
- Produces: All GET handlers return 401 for unauthenticated requests

**Transformation pattern to apply to every file:**

Before (example — `suppliers/route.ts`):
```typescript
import { NextResponse } from "next/server";
import { odoo } from "@/lib/odoo";

export async function GET() {
  try {
    const data = await odoo.fetchAll(...);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: ... }, { status: 500 });
  }
}
```

After:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async (_req: NextRequest) => {
  try {
    const data = await odoo.fetchAll(...);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status: 500 },
    );
  }
});
```

**Rules:**
- Add `import { NextRequest } from "next/server"` if not already imported
- Add `import { withAuth } from "@/lib/withAuth"`
- Change `export async function GET()` to `export const GET = withAuth(async (_req: NextRequest) => {`
- Add closing `});` replacing the old `}`
- No roles option — any authenticated user can access catalog data
- Keep all existing handler logic unchanged
- Check for duplicate `NextRequest` import before adding

- [ ] **Step 1: Apply the pattern to `src/app/api/suppliers/route.ts`**

Full new file content:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async (_req: NextRequest) => {
  try {
    const suppliers = await odoo.fetchAll(
      "res.partner",
      [["supplier_rank", ">", 0]],
      ["id", "name"],
    );
    return NextResponse.json(suppliers);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching suppliers" },
      { status: 500 },
    );
  }
});
```

- [ ] **Step 2: Apply the same pattern to all remaining 10 files**

For each file: read the current content, then apply the `withAuth` wrap. The handler body stays identical — only the function signature changes.

Files:
- `src/app/api/brands/route.ts`
- `src/app/api/product-types/route.ts`
- `src/app/api/warehouses/route.ts`
- `src/app/api/categories/route.ts`
- `src/app/api/attributes/route.ts`
- `src/app/api/attributes/all/route.ts`
- `src/app/api/attributes/values/route.ts`
- `src/app/api/size-attributes/route.ts`
- `src/app/api/color-base-options/route.ts`
- `src/app/api/compradora/route.ts`

- [ ] **Step 3: Lint check**

```bash
cd casa-sonia-compras && pnpm lint
```
Expected: no errors

- [ ] **Step 4: Manual test**

```
1. pnpm dev
2. Open incognito window (no auth cookie)
3. In browser console: fetch('/api/suppliers').then(r => r.status)
   Expected: 401
4. Log in as any role, then in console:
   fetch('/api/suppliers').then(r => r.json()).then(d => console.log(d.length))
   Expected: number > 0
```

- [ ] **Step 5: Commit**

```bash
cd casa-sonia-compras
git add src/app/api/suppliers/route.ts src/app/api/brands/route.ts \
  src/app/api/product-types/route.ts src/app/api/warehouses/route.ts \
  src/app/api/categories/route.ts src/app/api/attributes/route.ts \
  "src/app/api/attributes/all/route.ts" "src/app/api/attributes/values/route.ts" \
  src/app/api/size-attributes/route.ts src/app/api/color-base-options/route.ts \
  src/app/api/compradora/route.ts
git commit -m "security: guard all catalog API routes with withAuth"
```

---

## Task 4: Guard product + PDF routes (ADMIN | MANAGER | EMPLEADO)

These routes handle product data and PDF generation. `EMPLEADO_BASICO` must not access them — they're part of the order creation flow.

**Files (all Modify):**
- `src/app/api/products/route.ts`
- `src/app/api/products/[id]/detail/route.ts`
- `src/app/api/products/[id]/images/route.ts`
- `src/app/api/products/[id]/sync-images/route.ts`
- `src/app/api/pdf/route.ts`
- `src/app/api/orders/[id]/route.ts`
- `src/app/api/orders/[id]/pdf/route.ts`

**Interfaces:**
- Consumes: `withAuth` from Task 2
- Produces: All handlers wrapped with `{ roles: ["ADMIN", "MANAGER", "EMPLEADO"] }`

**Pattern for single-method routes:**

Before:
```typescript
export async function GET(request: NextRequest) {
  // body uses request
}
```

After:
```typescript
export const GET = withAuth(async (req, _payload) => {
  // body uses req
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
```

**Pattern for multi-method routes:**

```typescript
export const GET = withAuth(async (req) => {
  // GET body
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });

export const POST = withAuth(async (req) => {
  // POST body
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
```

**Pattern for dynamic `[id]` routes — extract params from context:**

```typescript
export const GET = withAuth(async (req, _payload, ctx) => {
  const { id } = (ctx as { params: { id: string } }).params;
  const numericId = parseInt(id);
  // rest of body unchanged
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
```

- [ ] **Step 1: Update `src/app/api/products/route.ts`**

This file currently has no auth. Full new content:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { odoo } from "@/lib/odoo";

export const GET = withAuth(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q") || "";

  try {
    const templates = await odoo.searchRead(
      "product.template",
      ["|", ["name", "ilike", q], ["default_code", "ilike", q.toUpperCase()]],
      ["id", "name", "x_studio_referencia", "default_code", "list_price", "categ_id"],
      { limit: 20 },
    );

    const result = templates.map(
      (t: {
        id: number;
        name: string;
        x_studio_referencia?: string;
        default_code?: string;
        list_price?: number;
        categ_id?: [number, string] | false;
      }) => {
        const categoryRaw = t.categ_id;
        return {
          id: t.id,
          name: t.name,
          referencia: t.x_studio_referencia || "",
          defaultCode: t.default_code || "",
          listPrice: t.list_price || 0,
          category: categoryRaw
            ? { id: categoryRaw[0], name: categoryRaw[1], completeName: categoryRaw[1] }
            : null,
        };
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching products" },
      { status: 500 },
    );
  }
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
```

- [ ] **Step 2: Update the remaining 6 files**

For each file: read the current content, wrap each exported handler with `withAuth(..., { roles: ["ADMIN", "MANAGER", "EMPLEADO"] })`. For `[id]` routes, extract params from `ctx as { params: { id: string } }`. Keep all handler logic unchanged.

Files to update:
- `src/app/api/products/[id]/detail/route.ts`
- `src/app/api/products/[id]/images/route.ts`
- `src/app/api/products/[id]/sync-images/route.ts`
- `src/app/api/pdf/route.ts`
- `src/app/api/orders/[id]/route.ts`
- `src/app/api/orders/[id]/pdf/route.ts`

- [ ] **Step 3: Lint check**

```bash
cd casa-sonia-compras && pnpm lint
```
Expected: no errors

- [ ] **Step 4: Manual test**

```
1. pnpm dev
2. Log in as EMPLEADO_BASICO
3. In browser console: fetch('/api/products?q=camisa').then(r => r.status)
   Expected: 403
4. Log in as EMPLEADO
5. fetch('/api/products?q=camisa').then(r => r.status)
   Expected: 200
6. Log out
7. fetch('/api/products?q=camisa').then(r => r.status)
   Expected: 401
```

- [ ] **Step 5: Commit**

```bash
cd casa-sonia-compras
git add src/app/api/products/route.ts \
  "src/app/api/products/[id]/detail/route.ts" \
  "src/app/api/products/[id]/images/route.ts" \
  "src/app/api/products/[id]/sync-images/route.ts" \
  src/app/api/pdf/route.ts \
  "src/app/api/orders/[id]/route.ts" \
  "src/app/api/orders/[id]/pdf/route.ts"
git commit -m "security: guard product and PDF routes with ADMIN|MANAGER|EMPLEADO"
```

---

## Task 5: Guard AI routes + fix `cache/clear` cookie bug

Two AI routes are completely unprotected (anyone can call OpenRouter at the app's expense). `cache/clear` has a critical bug: reads cookie `"token"` instead of `"auth_token"` — the auth check always fails and cache is never cleared.

**Files (all Modify):**
- `src/app/api/description/route.ts`
- `src/app/api/suggest-hex/route.ts`
- `src/app/api/cache/clear/route.ts`

**Role assignments:**
- `description` and `suggest-hex`: `{ roles: ["ADMIN", "MANAGER"] }` — only content creators need AI
- `cache/clear`: `{ roles: ["ADMIN"] }` — only admins clear catalog cache

- [ ] **Step 1: Update `src/app/api/description/route.ts`**

Add `withAuth` import and wrap the `POST` handler. The handler body is ~80 lines of OpenRouter call — keep it all unchanged, just change the wrapper.

Replace the export and first line of the handler:
```typescript
// BEFORE:
export async function POST(request: NextRequest) {
  const body: DescriptionRequest = await request.json();
  // ...
}

// AFTER (add import at top, change export):
import { withAuth } from "@/lib/withAuth";

export const POST = withAuth(async (req: NextRequest) => {
  const body: DescriptionRequest = await req.json();
  // ... rest of body unchanged
}, { roles: ["ADMIN", "MANAGER"] });
```

Note: `SYSTEM_PROMPT` const and `buildUserMessage` function remain at module level, unchanged.

- [ ] **Step 2: Update `src/app/api/suggest-hex/route.ts`**

Same pattern:
```typescript
import { withAuth } from "@/lib/withAuth";

// Keep existing imports, remove standalone NextRequest from function signature

export const POST = withAuth(async (req: NextRequest) => {
  const { colorName } = await req.json();
  // ... rest of handler body unchanged, using req instead of request
}, { roles: ["ADMIN", "MANAGER"] });
```

- [ ] **Step 3: Fix `src/app/api/cache/clear/route.ts`**

Current broken file (bug highlighted):
```typescript
// BUG: uses cookie "token" — should be "auth_token"
const token = request.cookies.get("token")?.value;
```

`withAuth` uses `getRequestPayload` which already reads `"auth_token"` correctly. Replace the entire file:

```typescript
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { clearAttrCache } from "@/lib/productCache";

export const POST = withAuth(async () => {
  clearAttrCache();
  return NextResponse.json({ ok: true });
}, { roles: ["ADMIN"] });
```

- [ ] **Step 4: Lint check**

```bash
cd casa-sonia-compras && pnpm lint
```
Expected: no errors

- [ ] **Step 5: Manual test for cache/clear bug fix**

The Sidebar "Refrescar" button calls `POST /api/cache/clear`. It was silently failing before.

```
1. pnpm dev
2. Log in as ADMIN
3. Click "Refrescar" in the sidebar — check DevTools Network tab
   Expected: POST /api/cache/clear → 200 { ok: true }
   (Before this fix: always returned 401 due to wrong cookie name)
4. Log in as MANAGER
5. Click "Refrescar"
   Expected: 403 (MANAGER cannot clear cache)
6. Log in as ADMIN, check DevTools
   Expected: 200
```

- [ ] **Step 6: Commit**

```bash
cd casa-sonia-compras
git add src/app/api/description/route.ts src/app/api/suggest-hex/route.ts \
  src/app/api/cache/clear/route.ts
git commit -m "security: guard AI routes + fix cache/clear cookie name bug"
```

---

## Task 6: Standardize inventario routes to withAuth

10 inventario routes have inconsistent auth patterns. Standardize all to `withAuth`.

**Files (all Modify):**
- `src/app/api/inventario/route.ts`
- `src/app/api/inventario/[id]/route.ts`
- `src/app/api/inventario/[id]/confirm/route.ts`
- `src/app/api/inventario/[id]/summary-data/route.ts`
- `src/app/api/inventario/barcode/route.ts`
- `src/app/api/inventario/category-products/route.ts`
- `src/app/api/inventario/category-warmup/route.ts`
- `src/app/api/inventario/product-update/route.ts`
- `src/app/api/inventario/variant-search/route.ts`
- `src/app/api/inventario/variants/route.ts`

**Role for all inventario routes:** `["ADMIN", "MANAGER", "EMPLEADO"]`

**Pattern for existing `getRequestPayload + requireRole` routes:**

Before:
```typescript
export async function GET(request: NextRequest) {
  const payload = await getRequestPayload(request);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = requireRole(payload, ["ADMIN", "MANAGER", "EMPLEADO"]);
  if (denied) return denied;
  // ... body uses payload.employeeId etc.
}
```

After:
```typescript
export const GET = withAuth(async (req, payload) => {
  // ... body unchanged, payload guaranteed non-null
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
```

**Remove now-unused imports:** `getRequestPayload` and `requireRole` from `@/lib/auth`. Add `import { withAuth } from "@/lib/withAuth"`.

**For `[id]` routes:**
```typescript
export const GET = withAuth(async (req, payload, ctx) => {
  const { id } = (ctx as { params: { id: string } }).params;
  const numericId = parseInt(id);
  // ...
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
```

**For routes using `payload.employeeId`:** `payload` is still available as the second `withAuth` handler argument — no change needed to the body logic that references it.

- [ ] **Step 1: Update `src/app/api/inventario/route.ts`**

Read the current file. Both `GET` and `POST` have the 3-line auth boilerplate. The `POST` uses `payload.employeeId` for `createdById`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { prisma } from "@/lib/prisma";

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  // ... rest of GET body unchanged
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });

export const POST = withAuth(async (req: NextRequest, payload) => {
  const body = await req.json();
  const { warehouseId, warehouseName, name, countDate, accountingDate } = body;

  if (!warehouseId || !warehouseName) {
    return NextResponse.json(
      { error: "warehouseId, warehouseName son requeridos" },
      { status: 400 },
    );
  }

  const inventory = await prisma.inventory.create({
    data: {
      warehouseId,
      warehouseName,
      name: name ?? null,
      countDate: countDate ?? null,
      accountingDate: accountingDate ?? null,
      articles: [] as unknown as object[],
      createdById: payload.employeeId,  // payload comes from withAuth
    },
  });

  return NextResponse.json({ id: inventory.id }, { status: 201 });
}, { roles: ["ADMIN", "MANAGER", "EMPLEADO"] });
```

- [ ] **Step 2: Update the remaining 9 inventario files**

Read each file, apply the `withAuth` transformation. Keep all handler logic unchanged.

- [ ] **Step 3: Lint check**

```bash
cd casa-sonia-compras && pnpm lint
```
Expected: no errors

- [ ] **Step 4: Manual test**

```
1. pnpm dev
2. Log in as EMPLEADO_BASICO
3. fetch('/api/inventario').then(r => r.status)  → Expected: 403
4. Log in as EMPLEADO
5. fetch('/api/inventario').then(r => r.status)  → Expected: 200
```

- [ ] **Step 5: Commit**

```bash
cd casa-sonia-compras
git add src/app/api/inventario/route.ts \
  "src/app/api/inventario/[id]/route.ts" \
  "src/app/api/inventario/[id]/confirm/route.ts" \
  "src/app/api/inventario/[id]/summary-data/route.ts" \
  src/app/api/inventario/barcode/route.ts \
  src/app/api/inventario/category-products/route.ts \
  src/app/api/inventario/category-warmup/route.ts \
  src/app/api/inventario/product-update/route.ts \
  src/app/api/inventario/variant-search/route.ts \
  src/app/api/inventario/variants/route.ts
git commit -m "security: standardize inventario routes to withAuth"
```

---

## Task 7: Standardize local-orders, orders, employees, and auth/me routes

**Files (all Modify):**
- `src/app/api/local-orders/route.ts`
- `src/app/api/local-orders/[id]/route.ts`
- `src/app/api/local-orders/[id]/confirm/route.ts`
- `src/app/api/local-orders/[id]/duplicate/route.ts`
- `src/app/api/local-orders/[id]/images/route.ts`
- `src/app/api/orders/route.ts`
- `src/app/api/employees/route.ts`
- `src/app/api/employees/[id]/route.ts`
- `src/app/api/employees/[id]/toggle/route.ts`
- `src/app/api/auth/me/route.ts`

**Role assignments:**
- `local-orders/*`: `["ADMIN", "MANAGER", "EMPLEADO"]`
- `orders/route.ts` (Odoo orders list): `["ADMIN", "MANAGER", "EMPLEADO"]` (already has this role set)
- `employees/*`: `["ADMIN", "MANAGER"]` (already has this role set)
- `auth/me`: no roles option (any authenticated user)

**Special case — `employees/route.ts` POST has extra role check inside body:**

The handler body checks `if (payload.role === "MANAGER" && role === "ADMIN")` to prevent MANAGER from creating ADMIN employees. This logic stays in the handler body — `withAuth` only controls entry. `payload` is available as second arg:

```typescript
export const POST = withAuth(async (req, payload) => {
  const { username, password, name, role } = await req.json();

  if (!username || !password || !name || !role) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  if (payload.role === "MANAGER" && role === "ADMIN") {
    return NextResponse.json(
      { error: "Sin permisos para crear empleados con rol ADMIN" },
      { status: 403 },
    );
  }
  // ... rest unchanged
}, { roles: ["ADMIN", "MANAGER"] });
```

**For `local-orders/route.ts`:** `GET` and `POST` currently use `getRequestPayload` only (no `requireRole`). Wrap both with `withAuth(handler)` — no roles option. `POST` uses `payload.employeeId` for `createdById`:

```typescript
export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  // ... GET body unchanged
});

export const POST = withAuth(async (req: NextRequest, payload) => {
  const body = await req.json();
  // ...
  const order = await prisma.order.create({
    data: {
      // ...
      createdById: payload.employeeId,
    },
  });
  return NextResponse.json({ id: order.id }, { status: 201 });
});
```

- [ ] **Step 1: Update `src/app/api/local-orders/route.ts`**

Read the current file, apply `withAuth` wrap to both handlers as shown above.

- [ ] **Step 2: Update the remaining 9 files**

Read each file, apply the appropriate `withAuth` wrapping. For `[id]` routes, extract `params` from `ctx as { params: { id: string } }`. Remove unused `getRequestPayload`/`requireRole` imports.

- [ ] **Step 3: Lint check**

```bash
cd casa-sonia-compras && pnpm lint
```
Expected: no errors

- [ ] **Step 4: Manual test**

```
1. pnpm dev
2. Log in as EMPLEADO_BASICO
3. fetch('/api/local-orders').then(r => r.status)  → Expected: 403
4. Log in as EMPLEADO
5. fetch('/api/local-orders').then(r => r.status)  → Expected: 200
6. fetch('/api/employees').then(r => r.status)     → Expected: 403 (EMPLEADO has no employee access)
7. Log in as MANAGER
8. fetch('/api/employees').then(r => r.status)     → Expected: 200
```

- [ ] **Step 5: Commit**

```bash
cd casa-sonia-compras
git add src/app/api/local-orders/route.ts \
  "src/app/api/local-orders/[id]/route.ts" \
  "src/app/api/local-orders/[id]/confirm/route.ts" \
  "src/app/api/local-orders/[id]/duplicate/route.ts" \
  "src/app/api/local-orders/[id]/images/route.ts" \
  src/app/api/orders/route.ts \
  src/app/api/employees/route.ts \
  "src/app/api/employees/[id]/route.ts" \
  "src/app/api/employees/[id]/toggle/route.ts" \
  src/app/api/auth/me/route.ts
git commit -m "security: standardize local-orders, orders, employees, auth/me to withAuth"
```

---

## Task 8: Standardize existencias and search-history routes

These routes must be accessible to `EMPLEADO_BASICO`. No `roles` option — any authenticated user can call them.

**Files (all Modify):**
- `src/app/api/existencias/barcode/route.ts`
- `src/app/api/existencias/search/route.ts`
- `src/app/api/existencias/stock/route.ts`
- `src/app/api/existencias/product/route.ts`
- `src/app/api/search-history/route.ts`

**Role assignment:** No `roles` option — `withAuth(handler)` only.

**Pattern:**

Before:
```typescript
export async function GET(request: NextRequest) {
  if (!(await getRequestPayload(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // handler body
}
```

After:
```typescript
export const GET = withAuth(async (req: NextRequest) => {
  // handler body unchanged, using req instead of request
});
```

- [ ] **Step 1: Update `src/app/api/existencias/stock/route.ts`**

Full new content (current file had auth check inline):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { getStockByTemplate, getInternalLocations } from "@/lib/odooExistencias";

export const GET = withAuth(async (req: NextRequest) => {
  const templateIdStr = new URL(req.url).searchParams.get("templateId");
  if (!templateIdStr) {
    return NextResponse.json({ error: "templateId requerido" }, { status: 400 });
  }
  const templateId = parseInt(templateIdStr);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: "templateId inválido" }, { status: 400 });
  }

  const [stock, locations] = await Promise.all([
    getStockByTemplate(templateId),
    getInternalLocations(),
  ]);

  return NextResponse.json({ stock, locations });
});
```

- [ ] **Step 2: Update the remaining 4 files**

Read each file, apply `withAuth(handler)` wrap (no roles). Keep handler logic unchanged.

Files:
- `src/app/api/existencias/barcode/route.ts`
- `src/app/api/existencias/search/route.ts`
- `src/app/api/existencias/product/route.ts`
- `src/app/api/search-history/route.ts`

`search-history` may have multiple methods (GET/POST/DELETE) — wrap each one individually.

- [ ] **Step 3: Lint check**

```bash
cd casa-sonia-compras && pnpm lint
```
Expected: no errors

- [ ] **Step 4: Manual test**

```
1. pnpm dev
2. Log out (incognito or clear cookie)
3. fetch('/api/existencias/stock?templateId=1').then(r => r.status)
   Expected: 401
4. Log in as EMPLEADO_BASICO
5. Navigate to /existencias → search for a product → check stock grid loads
   Expected: works normally, no errors
6. fetch('/api/existencias/stock?templateId=1').then(r => r.status)
   Expected: 200 (or 500 if templateId 1 doesn't exist — that's OK)
```

- [ ] **Step 5: Commit**

```bash
cd casa-sonia-compras
git add src/app/api/existencias/barcode/route.ts \
  src/app/api/existencias/search/route.ts \
  src/app/api/existencias/stock/route.ts \
  src/app/api/existencias/product/route.ts \
  src/app/api/search-history/route.ts
git commit -m "security: standardize existencias and search-history routes to withAuth"
```

---

## Task 9: Proxy — block EMPLEADO from /empleados + remove debug logs

Currently `src/proxy.ts` restricts only `EMPLEADO_BASICO`. The `EMPLEADO` role can navigate to `/empleados` — the page renders but the API call returns 403. Redirect EMPLEADO to `/orders/new` at the middleware level for consistency. Also remove the debug `console.log` statements added in a previous session.

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Replace `src/proxy.ts` with the cleaned version**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;

  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      // Guard para rol Empleado Básico (solo Existencias)
      if (payload.role === "EMPLEADO_BASICO") {
        const allowed = ["/existencias", "/api/existencias", "/api/search-history", "/api/auth/"].some(
          (prefix) => pathname.startsWith(prefix),
        );
        if (!allowed) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
          }
          return NextResponse.redirect(new URL("/existencias", request.url));
        }
      }

      // Guard para rol Empleado: no puede gestionar empleados
      if (payload.role === "EMPLEADO" && pathname.startsWith("/empleados")) {
        return NextResponse.redirect(new URL("/orders/new", request.url));
      }

      return NextResponse.next();
    } catch {
      // Token inválido o expirado — fall through
    }
  }

  // API routes → 401 JSON (no redirect)
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Páginas → redirect a login, limpiar cookie inválida
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set("auth_token", "", { maxAge: 0, path: "/" });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|favicon.ico|api/auth/|uploads/).*)"],
};
```

- [ ] **Step 2: Lint check**

```bash
cd casa-sonia-compras && pnpm lint
```
Expected: no errors

- [ ] **Step 3: Manual test**

```
1. pnpm dev
2. Log in as EMPLEADO
3. In address bar, navigate to http://localhost:3000/empleados
   Expected: redirected to /orders/new
4. Log in as MANAGER
5. Navigate to /empleados
   Expected: page loads (employee list visible)
6. Log in as ADMIN
7. Navigate to /empleados
   Expected: page loads
8. Check server logs — no "[proxy]" console output during navigation
```

- [ ] **Step 4: Commit**

```bash
cd casa-sonia-compras
git add src/proxy.ts
git commit -m "security: block EMPLEADO from /empleados + remove proxy debug logs"
```

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|-------------|-----------|
| Sidebar hydration mismatch (Mantine + React 18) | Task 1 |
| `role = initialRole` as sole nav filter source | Task 1 |
| `withAuth` HOC wrapper | Task 2 |
| Fix `requireRole` TypeScript cast | Task 2 |
| Guard 11 catalog routes (no auth → any-auth) | Task 3 |
| Guard 7 product/PDF routes (ADMIN\|MANAGER\|EMPLEADO) | Task 4 |
| Guard 2 AI routes (ADMIN\|MANAGER) | Task 5 |
| Fix `cache/clear` cookie name bug (`"token"` → `"auth_token"`) | Task 5 |
| Guard `cache/clear` (ADMIN only) | Task 5 |
| Standardize 10 inventario routes | Task 6 |
| Standardize 5 local-orders + 3 employees + orders + me routes | Task 7 |
| Standardize 4 existencias + search-history routes | Task 8 |
| Block EMPLEADO from /empleados at proxy level | Task 9 |
| Remove debug console.log from proxy.ts | Task 9 |

### No placeholders

All steps contain exact code or exact file paths with explicit instructions to read-then-apply.

### Type consistency

- `TokenPayload` defined in `src/lib/auth.ts`, imported in `withAuth.ts` and used identically in all tasks
- `withAuth` handler signature `(req: NextRequest, payload: TokenPayload, context: object)` — consistent across all tasks
- `ctx as { params: { id: string } }` cast — consistent across all dynamic route tasks (Tasks 4, 6, 7)
- `roles: ["ADMIN", "MANAGER", "EMPLEADO"]` — exact string values match the `TokenPayload.role` union defined in `auth.ts`
- `_req: NextRequest` prefix convention for unused req params — consistent
