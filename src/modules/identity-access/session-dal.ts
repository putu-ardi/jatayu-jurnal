import "server-only";

import { cookies, headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/database";
import { hashOpaqueToken } from "./crypto";
import {
  authorize,
  type Capability,
  type EffectiveAssignment,
  type Principal,
  type ResourceScope,
} from "./policy";
import { AuthenticationRequiredError, AuthorizationDeniedError } from "./errors";

export const SESSION_COOKIE_NAME = "ejls_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1_000;
const RECENT_AUTHENTICATION_MS = 15 * 60 * 1_000;

function toPrincipal(session: {
  id: string;
  authenticatedAt: Date;
  user: {
    id: string;
    schoolId: string;
    fullName: string;
    email: string;
    assignments: Array<{
      id: string;
      schoolId: string;
      userId: string;
      scopeType: "SELF" | "CLASS" | "PROGRAM" | "ROOM" | "SCHOOL";
      scopeReference: string | null;
      activeFrom: Date;
      activeUntil: Date | null;
      revokedAt: Date | null;
      role: { key: string; permissions: Array<{ permission: { key: string } }> };
      grantBoundaries: Array<{
        boundaryScopeType: "SELF" | "CLASS" | "PROGRAM" | "ROOM" | "SCHOOL";
        boundaryScopeReference: string | null;
        grantableRole: { key: string };
      }>;
    }>;
  };
}): Principal {
  const assignments: EffectiveAssignment[] = session.user.assignments.map((assignment) => ({
    id: assignment.id,
    schoolId: assignment.schoolId,
    userId: assignment.userId,
    roleKey: assignment.role.key,
    permissions: assignment.role.permissions.map(({ permission }) => permission.key),
    scope: {
      schoolId: assignment.schoolId,
      type: assignment.scopeType,
      reference: assignment.scopeReference,
    },
    activeFrom: assignment.activeFrom,
    activeUntil: assignment.activeUntil,
    revokedAt: assignment.revokedAt,
    grantBoundaries: assignment.grantBoundaries.map((boundary) => ({
      grantableRoleKey: boundary.grantableRole.key,
      scope: {
        schoolId: assignment.schoolId,
        type: boundary.boundaryScopeType,
        reference: boundary.boundaryScopeReference,
      },
    })),
  }));

  return {
    sessionId: session.id,
    userId: session.user.id,
    schoolId: session.user.schoolId,
    fullName: session.user.fullName,
    email: session.user.email,
    authenticatedAt: session.authenticatedAt,
    assignments,
  };
}

async function findActivePrincipal(
  where: Prisma.SessionWhereInput,
  transaction: Prisma.TransactionClient = getDatabase(),
  now = new Date(),
): Promise<Principal | null> {
  const session = await transaction.session.findFirst({
    where: {
      ...where,
      revokedAt: null,
      expiresAt: { gt: now },
      user: { status: "ACTIVE" },
    },
    select: {
      id: true,
      authenticatedAt: true,
      user: {
        select: {
          id: true,
          schoolId: true,
          fullName: true,
          email: true,
          assignments: {
            select: {
              id: true,
              schoolId: true,
              userId: true,
              scopeType: true,
              scopeReference: true,
              activeFrom: true,
              activeUntil: true,
              revokedAt: true,
              role: {
                select: {
                  key: true,
                  permissions: { select: { permission: { select: { key: true } } } },
                },
              },
              grantBoundaries: {
                select: {
                  boundaryScopeType: true,
                  boundaryScopeReference: true,
                  grantableRole: { select: { key: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return session ? toPrincipal(session) : null;
}

export function getActivePrincipalBySessionId(
  sessionId: string,
  transaction: Prisma.TransactionClient,
  now = new Date(),
) {
  return findActivePrincipal({ id: sessionId }, transaction, now);
}

export async function getCurrentPrincipal(): Promise<Principal | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || token.length > 128) {
    return null;
  }

  return findActivePrincipal({ tokenHash: hashOpaqueToken(token) });
}

export async function requirePrincipal() {
  const principal = await getCurrentPrincipal();
  if (!principal) {
    throw new AuthenticationRequiredError();
  }
  return principal;
}

export async function requireCapability(capability: Capability, targetScope?: ResourceScope) {
  const principal = await requirePrincipal();
  const scope = targetScope ?? {
    schoolId: principal.schoolId,
    type: "SCHOOL" as const,
    reference: null,
  };
  const result = authorize(principal, capability, scope);
  if (!result.allowed) {
    throw new AuthorizationDeniedError();
  }

  return { principal, actorAssignmentId: result.assignmentId };
}

export function hasRecentAuthentication(principal: Principal, now = new Date()) {
  return now.getTime() - principal.authenticatedAt.getTime() <= RECENT_AUTHENTICATION_MS;
}

type SessionInput = {
  userId: string;
  token: string;
  tokenHash: string;
  authMethod: "GOOGLE_WORKSPACE" | "FALLBACK";
  authenticatedAt?: Date;
};

export async function persistSession(
  input: SessionInput,
  transaction: Prisma.TransactionClient = getDatabase(),
) {
  const authenticatedAt = input.authenticatedAt ?? new Date();
  const expiresAt = new Date(authenticatedAt.getTime() + SESSION_DURATION_MS);
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") ?? "";

  await transaction.session.create({
    data: {
      userId: input.userId,
      tokenHash: input.tokenHash,
      authMethod: input.authMethod,
      authenticatedAt,
      lastSeenAt: authenticatedAt,
      expiresAt,
      userAgentHash: userAgent ? hashOpaqueToken(userAgent) : null,
    },
  });

  return { expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function issueSession(input: SessionInput) {
  const { expiresAt } = await persistSession(input);
  await setSessionCookie(input.token, expiresAt);
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
