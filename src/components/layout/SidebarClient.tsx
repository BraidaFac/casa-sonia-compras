"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@mantine/core";

function SidebarSkeleton() {
  return (
    <aside
      style={{
        width: 220,
        height: "100dvh",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 100,
        padding: "0 8px",
      }}
    >
      {/* Logo row */}
      <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 8px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Skeleton height={24} width={100} radius="sm" />
      </div>
      {/* Nav items */}
      <div style={{ padding: "12px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
        {[80, 90, 70, 75, 65].map((w, i) => (
          <Skeleton key={i} height={36} width={`${w}%`} radius="sm" />
        ))}
      </div>
    </aside>
  );
}

const Sidebar = dynamic(
  () => import("@/components/layout/Sidebar").then((m) => m.Sidebar),
  { ssr: false, loading: SidebarSkeleton },
);

export function SidebarClient({ initialRole, initialName }: { initialRole?: string; initialName?: string }) {
  return <Sidebar initialRole={initialRole} initialName={initialName} />;
}
