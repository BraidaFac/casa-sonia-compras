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
          (prefix) => pathname.startsWith(prefix)
        );
        if (!allowed) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
          }
          return NextResponse.redirect(new URL("/existencias", request.url));
        }
      }

      // Guard para rol Empleado (sin acceso a gestión de empleados)
      if (payload.role === "EMPLEADO") {
        const blocked = ["/empleados"].some((prefix) => pathname.startsWith(prefix));
        if (blocked) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
          }
          return NextResponse.redirect(new URL("/orders/new", request.url));
        }
      }

      return NextResponse.next();
    } catch {
      // Token inválido o expirado — fall through
    }
  }

  // API routes → 401 JSON (no redirect, para no romper fetch del browser)
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
