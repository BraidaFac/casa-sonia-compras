import { Sidebar } from "@/components/layout/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: "var(--bg)" }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
