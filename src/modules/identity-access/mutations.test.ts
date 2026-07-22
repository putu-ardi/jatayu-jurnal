import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "./policy";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    user: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
    },
    roleAssignment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    fallbackCredential: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    transaction,
    database: {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    },
    appendAuditLog: vi.fn(),
    hashFallbackPassword: vi.fn(),
    getActivePrincipalBySessionId: vi.fn(),
    hasRecentAuthentication: vi.fn(),
    requireCapability: vi.fn(),
    requirePrincipal: vi.fn(),
  };
});

vi.mock("@/lib/database", () => ({
  getDatabase: () => mocks.database,
}));

vi.mock("@/modules/audit/service", () => ({
  appendAuditLog: mocks.appendAuditLog,
}));

vi.mock("./crypto", () => ({
  hashFallbackPassword: mocks.hashFallbackPassword,
}));

vi.mock("./session-dal", () => ({
  getActivePrincipalBySessionId: mocks.getActivePrincipalBySessionId,
  hasRecentAuthentication: mocks.hasRecentAuthentication,
  requireCapability: mocks.requireCapability,
  requirePrincipal: mocks.requirePrincipal,
}));

import { ConflictError, AuthorizationDeniedError } from "./errors";
import {
  grantRoleAssignment,
  revokeRoleAssignment,
  revokeUserSession,
  setFallbackCredential,
  updateUserStatus,
} from "./mutations";

const actorPrincipal: Principal = {
  sessionId: "session-actor",
  userId: "actor-user",
  schoolId: "school-a",
  fullName: "Admin Akses",
  email: "admin@example.test",
  authenticatedAt: new Date("2026-07-21T12:00:00.000Z"),
  assignments: [
    {
      id: "assignment-actor",
      schoolId: "school-a",
      userId: "actor-user",
      roleKey: "admin-akses",
      permissions: [
        "iam.users.status.manage",
        "iam.assignments.grant",
        "iam.assignments.revoke",
        "iam.fallback.manage",
        "iam.sessions.revoke",
      ],
      scope: { schoolId: "school-a", type: "SCHOOL", reference: null },
      activeFrom: new Date("2026-01-01T00:00:00.000Z"),
      activeUntil: null,
      revokedAt: null,
      grantBoundaries: [
        {
          grantableRoleKey: "guru",
          scope: { schoolId: "school-a", type: "SCHOOL", reference: null },
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActivePrincipalBySessionId.mockResolvedValue(actorPrincipal);
  mocks.hasRecentAuthentication.mockReturnValue(true);
  mocks.hashFallbackPassword.mockResolvedValue("hashed-password");
  mocks.requireCapability.mockResolvedValue({
    principal: actorPrincipal,
    actorAssignmentId: "assignment-actor",
  });
  mocks.requirePrincipal.mockResolvedValue(actorPrincipal);
});

describe("updateUserStatus", () => {
  const input = {
    targetUserId: "target-user",
    status: "SUSPENDED" as const,
    expectedVersion: 2,
    reason: "Penangguhan untuk pengujian keamanan.",
  };

  it("denies changing the actor's own lifecycle before opening a transaction", async () => {
    await expect(
      updateUserStatus({ ...input, targetUserId: actorPrincipal.userId }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(mocks.database.$transaction).not.toHaveBeenCalled();
    expect(mocks.transaction.user.updateMany).not.toHaveBeenCalled();
  });

  it("denies a foreign or unknown user identifier without writing", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue(null);

    await expect(updateUserStatus(input)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.transaction.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: input.targetUserId, schoolId: actorPrincipal.schoolId },
      }),
    );
    expect(mocks.transaction.user.updateMany).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("revalidates the actor session inside the transaction before any target read", async () => {
    mocks.getActivePrincipalBySessionId.mockResolvedValue(null);

    await expect(updateUserStatus(input)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.transaction.$queryRaw).toHaveBeenCalledTimes(4);
    expect(mocks.getActivePrincipalBySessionId).toHaveBeenCalledWith(
      actorPrincipal.sessionId,
      mocks.transaction,
    );
    expect(mocks.transaction.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.user.updateMany).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a stale optimistic version and leaves sessions unchanged", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue({
      id: input.targetUserId,
      status: "ACTIVE",
      version: 3,
    });
    mocks.transaction.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateUserStatus(input)).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.transaction.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: actorPrincipal.schoolId,
          version: input.expectedVersion,
        }),
      }),
    );
    expect(mocks.transaction.session.updateMany).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });
});

describe("assignment mutations", () => {
  it("denies a grant when the actor session is revoked before the transaction", async () => {
    mocks.getActivePrincipalBySessionId.mockResolvedValue(null);

    await expect(
      grantRoleAssignment({
        targetUserId: "target-user",
        roleKey: "guru",
        activeUntil: null,
        reason: "Penugasan guru yang disetujui.",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(mocks.transaction.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.roleAssignment.create).not.toHaveBeenCalled();
  });

  it("denies a grant when the actor assignment is revoked inside the transaction", async () => {
    mocks.getActivePrincipalBySessionId.mockResolvedValue({
      ...actorPrincipal,
      assignments: actorPrincipal.assignments.map((assignment) => ({
        ...assignment,
        revokedAt: new Date(),
      })),
    });

    await expect(
      grantRoleAssignment({
        targetUserId: "target-user",
        roleKey: "guru",
        activeUntil: null,
        reason: "Penugasan guru yang disetujui.",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(mocks.transaction.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.roleAssignment.create).not.toHaveBeenCalled();
  });

  it("denies a foreign assignment identifier without revoking anything", async () => {
    mocks.transaction.roleAssignment.findFirst.mockResolvedValue(null);

    await expect(
      revokeRoleAssignment({
        assignmentId: "foreign-assignment",
        expectedVersion: 1,
        reason: "Pencabutan penugasan.",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(mocks.transaction.roleAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "foreign-assignment",
          schoolId: actorPrincipal.schoolId,
        },
      }),
    );
    expect(mocks.transaction.roleAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale assignment revoke version", async () => {
    mocks.transaction.roleAssignment.findFirst.mockResolvedValue({
      id: "assignment-target",
      userId: "target-user",
      version: 3,
      revokedAt: null,
      scopeType: "SCHOOL",
      scopeReference: null,
      role: { key: "guru" },
    });
    mocks.transaction.roleAssignment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      revokeRoleAssignment({
        assignmentId: "assignment-target",
        expectedVersion: 2,
        reason: "Pencabutan penugasan.",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("maps a serializable transaction abort to a safe conflict", async () => {
    mocks.database.$transaction.mockRejectedValueOnce({ code: "P2034" });

    await expect(
      grantRoleAssignment({
        targetUserId: "target-user",
        roleKey: "guru",
        activeUntil: null,
        reason: "Penugasan guru yang disetujui.",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.database.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
  });
});

describe("revokeUserSession", () => {
  it("denies a foreign session identifier without writing", async () => {
    mocks.transaction.session.findFirst.mockResolvedValue(null);

    await expect(
      revokeUserSession({
        sessionId: "foreign-session",
        expectedVersion: 1,
        reason: "Sesi tidak lagi dipercaya.",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(mocks.transaction.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "foreign-session",
          user: { schoolId: actorPrincipal.schoolId },
        },
      }),
    );
    expect(mocks.transaction.session.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale session revoke version", async () => {
    mocks.transaction.session.findFirst.mockResolvedValue({
      id: "session-target",
      version: 4,
      revokedAt: null,
      userId: "target-user",
    });
    mocks.transaction.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      revokeUserSession({
        sessionId: "session-target",
        expectedVersion: 3,
        reason: "Sesi tidak lagi dipercaya.",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });
});

describe("setFallbackCredential", () => {
  const input = {
    targetUserId: "target-user",
    password: "Valid-Fallback-2026!",
    expectedVersion: 4,
    reason: "Pemulihan akses yang disetujui pengelola.",
  };

  it("denies changing the actor's own fallback credential", async () => {
    await expect(
      setFallbackCredential({ ...input, targetUserId: actorPrincipal.userId }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(mocks.hashFallbackPassword).not.toHaveBeenCalled();
    expect(mocks.database.$transaction).not.toHaveBeenCalled();
  });

  it("denies a foreign or unknown target without creating a credential", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue(null);

    await expect(setFallbackCredential(input)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.transaction.fallbackCredential.create).not.toHaveBeenCalled();
    expect(mocks.transaction.fallbackCredential.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale version observed during the initial tenant-qualified read", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue({
      id: input.targetUserId,
      fallbackCredential: {
        id: "credential-target",
        version: input.expectedVersion + 1,
        disabledAt: null,
      },
    });

    await expect(setFallbackCredential(input)).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.transaction.fallbackCredential.updateMany).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("uses an atomic compare-and-swap and rejects a version race", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue({
      id: input.targetUserId,
      fallbackCredential: {
        id: "credential-target",
        version: input.expectedVersion,
        disabledAt: null,
      },
    });
    mocks.transaction.fallbackCredential.updateMany.mockResolvedValue({ count: 0 });

    await expect(setFallbackCredential(input)).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.transaction.fallbackCredential.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "credential-target",
          version: input.expectedVersion,
        },
      }),
    );
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });
});
