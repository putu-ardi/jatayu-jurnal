import "server-only";

import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/database";
import { appendAuditLog } from "@/modules/audit/service";
import { createOpaqueSessionToken, verifyFallbackPassword } from "./crypto";
import { persistSession, setSessionCookie } from "./session-dal";

const DUMMY_PASSWORD_HASH = "$2b$12$uO8VyJaFBSsSICJWb8vJTOn4A89DwfeLzvJFoujlP6JrHe2bI0nd2";
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1_000;

export type FallbackLoginResult = { ok: true } | { ok: false; message: string };
const GENERIC_FAILURE: FallbackLoginResult = {
  ok: false,
  message: "Email atau kata sandi tidak valid.",
};

export async function authenticateWithFallback(input: {
  schoolCode: string;
  email: string;
  password: string;
}): Promise<FallbackLoginResult> {
  const normalizedSchoolCode = input.schoolCode.trim().toLowerCase();
  const normalizedEmail = input.email.trim().toLowerCase();
  const now = new Date();
  const school = await getDatabase().school.findFirst({
    where: { code: { equals: normalizedSchoolCode, mode: "insensitive" } },
    select: { id: true },
  });
  const user = school
    ? await getDatabase().user.findFirst({
        where: {
          schoolId: school.id,
          email: { equals: normalizedEmail, mode: "insensitive" },
        },
        select: {
          id: true,
          schoolId: true,
          status: true,
          fallbackCredential: {
            select: {
              id: true,
              passwordHash: true,
              disabledAt: true,
              failedAttempts: true,
              lockedUntil: true,
              version: true,
            },
          },
        },
      })
    : null;
  const credential = user?.fallbackCredential;
  const passwordMatches = await verifyFallbackPassword(
    input.password,
    credential?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  const isEligible = Boolean(
    user &&
      user.status === "ACTIVE" &&
      credential &&
      credential.disabledAt === null &&
      (!credential.lockedUntil || credential.lockedUntil <= now),
  );

  if (!passwordMatches || !isEligible || !user || !credential) {
    if (school) {
      await getDatabase().$transaction(async (transaction) => {
        if (user && credential && credential.disabledAt === null) {
          const incremented = await transaction.fallbackCredential.updateMany({
            where: {
              id: credential.id,
              disabledAt: null,
              OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
            },
            data: {
              failedAttempts: { increment: 1 },
              version: { increment: 1 },
            },
          });
          if (incremented.count === 1) {
            await transaction.fallbackCredential.updateMany({
              where: {
                id: credential.id,
                disabledAt: null,
                failedAttempts: { gte: MAX_FAILED_ATTEMPTS },
              },
              data: {
                lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
              },
            });
          }
        }

        await appendAuditLog(transaction, {
          schoolId: school.id,
          subjectUserId: user?.id,
          eventType: "auth.fallback.denied",
          entityType: "Authentication",
          entityId: user?.id,
          action: "login",
          outcome: "DENIED",
          metadata: { authMethod: "FALLBACK", accountMatched: Boolean(user) },
          correlationId: randomUUID(),
        });
      });
    }

    return GENERIC_FAILURE;
  }

  const { token, tokenHash } = createOpaqueSessionToken();
  const sessionResult = await getDatabase().$transaction(async (transaction) => {
    const [currentState] = await transaction.$queryRaw<Array<{
      userStatus: string;
      credentialVersion: number;
      credentialDisabledAt: Date | null;
      credentialLockedUntil: Date | null;
    }>>`
      SELECT
        actor.status::text AS "userStatus",
        credential.version AS "credentialVersion",
        credential."disabledAt" AS "credentialDisabledAt",
        credential."lockedUntil" AS "credentialLockedUntil"
      FROM "users" actor
      JOIN "fallback_credentials" credential
        ON credential."userId" = actor.id
      WHERE actor.id = ${user.id}::uuid
        AND actor."schoolId" = ${user.schoolId}::uuid
        AND credential.id = ${credential.id}::uuid
      FOR UPDATE OF actor, credential
    `;
    if (
      !currentState ||
      currentState.userStatus !== "ACTIVE" ||
      currentState.credentialVersion !== credential.version ||
      currentState.credentialDisabledAt !== null ||
      (currentState.credentialLockedUntil !== null &&
        currentState.credentialLockedUntil > now)
    ) {
      return null;
    }

    const reset = await transaction.fallbackCredential.updateMany({
      where: { id: credential.id, version: credential.version, disabledAt: null },
      data: { failedAttempts: 0, lockedUntil: null, version: { increment: 1 } },
    });
    if (reset.count !== 1) {
      return null;
    }

    const session = await persistSession(
      {
        userId: user.id,
        token,
        tokenHash,
        authMethod: "FALLBACK",
        authenticatedAt: now,
      },
      transaction,
    );
    await transaction.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });
    await appendAuditLog(transaction, {
      schoolId: user.schoolId,
      subjectUserId: user.id,
      eventType: "auth.fallback.succeeded",
      entityType: "User",
      entityId: user.id,
      action: "login",
      outcome: "SUCCEEDED",
      metadata: { authMethod: "FALLBACK" },
      correlationId: randomUUID(),
    });

    return session;
  });

  if (!sessionResult) {
    return GENERIC_FAILURE;
  }

  await setSessionCookie(token, sessionResult.expiresAt);
  return { ok: true };
}
