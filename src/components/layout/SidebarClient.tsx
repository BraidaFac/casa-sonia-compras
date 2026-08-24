"use client";

import dynamic from "next/dynamic";

const Sidebar = dynamic(
  () => import("@/components/layout/Sidebar").then((m) => m.Sidebar),
  { ssr: false },
);

export function SidebarClient({ initialRole, initialName }: { initialRole?: string; initialName?: string }) {
  return <Sidebar initialRole={initialRole} initialName={initialName} />;
}
