import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/client";

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must be set");
  }

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.employee.findUnique({ where: { username } });
    if (existing) {
      console.log(`Admin "${username}" already exists — skipping.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.employee.create({
      data: { username, passwordHash, name: "Admin", role: "ADMIN" },
    });

    console.log(`Admin "${username}" created.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
