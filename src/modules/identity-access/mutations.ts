import "server-only";

import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/database";
import { appendAuditLog } from "@/modules/audit/service";
import { hashFallbackPassword } from "./crypto";
import {
  authorize,
  canGrantAssignment,
  canRevokeAssignment,
  capabilities,
  type Capability,
  type Principal,
} from "./policy";
import {
  ConflictError,
  AuthorizationDeniedError,
  isConcurrencyConflict,
} from "./errors";
import {
  getActivePrincipalBySessionId,
  hasRecentAuthentication,
  requireCapability,
  requirePrincipal,
} from "./session-dal";

type TransactionClient = Parameters<typeof getActivePrincipalBySessionId>[1];

function requireRecentAuthentication(authenticatedAt: Date) {
  if (!hasRecentAuthentication({ authenticatedAt } as Parameters<typeof hasRecentAuthentication>[0])) {
    throw new AuthorizationDeniedError();
  }
}

async function lockPrincipalAuthorizationRows(
  requestPrincipal: Principal,
  transaction: TransactionClient,
) {
  await transaction.$queryRaw`
    SELECT session.id
    FROM "sessions" session
    JOIN "users" actor ON actor.id = session."userId"
    WHERE session.id = ${requestPrincipal.sessionId}::uuid
    FOR SHARE OF session, actor
  `;
  await transaction.$queryRaw`
    SELECT assignment.id
    FROM "role_assignments" assignment
    WHERE assignment."schoolId" = ${requestPrincipal.schoolId}::uuid
      AND assignment."userId" = ${requestPrincipal.userId}::uuid
    FOR SHARE OF assignment
  `;
  await transaction.$queryRaw`
    SELECT role_permission."roleId", role_permission."permissionId"
    FROM "role_permissions" role_permission
    JOIN "role_assignments" assignment
      ON assignment."roleId" = role_permission."roleId"
    WHERE assignment."schoolId" = ${requestPrincipal.schoolId}::uuid
      AND assignment."userId" = ${requestPrincipal.userId}::uuid
    FOR SHARE OF role_permission
  `;
  await transaction.$queryRaw`
    SELECT boundary.id
    FROM "role_grant_boundaries" boundary
    JOIN "role_assignments" assignment
      ON assignment.id = boundary."actorAssignmentId"
    WHERE assignment."schoolId" = ${requestPrincipal.schoolId}::uuid
      AND assignment."userId" = ${requestPrincipal.userId}::uuid
    FOR SHARE OF boundary
  `;
}

async function refreshPrincipal(
  requestPrincipal: Principal,
  transaction: TransactionClient,
) {
  await lockPrincipalAuthorizationRows(requestPrincipal, transaction);
  const principal = await getActivePrincipalBySessionId(
    requestPrincipal.sessionId,
    transaction,
  );
  if (
    !principal ||
    principal.userId !== requestPrincipal.userId ||
    principal.schoolId !== requestPrincipal.schoolId
  ) {
    throw new AuthorizationDeniedError();
  }

  requireRecentAuthentication(principal.authenticatedAt);
  return principal;
}

async function refreshPrincipalWithCapability(
  requestPrincipal: Principal,
  capability: Capability,
  transaction: TransactionClient,
) {
  const principal = await refreshPrincipal(requestPrincipal, transaction);
  const decision = authorize(principal, capability, {
    schoolId: principal.schoolId,
    type: "SCHOOL",
    reference: null,
  });
  if (!decision.allowed) {
    throw new AuthorizationDeniedError();
  }

  return { principal, actorAssignmentId: decision.assignmentId };
}

async function runSerializableMutation<T>(
  callback: (transaction: TransactionClient) => Promise<T>,
) {
  try {
    return await getDatabase().$transaction(callback, {
      isolationLevel: "Serializable",
    });
  } catch (error) {
    if (isConcurrencyConflict(error)) {
      throw new ConflictError();
    }
    throw error;
  }
}

export async function provisionManualUser(input: {
  email: string;
  username: string | null;
  fullName: string;
  reason: string;
}) {
  const { principal: requestPrincipal } = await requireCapability(
    capabilities.usersProvision,
  );
  requireRecentAuthentication(requestPrincipal.authenticatedAt);

  return runSerializableMutation(async (transaction) => {
    const { principal, actorAssignmentId } = await refreshPrincipalWithCapability(
      requestPrincipal,
      capabilities.usersProvision,
      transaction,
    );
    const user = await transaction.user.create({
      data: {
        schoolId: principal.schoolId,
        email: input.email.trim().toLowerCase(),
        username: input.username?.trim().toLowerCase() || null,
        fullName: input.fullName.trim(),
        status: "ACTIVE",
        provisioningSource: "MANUAL",
      },
      select: { id: true, version: true },
    });

    await appendAuditLog(transaction, {
      schoolId: principal.schoolId,
      principal,
      subjectUserId: user.id,
      actorAssignmentId,
      eventType: "iam.user.provisioned",
      entityType: "User",
      entityId: user.id,
      action: "provision-manual",
      outcome: "SUCCEEDED",
      reason: input.reason,
      after: {
        status: "ACTIVE",
        provisioningSource: "MANUAL",
        usernameProvided: Boolean(input.username),
        version: user.version,
      },
      correlationId: randomUUID(),
    });

    return { id: user.id };
  });
}

export async function updateUserStatus(input: {
  targetUserId: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  expectedVersion: number;
  reason: string;
}) {
  const { principal: requestPrincipal } = await requireCapability(
    capabilities.userStatusManage,
  );
  requireRecentAuthentication(requestPrincipal.authenticatedAt);
  if (requestPrincipal.userId === input.targetUserId) {
    throw new AuthorizationDeniedError();
  }

  await runSerializableMutation(async (transaction) => {
    const { principal, actorAssignmentId } = await refreshPrincipalWithCapability(
      requestPrincipal,
      capabilities.userStatusManage,
      transaction,
    );
    const target = await transaction.user.findFirst({
      where: { id: input.targetUserId, schoolId: principal.schoolId },
      select: { id: true, status: true, version: true },
    });
    if (!target) {
      throw new AuthorizationDeniedError();
    }

    const result = await transaction.user.updateMany({
      where: {
        id: target.id,
        schoolId: principal.schoolId,
        version: input.expectedVersion,
      },
      data: {
        status: input.status,
        version: { increment: 1 },
        deactivatedAt: input.status === "DEACTIVATED" ? new Date() : null,
      },
    });
    if (result.count !== 1) {
      throw new ConflictError();
    }

    if (input.status === "SUSPENDED" || input.status === "DEACTIVATED") {
      await transaction.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedByUserId: principal.userId,
          revokeReason: input.reason,
          version: { increment: 1 },
        },
      });
    }

    await appendAuditLog(transaction, {
      schoolId: principal.schoolId,
      principal,
      subjectUserId: target.id,
      actorAssignmentId,
      eventType: "iam.user.status.changed",
      entityType: "User",
      entityId: target.id,
      action: "update-status",
      outcome: "SUCCEEDED",
      reason: input.reason,
      before: { status: target.status, version: target.version },
      after: { status: input.status, version: target.version + 1 },
      correlationId: randomUUID(),
    });
  });
}

export async function grantRoleAssignment(input: {
  targetUserId: string;
  roleKey: string;
  activeUntil: Date | null;
  reason: string;
}) {
  const requestPrincipal = await requirePrincipal();
  requireRecentAuthentication(requestPrincipal.authenticatedAt);
  const requestDecision = canGrantAssignment({
    principal: requestPrincipal,
    targetUserId: input.targetUserId,
    targetRoleKey: input.roleKey,
    targetScope: {
      schoolId: requestPrincipal.schoolId,
      type: "SCHOOL",
      reference: null,
    },
  });
  if (!requestDecision.allowed) {
    throw new AuthorizationDeniedError();
  }

  await runSerializableMutation(async (transaction) => {
    const principal = await refreshPrincipal(requestPrincipal, transaction);
    const scope = {
      schoolId: principal.schoolId,
      type: "SCHOOL" as const,
      reference: null,
    };
    const decision = canGrantAssignment({
      principal,
      targetUserId: input.targetUserId,
      targetRoleKey: input.roleKey,
      targetScope: scope,
    });
    if (!decision.allowed) {
      throw new AuthorizationDeniedError();
    }

    const [target, role, duplicate] = await Promise.all([
      transaction.user.findFirst({
        where: { id: input.targetUserId, schoolId: principal.schoolId },
        select: { id: true },
      }),
      transaction.role.findUnique({
        where: { key: input.roleKey },
        select: { id: true, key: true, name: true },
      }),
      transaction.roleAssignment.findFirst({
        where: {
          userId: input.targetUserId,
          schoolId: principal.schoolId,
          role: { key: input.roleKey },
          scopeType: "SCHOOL",
          scopeReference: null,
          revokedAt: null,
          OR: [{ activeUntil: null }, { activeUntil: { gt: new Date() } }],
        },
        select: { id: true },
      }),
    ]);
    if (!target || !role) {
      throw new AuthorizationDeniedError();
    }
    if (duplicate) {
      throw new ConflictError();
    }

    const assignment = await transaction.roleAssignment.create({
      data: {
        schoolId: principal.schoolId,
        userId: target.id,
        roleId: role.id,
        scopeType: "SCHOOL",
        scopeReference: null,
        scopeLabel: "Seluruh sekolah",
        activeFrom: new Date(),
        activeUntil: input.activeUntil,
        grantedByUserId: principal.userId,
        grantReason: input.reason,
      },
      select: { id: true, version: true },
    });

    await appendAuditLog(transaction, {
      schoolId: principal.schoolId,
      principal,
      subjectUserId: target.id,
      actorAssignmentId: decision.actorAssignmentId,
      eventType: "iam.assignment.granted",
      entityType: "RoleAssignment",
      entityId: assignment.id,
      action: "grant",
      outcome: "SUCCEEDED",
      reason: input.reason,
      after: {
        targetUserId: target.id,
        roleKey: role.key,
        scope,
        activeUntil: input.activeUntil,
        version: assignment.version,
      },
      correlationId: randomUUID(),
    });
  });
}

export async function revokeRoleAssignment(input: {
  assignmentId: string;
  expectedVersion: number;
  reason: string;
}) {
  const requestPrincipal = await requirePrincipal();
  requireRecentAuthentication(requestPrincipal.authenticatedAt);

  await runSerializableMutation(async (transaction) => {
    const principal = await refreshPrincipal(requestPrincipal, transaction);
    const target = await transaction.roleAssignment.findFirst({
      where: { id: input.assignmentId, schoolId: principal.schoolId },
      select: {
        id: true,
        userId: true,
        version: true,
        revokedAt: true,
        scopeType: true,
        scopeReference: true,
        role: { select: { key: true } },
      },
    });
    if (!target || target.revokedAt) {
      throw new AuthorizationDeniedError();
    }

    const scope = {
      schoolId: principal.schoolId,
      type: target.scopeType,
      reference: target.scopeReference,
    };
    const decision = canRevokeAssignment({
      principal,
      targetUserId: target.userId,
      targetRoleKey: target.role.key,
      targetScope: scope,
    });
    if (!decision.allowed) {
      throw new AuthorizationDeniedError();
    }

    const result = await transaction.roleAssignment.updateMany({
      where: {
        id: target.id,
        schoolId: principal.schoolId,
        version: input.expectedVersion,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedByUserId: principal.userId,
        revokeReason: input.reason,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ConflictError();
    }

    await appendAuditLog(transaction, {
      schoolId: principal.schoolId,
      principal,
      subjectUserId: target.userId,
      actorAssignmentId: decision.actorAssignmentId,
      eventType: "iam.assignment.revoked",
      entityType: "RoleAssignment",
      entityId: target.id,
      action: "revoke",
      outcome: "SUCCEEDED",
      reason: input.reason,
      before: { revokedAt: null, version: target.version },
      after: { revoked: true, version: target.version + 1 },
      correlationId: randomUUID(),
    });
  });
}

export async function revokeUserSession(input: {
  sessionId: string;
  expectedVersion: number;
  reason: string;
}) {
  const { principal: requestPrincipal } = await requireCapability(
    capabilities.sessionsRevoke,
  );
  requireRecentAuthentication(requestPrincipal.authenticatedAt);

  await runSerializableMutation(async (transaction) => {
    const { principal, actorAssignmentId } = await refreshPrincipalWithCapability(
      requestPrincipal,
      capabilities.sessionsRevoke,
      transaction,
    );
    const target = await transaction.session.findFirst({
      where: { id: input.sessionId, user: { schoolId: principal.schoolId } },
      select: { id: true, version: true, revokedAt: true, userId: true },
    });
    if (!target) {
      throw new AuthorizationDeniedError();
    }
    if (target.revokedAt) {
      throw new ConflictError();
    }

    const result = await transaction.session.updateMany({
      where: { id: target.id, version: input.expectedVersion, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedByUserId: principal.userId,
        revokeReason: input.reason,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ConflictError();
    }

    await appendAuditLog(transaction, {
      schoolId: principal.schoolId,
      principal,
      subjectUserId: target.userId,
      actorAssignmentId,
      eventType: "iam.session.revoked",
      entityType: "Session",
      entityId: target.id,
      action: "revoke",
      outcome: "SUCCEEDED",
      reason: input.reason,
      before: { revoked: Boolean(target.revokedAt), version: target.version },
      after: { revoked: true, version: target.version + 1, userId: target.userId },
      correlationId: randomUUID(),
    });
  });
}

export async function setFallbackCredential(input: {
  targetUserId: string;
  password: string;
  expectedVersion: number;
  reason: string;
}) {
  const { principal: requestPrincipal } = await requireCapability(
    capabilities.fallbackManage,
  );
  requireRecentAuthentication(requestPrincipal.authenticatedAt);
  if (requestPrincipal.userId === input.targetUserId) {
    throw new AuthorizationDeniedError();
  }
  const passwordHash = await hashFallbackPassword(input.password);

  await runSerializableMutation(async (transaction) => {
    const { principal, actorAssignmentId } = await refreshPrincipalWithCapability(
      requestPrincipal,
      capabilities.fallbackManage,
      transaction,
    );
    const target = await transaction.user.findFirst({
      where: { id: input.targetUserId, schoolId: principal.schoolId },
      select: { id: true, fallbackCredential: { select: { id: true, version: true, disabledAt: true } } },
    });
    if (!target || (target.fallbackCredential?.version ?? 0) !== input.expectedVersion) {
      throw target ? new ConflictError() : new AuthorizationDeniedError();
    }

    const now = new Date();
    let credentialVersion: number;
    if (target.fallbackCredential) {
      const result = await transaction.fallbackCredential.updateMany({
        where: {
          id: target.fallbackCredential.id,
          version: input.expectedVersion,
        },
        data: {
          passwordHash,
          enabledAt: now,
          disabledAt: null,
          failedAttempts: 0,
          lockedUntil: null,
          passwordChangedAt: now,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictError();
      }
      credentialVersion = input.expectedVersion + 1;
    } else {
      const credential = await transaction.fallbackCredential.create({
        data: {
          userId: target.id,
          passwordHash,
          enabledAt: now,
          passwordChangedAt: now,
        },
        select: { version: true },
      });
      credentialVersion = credential.version;
    }

    await appendAuditLog(transaction, {
      schoolId: principal.schoolId,
      principal,
      subjectUserId: target.id,
      actorAssignmentId,
      eventType: "iam.fallback.enabled",
      entityType: "FallbackCredential",
      entityId: target.id,
      action: "enable",
      outcome: "SUCCEEDED",
      reason: input.reason,
      before: { enabled: Boolean(target.fallbackCredential && !target.fallbackCredential.disabledAt) },
      after: { enabled: true, version: credentialVersion },
      correlationId: randomUUID(),
    });
  });
}

export async function linkGoogleIdentity(input: {
  requestPrincipal: Principal;
  actorSessionId: string;
  actorUserId: string;
  schoolId: string;
  targetUserId: string;
  expectedVersion: number;
  issuer: string;
  subject: string;
  emailAtLink: string;
  reason: string;
}) {
  if (
    input.requestPrincipal.sessionId !== input.actorSessionId ||
    input.requestPrincipal.userId !== input.actorUserId ||
    input.requestPrincipal.schoolId !== input.schoolId ||
    input.requestPrincipal.userId === input.targetUserId
  ) {
    throw new AuthorizationDeniedError();
  }
  requireRecentAuthentication(input.requestPrincipal.authenticatedAt);

  return runSerializableMutation(async (transaction) => {
    const { principal, actorAssignmentId } = await refreshPrincipalWithCapability(
      input.requestPrincipal,
      capabilities.identityLinkManage,
      transaction,
    );
    if (
      principal.sessionId !== input.actorSessionId ||
      principal.userId !== input.actorUserId ||
      principal.schoolId !== input.schoolId ||
      principal.userId === input.targetUserId
    ) {
      throw new AuthorizationDeniedError();
    }

    const target = await transaction.user.findFirst({
      where: { id: input.targetUserId, schoolId: principal.schoolId },
      select: { id: true, version: true, status: true },
    });
    if (!target || target.status !== "ACTIVE") {
      throw new AuthorizationDeniedError();
    }
    if (target.version !== input.expectedVersion) throw new ConflictError();

    const versionUpdate = await transaction.user.updateMany({
      where: {
        id: target.id,
        schoolId: principal.schoolId,
        status: "ACTIVE",
        version: input.expectedVersion,
      },
      data: { version: { increment: 1 } },
    });
    if (versionUpdate.count !== 1) throw new ConflictError();

    const identity = await transaction.userIdentity.create({
      data: {
        userId: target.id,
        provider: "GOOGLE_WORKSPACE",
        issuer: input.issuer,
        subject: input.subject,
        emailAtLink: input.emailAtLink,
        emailVerified: true,
      },
      select: { id: true },
    });

    await appendAuditLog(transaction, {
      schoolId: principal.schoolId,
      principal,
      subjectUserId: target.id,
      actorAssignmentId,
      eventType: "iam.identity.google.linked",
      entityType: "UserIdentity",
      entityId: identity.id,
      action: "link",
      outcome: "SUCCEEDED",
      reason: input.reason,
      after: {
        provider: "GOOGLE_WORKSPACE",
        issuer: input.issuer,
        emailVerified: true,
        userVersion: target.version + 1,
      },
      correlationId: randomUUID(),
    });

    return identity;
  });
}

export async function disableFallbackCredential(input: {
  targetUserId: string;
  expectedVersion: number;
  reason: string;
}) {
  const { principal: requestPrincipal } = await requireCapability(
    capabilities.fallbackManage,
  );
  requireRecentAuthentication(requestPrincipal.authenticatedAt);
  if (requestPrincipal.userId === input.targetUserId) {
    throw new AuthorizationDeniedError();
  }

  await runSerializableMutation(async (transaction) => {
    const { principal, actorAssignmentId } = await refreshPrincipalWithCapability(
      requestPrincipal,
      capabilities.fallbackManage,
      transaction,
    );
    const target = await transaction.user.findFirst({
      where: { id: input.targetUserId, schoolId: principal.schoolId },
      select: { id: true, fallbackCredential: { select: { id: true, version: true, disabledAt: true } } },
    });
    if (!target?.fallbackCredential) {
      throw new AuthorizationDeniedError();
    }

    const result = await transaction.fallbackCredential.updateMany({
      where: { id: target.fallbackCredential.id, version: input.expectedVersion, disabledAt: null },
      data: { disabledAt: new Date(), version: { increment: 1 } },
    });
    if (result.count !== 1) {
      throw new ConflictError();
    }

    await appendAuditLog(transaction, {
      schoolId: principal.schoolId,
      principal,
      subjectUserId: target.id,
      actorAssignmentId,
      eventType: "iam.fallback.disabled",
      entityType: "FallbackCredential",
      entityId: target.id,
      action: "disable",
      outcome: "SUCCEEDED",
      reason: input.reason,
      before: { enabled: true, version: target.fallbackCredential.version },
      after: { enabled: false, version: target.fallbackCredential.version + 1 },
      correlationId: randomUUID(),
    });
  });
}

export async function unlinkGoogleIdentity(input: {
  identityId: string;
  targetUserId: string;
  expectedVersion: number;
  reason: string;
}) {
  const { principal: requestPrincipal } = await requireCapability(
    capabilities.identityUnlinkManage,
  );
  requireRecentAuthentication(requestPrincipal.authenticatedAt);
  if (requestPrincipal.userId === input.targetUserId) {
    throw new AuthorizationDeniedError();
  }

  return runSerializableMutation(async (transaction) => {
    const { principal, actorAssignmentId } = await refreshPrincipalWithCapability(
      requestPrincipal,
      capabilities.identityUnlinkManage,
      transaction,
    );
    if (principal.userId === input.targetUserId) {
      throw new AuthorizationDeniedError();
    }

    const target = await transaction.user.findFirst({
      where: { id: input.targetUserId, schoolId: principal.schoolId },
      select: { id: true, version: true },
    });
    if (!target) {
      throw new AuthorizationDeniedError();
    }
    if (target.version !== input.expectedVersion) {
      throw new ConflictError();
    }

    const identity = await transaction.userIdentity.findFirst({
      where: {
        id: input.identityId,
        userId: target.id,
        provider: "GOOGLE_WORKSPACE",
      },
      select: { id: true, issuer: true, emailVerified: true },
    });
    if (!identity) {
      throw new AuthorizationDeniedError();
    }

    const versionUpdate = await transaction.user.updateMany({
      where: {
        id: target.id,
        schoolId: principal.schoolId,
        version: input.expectedVersion,
      },
      data: { version: { increment: 1 } },
    });
    if (versionUpdate.count !== 1) {
      throw new ConflictError();
    }

    const identityDelete = await transaction.userIdentity.deleteMany({
      where: {
        id: identity.id,
        userId: target.id,
        provider: "GOOGLE_WORKSPACE",
      },
    });
    if (identityDelete.count !== 1) {
      throw new ConflictError();
    }

    const now = new Date();
    const revokedSessions = await transaction.session.updateMany({
      where: {
        userId: target.id,
        authMethod: "GOOGLE_WORKSPACE",
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
        revokedByUserId: principal.userId,
        revokeReason: input.reason,
        version: { increment: 1 },
      },
    });

    await appendAuditLog(transaction, {
      schoolId: principal.schoolId,
      principal,
      subjectUserId: target.id,
      actorAssignmentId,
      eventType: "iam.identity.google.unlinked",
      entityType: "UserIdentity",
      entityId: identity.id,
      action: "unlink",
      outcome: "SUCCEEDED",
      reason: input.reason,
      before: {
        provider: "GOOGLE_WORKSPACE",
        issuer: identity.issuer,
        emailVerified: identity.emailVerified,
        userVersion: target.version,
      },
      after: {
        linked: false,
        userVersion: target.version + 1,
      },
      metadata: {
        authMethod: "GOOGLE_WORKSPACE",
        revokedGoogleSessionCount: revokedSessions.count,
      },
      correlationId: randomUUID(),
    });

    return { id: identity.id, revokedSessionCount: revokedSessions.count };
  });
}
