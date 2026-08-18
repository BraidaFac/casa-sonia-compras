import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

export default async function Home() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (token) {
      const payload = await verifyToken(token);
      if (payload.role === "EMPLEADO_BASICO") {
        redirect("/existencias");
      }
    }
  } catch {
    // invalid token — proxy handles auth redirect
  }
  redirect("/orders/new");
}
