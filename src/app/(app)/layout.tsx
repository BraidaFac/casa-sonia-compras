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
