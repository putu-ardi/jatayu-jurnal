import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { hashFallbackPassword, validateFallbackPassword } from "../src/modules/identity-access/crypto";

const environmentSchema = z.object({
  NODE_ENV: z.literal("test"),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  EJLS_E2E_CONFIRM: z.literal("SEED_EPHEMERAL_BROWSER_TEST"),
  EJLS_E2E_SCHOOL_CODE: z.string().regex(/^e2e-[a-z0-9-]{2,27}$/),
  EJLS_E2E_MEMBER_EMAIL: z.email().endsWith("@example.test"),
  EJLS_E2E_MEMBER_NAME: z.string().trim().min(3).max(120),
  EJLS_E2E_MEMBER_PASSWORD: z.string().max(72).refine(validateFallbackPassword),
});

async function seedBrowserTest() {
  const environment = environmentSchema.parse(process.env);
  const databaseUrl = new URL(environment.DATABASE_URL);
  const databaseName = databaseUrl.pathname.slice(1);
  if (!databaseName.endsWith("_browser_test") || databaseUrl.hostname !== "database") {
    throw new Error("Fixture browser hanya boleh memakai database Compose ephemeral bernama *_browser_test.");
  }

  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });

  try {
    const memberPasswordHash = await hashFallbackPassword(environment.EJLS_E2E_MEMBER_PASSWORD);
    await database.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext('ejls:ephemeral-browser-fixture'))
        `;

        const schools = await transaction.school.findMany({ select: { id: true, code: true } });
        if (
          schools.length !== 1 ||
          schools[0]?.code.toLowerCase() !== environment.EJLS_E2E_SCHOOL_CODE.toLowerCase()
        ) {
          throw new Error("Fixture ditolak: database tidak berisi tepat satu tenant E2E yang diharapkan.");
        }
        const schoolId = schools[0].id;
        const [userCount, assignmentCount] = await Promise.all([
          transaction.user.count({ where: { schoolId } }),
          transaction.roleAssignment.count({ where: { schoolId } }),
        ]);
        if (userCount !== 1 || assignmentCount !== 1) {
          throw new Error("Fixture ditolak: database bukan hasil bootstrap pertama yang bersih.");
        }

        const guruRole = await transaction.role.findUnique({
          where: { key: "guru" },
          select: { id: true },
        });
        if (!guruRole) throw new Error("Katalog role belum dibootstrap.");

        const member = await transaction.user.create({
          data: {
            schoolId,
            email: environment.EJLS_E2E_MEMBER_EMAIL.toLowerCase(),
            fullName: environment.EJLS_E2E_MEMBER_NAME,
            status: "ACTIVE",
            provisioningSource: "MANUAL",
            fallbackCredential: {
              create: {
                passwordHash: memberPasswordHash,
                enabledAt: new Date(),
                passwordChangedAt: new Date(),
              },
            },
          },
          select: { id: true },
        });

        await transaction.roleAssignment.create({
          data: {
            schoolId,
            userId: member.id,
            roleId: guruRole.id,
            scopeType: "SCHOOL",
            scopeLabel: "Seluruh sekolah",
            activeFrom: new Date(),
            grantReason: "Fixture browser ephemeral principal non-P-10",
          },
        });

        await transaction.user.createMany({
          data: Array.from({ length: 34 }, (_, index) => ({
            schoolId,
            email: `e2e-user-${String(index + 1).padStart(2, "0")}@example.test`,
            fullName: `Pengguna E2E ${String(index + 1).padStart(2, "0")}`,
            status: "ACTIVE" as const,
            provisioningSource: "IMPORT" as const,
          })),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    console.info("Fixture browser ephemeral selesai: principal non-P-10 dan 34 pengguna dibuat.");
  } finally {
    await database.$disconnect();
  }
}

seedBrowserTest().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    for (const issue of error.issues) {
      console.error(`${issue.path.join(".") || "browser-fixture"}: ${issue.message}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : "Fixture browser gagal.");
  }
  process.exitCode = 1;
});
