"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Tooltip } from "@mantine/core";
import { ClipboardList, Store, Package, Plus, ChevronLeft, ChevronRight } from "lucide-react";

const NAV_ITEMS = [
  { href: "/orders", label: "Órdenes", icon: ClipboardList },
  { href: "/odoo-orders", label: "Historial Odoo", icon: Store },
] as const;

const FUTURE_ITEMS = [
  { href: "/inventory", label: "Inventario", icon: Package, soon: true },
] as const;

const COLLAPSED_KEY = "sidebar_collapsed";

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  // Lazy initializer reads from localStorage (runs client-side only — "use client")
  const [collapsed, setCollapsed] = useState<boolean>(readStoredCollapsed);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  const width = collapsed ? 56 : 220;

  return (
    <aside
      style={{
        width,
        minHeight: "100dvh",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        transition: "width 200ms ease",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        overflow: "hidden",
      }}
    >
      {/* Logo + toggle */}
      <div
        style={{
          padding: collapsed ? "16px 8px" : "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          borderBottom: "1px solid var(--border)",
          minHeight: 57,
        }}
      >
        {!collapsed && (
          <img src="/CS.png" alt="Casa Sonia" style={{ height: 28, width: "auto" }} />
        )}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text3)",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nueva Orden button */}
      <div style={{ padding: collapsed ? "12px 8px" : "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <Tooltip label="Nueva Orden" disabled={!collapsed} position="right" withArrow>
          <button
            onClick={() => router.push("/orders/new")}
            style={{
              width: "100%",
              background: "var(--mantine-color-amber-6)",
              color: "#000",
              border: "none",
              borderRadius: 6,
              padding: collapsed ? "8px" : "8px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: 8,
              fontWeight: 600,
              fontSize: 13,
              fontFamily: "var(--font-sans)",
            }}
          >
            <Plus size={16} />
            {!collapsed && "Nueva Orden"}
          </button>
        </Tooltip>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: collapsed ? "8px 4px" : "8px 8px" }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Tooltip key={href} label={label} disabled={!collapsed} position="right" withArrow>
              <button
                onClick={() => router.push(href)}
                style={{
                  width: "100%",
                  background: active
                    ? "color-mix(in srgb, var(--mantine-color-amber-6) 12%, transparent)"
                    : "none",
                  border: "none",
                  borderLeft: active
                    ? "2px solid var(--mantine-color-amber-6)"
                    : "2px solid transparent",
                  borderRadius: active ? "0 6px 6px 0" : 6,
                  padding: collapsed ? "10px" : "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: collapsed ? "center" : "flex-start",
                  gap: 10,
                  color: active ? "var(--mantine-color-amber-4)" : "var(--text2)",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  fontFamily: "var(--font-sans)",
                  marginBottom: 2,
                  transition: "background 150ms, color 150ms",
                }}
                onMouseEnter={(e) => {
                  if (!active)
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--surface2, rgba(255,255,255,0.05))";
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "none";
                }}
              >
                <Icon size={16} />
                {!collapsed && label}
              </button>
            </Tooltip>
          );
        })}

        <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />

        {FUTURE_ITEMS.map(({ href, label, icon: Icon, soon }) => (
          <Tooltip
            key={href}
            label={soon ? `${label} — Próximamente` : label}
            disabled={!collapsed}
            position="right"
            withArrow
          >
            <button
              disabled
              style={{
                width: "100%",
                background: "none",
                border: "none",
                borderLeft: "2px solid transparent",
                borderRadius: 6,
                padding: collapsed ? "10px" : "10px 12px",
                cursor: "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: collapsed ? "center" : "space-between",
                gap: 10,
                color: "var(--text3)",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                opacity: 0.5,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon size={16} />
                {!collapsed && label}
              </span>
              {!collapsed && soon && (
                <span
                  style={{
                    fontSize: 10,
                    background: "var(--border)",
                    borderRadius: 4,
                    padding: "1px 5px",
                    color: "var(--text3)",
                  }}
                >
                  Próximamente
                </span>
              )}
            </button>
          </Tooltip>
        ))}
      </nav>
    </aside>
  );
}
