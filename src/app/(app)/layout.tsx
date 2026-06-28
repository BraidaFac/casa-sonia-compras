import { Sidebar } from "@/components/layout/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <Sidebar />
      <main style={{ marginLeft: "var(--sidebar-width, 220px)", transition: "margin-left 200ms ease", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
