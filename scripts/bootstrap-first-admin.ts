import "dotenv/config";

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import {
  PERMISSION_DESCRIPTIONS,
  SYSTEM_ROLES,
} from "../src/modules/identity-access/catalog";
import {
  hashFallbackPassword,
  validateFallbackPassword,
} from "../src/modules/identity-access/crypto";

const bootstrapEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url().startsWith("postgresql://"),
    EJLS_BOOTSTRAP_CONFIRM: z.literal("CREATE_FIRST_ADMIN"),
    EJLS_BOOTSTRAP_ALLOW_PRODUCTION: z.string().optional(),
    EJLS_BOOTSTRAP_SCHOOL_CODE: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^[A-Za-z0-9-]+$/)
      .transform((value) => value.toLowerCase()),
    EJLS_BOOTSTRAP_SCHOOL_NAME: z.string().trim().min(3).max(120),
    EJLS_BOOTSTRAP_TIMEZONE: z.string().trim().min(3).max(64).default("Asia/Jakarta"),
    EJLS_BOOTSTRAP_ADMIN_EMAIL: z
      .email()
      .trim()
      .max(254)
      .transform((value) => value.toLowerCase()),
    EJLS_BOOTSTRAP_ADMIN_NAME: z.string().trim().min(3).max(120),
    EJLS_BOOTSTRAP_PASSWORD: z
      .string()
      .max(72)
      .refine(validateFallbackPassword, {
        message:
          "Password harus minimal 12 karakter dan memuat huruf kecil, huruf besar, angka, serta simbol.",
      }),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === "production" &&
      environment.EJLS_BOOTSTRAP_ALLOW_PRODUCTION !== "I_UNDERSTAND"
    ) {
      context.addIssue({
        code: "custom",
        path: ["EJLS_BOOTSTRAP_ALLOW_PRODUCTION"],
        message: "Bootstrap production memerlukan konfirmasi eksplisit.",
      });
    }
  });

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

function permissionRisk(key: string): RiskLevel {
  if (
    key.includes("assignments.") ||
    key.includes("fallback.") ||
    key.includes("sessions.") ||
    key.endsWith(".publish")
  ) {
    return "CRITICAL";
  }
  if (key.endsWith(".manage") || key.startsWith("iam.")) {
    return "HIGH";
  }
  if (key.startsWith("operations.") || key.startsWith("branding.")) {
    return "MEDIUM";
  }
  return "LOW";
}

async function runBootstrap() {
  const environment = bootstrapEnvironmentSchema.parse(process.env);
  const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL });
  const database = new PrismaClient({ adapter });

  try {
    const passwordHash = await hashFallbackPassword(environment.EJLS_BOOTSTRAP_PASSWORD);

    await database.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext('ejls:first-admin-bootstrap'))
        `;

        const assignmentCount = await transaction.roleAssignment.count();
        if (assignmentCount > 0) {
          throw new Error(
            "Bootstrap ditolak karena setidaknya satu penugasan akses sudah ada.",
          );
        }

        const permissionKeys = Object.keys(PERMISSION_DESCRIPTIONS);
        for (const key of permissionKeys) {
          await transaction.permission.upsert({
            where: { key },
            create: {
              key,
              description: PERMISSION_DESCRIPTIONS[key],
              riskLevel: permissionRisk(key),
            },
            update: {
              description: PERMISSION_DESCRIPTIONS[key],
              riskLevel: permissionRisk(key),
            },
          });
        }

        const roleIds = new Map<string, string>();
        for (const roleDefinition of SYSTEM_ROLES) {
          const role = await transaction.role.upsert({
            where: { key: roleDefinition.key },
            create: {
              key: roleDefinition.key,
              name: roleDefinition.name,
              description: roleDefinition.description,
              riskLevel: roleDefinition.riskLevel,
              isSystem: true,
            },
            update: {
              name: roleDefinition.name,
              description: roleDefinition.description,
              riskLevel: roleDefinition.riskLevel,
              isSystem: true,
            },
            select: { id: true },
          });
          roleIds.set(roleDefinition.key, role.id);

          const permissions = await transaction.permission.findMany({
            where: { key: { in: [...roleDefinition.permissions] } },
            select: { id: true },
          });
          if (permissions.length !== roleDefinition.permissions.length) {
            throw new Error("Katalog permission tidak lengkap.");
          }

          await transaction.rolePermission.deleteMany({ where: { roleId: role.id } });
          if (permissions.length > 0) {
            await transaction.rolePermission.createMany({
              data: permissions.map((permission) => ({
                roleId: role.id,
                permissionId: permission.id,
              })),
            });
          }
        }

        let school = await transaction.school.findFirst({
          where: {
            code: {
              equals: environment.EJLS_BOOTSTRAP_SCHOOL_CODE,
              mode: "insensitive",
            },
          },
          select: { id: true },
        });
        school ??= await transaction.school.create({
          data: {
            code: environment.EJLS_BOOTSTRAP_SCHOOL_CODE,
            name: environment.EJLS_BOOTSTRAP_SCHOOL_NAME,
            timezone: environment.EJLS_BOOTSTRAP_TIMEZONE,
          },
          select: { id: true },
        });
        await transaction.schoolSettings.upsert({
          where: { schoolId: school.id },
          create: { schoolId: school.id },
          update: {},
        });

        let admin = await transaction.user.findFirst({
          where: {
            schoolId: school.id,
            email: {
              equals: environment.EJLS_BOOTSTRAP_ADMIN_EMAIL,
              mode: "insensitive",
            },
          },
          select: { id: true },
        });
        admin ??= await transaction.user.create({
          data: {
            schoolId: school.id,
            email: environment.EJLS_BOOTSTRAP_ADMIN_EMAIL,
            fullName: environment.EJLS_BOOTSTRAP_ADMIN_NAME,
            status: "ACTIVE",
            provisioningSource: "MANUAL",
          },
          select: { id: true },
        });

        const now = new Date();
        await transaction.user.update({
          where: { id: admin.id },
          data: {
            fullName: environment.EJLS_BOOTSTRAP_ADMIN_NAME,
            status: "ACTIVE",
          },
        });
        await transaction.fallbackCredential.upsert({
          where: { userId: admin.id },
          create: {
            userId: admin.id,
            passwordHash,
            enabledAt: now,
            passwordChangedAt: now,
          },
          update: {
            passwordHash,
            enabledAt: now,
            disabledAt: null,
            failedAttempts: 0,
            lockedUntil: null,
            passwordChangedAt: now,
            version: { increment: 1 },
          },
        });

        const adminAccessRoleId = roleIds.get("admin-akses");
        if (!adminAccessRoleId) {
          throw new Error("Role Admin Akses tidak tersedia.");
        }
        const assignment = await transaction.roleAssignment.create({
          data: {
            schoolId: school.id,
            userId: admin.id,
            roleId: adminAccessRoleId,
            scopeType: "SCHOOL",
            scopeReference: null,
            scopeLabel: "Seluruh sekolah",
            activeFrom: now,
            grantReason: "Bootstrap administrator akses pertama",
          },
          select: { id: true },
        });

        await transaction.roleGrantBoundary.createMany({
          data: [...roleIds.values()].map((grantableRoleId) => ({
            actorAssignmentId: assignment.id,
            grantableRoleId,
            boundaryScopeType: "SCHOOL" as const,
            boundaryScopeReference: null,
          })),
        });

        await transaction.auditLog.create({
          data: {
            schoolId: school.id,
            subjectUserId: admin.id,
            eventType: "system.bootstrap.first-admin.completed",
            entityType: "RoleAssignment",
            entityId: assignment.id,
            action: "bootstrap-first-admin",
            outcome: "SUCCEEDED",
            reason: "Bootstrap eksplisit administrator akses pertama",
            after: {
              roleKey: "admin-akses",
              scopeType: "SCHOOL",
              grantableRoleKeys: [...roleIds.keys()],
            },
            metadata: {
              bootstrapMode: "ONE_SHOT",
              credentialMethod: "FALLBACK_EXPLICIT",
            },
            correlationId: randomUUID(),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    console.info(
      "Bootstrap selesai: satu administrator akses dibuat. Password tidak ditampilkan.",
    );
  } finally {
    await database.$disconnect();
  }
}

runBootstrap().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    for (const issue of error.issues) {
      console.error(`${issue.path.join(".") || "bootstrap"}: ${issue.message}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : "Bootstrap gagal.");
  }
  process.exitCode = 1;
});
