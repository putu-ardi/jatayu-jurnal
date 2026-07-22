import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnvironment } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getDatabase() {
  if (!globalForPrisma.prisma) {
    const { DATABASE_URL } = getServerEnvironment();
    const adapter = new PrismaPg({ connectionString: DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.prisma;
}
