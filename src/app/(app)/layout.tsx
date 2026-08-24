import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { SidebarClient } from "@/components/layout/SidebarClient";
import { WarmupTierA } from "@/components/layout/WarmupTierA";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let initialRole: string | undefined;
  let initialName: string | undefined;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (token) {
      const payload = await verifyToken(token);
      initialRole = payload.role as string;
      initialName = payload.name as string;
    }
  } catch {
    // invalid token — proxy handles redirect
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      <WarmupTierA />
      <SidebarClient initialRole={initialRole} initialName={initialName} />
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
