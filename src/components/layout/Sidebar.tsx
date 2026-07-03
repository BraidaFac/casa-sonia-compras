"use client";
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Tooltip } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Store, Package, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

const NAV_ITEMS = [
  { href: "/orders", label: "Órdenes", icon: ClipboardList },
  { href: "/odoo-orders", label: "Historial Odoo", icon: Store },
  { href: "/inventario", label: "Inventario", icon: Package },
] as const;

const FUTURE_ITEMS: { href: string; label: string; icon: React.ElementType; soon: boolean }[] = [];

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
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [showText, setShowText] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefreshCache() {
    setIsRefreshing(true);
    try {
      await fetch("/api/cache/clear", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setCollapsed(mq.matches || readStoredCollapsed());
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setCollapsed(true);
      else setCollapsed(readStoredCollapsed());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (collapsed) {
      setShowText(false);
    } else {
      const t = setTimeout(() => setShowText(true), 160);
      return () => clearTimeout(t);
    }
  }, [collapsed]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.style.setProperty("--sidebar-width", `${next ? 56 : 220}px`);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  const width = collapsed ? 56 : 220;

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }, [width]);

  // showText drives layout: collapsed visual state until text is ready to appear
  const exp = showText; // shorthand: true = expanded layout

  return (
    <aside
      style={{
        width,
        height: "100dvh",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        transition: "width 200ms ease",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 100,
        overflow: "hidden",
      }}
    >
      {/* Logo + toggle */}
      <div
        style={{
          padding: exp ? "0 16px" : "0 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: exp ? "space-between" : "center",
          borderBottom: "1px solid var(--border)",
          height: 56,
          flexShrink: 0,
        }}
      >
        {exp && (
          <img src="/CS.png" alt="Casa Sonia" style={{ height: 24, width: "auto" }} />
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

      {/* Nav items */}
      <nav style={{ flex: 1, padding: exp ? "8px 8px" : "8px 4px" }}>
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
                  padding: exp ? "10px 12px" : "10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: exp ? "flex-start" : "center",
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
                {exp && label}
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
                padding: exp ? "10px 12px" : "10px",
                cursor: "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: exp ? "space-between" : "center",
                gap: 10,
                color: "var(--text3)",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                opacity: 0.5,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon size={16} />
                {exp && label}
              </span>
              {exp && soon && (
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

      {/* Footer — refresh cache */}
      <div
        style={{
          padding: exp ? "10px 16px" : "10px 8px",
        }}
      >
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
    </aside>
  );
}
