export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!username || !password) {
    console.warn("[seed] SEED_ADMIN_USERNAME or SEED_ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const bcrypt = await import("bcryptjs");

    const existing = await prisma.employee.findUnique({ where: { username } });
    if (existing) {
      console.log(`[seed] Admin "${username}" already exists — skipping.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.employee.create({
      data: { username, passwordHash, name: "Admin", role: "ADMIN" },
    });

    console.log(`[seed] Admin "${username}" created.`);
  } catch (err) {
    console.error("[seed] Failed to seed admin:", err);
  }
}
