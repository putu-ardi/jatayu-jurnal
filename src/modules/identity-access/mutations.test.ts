import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "./policy";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    userIdentity: {
      create: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
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
  linkGoogleIdentity,
  provisionManualUser,
  revokeRoleAssignment,
  revokeUserSession,
  setFallbackCredential,
  unlinkGoogleIdentity,
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
        "iam.users.provision",
        "iam.users.status.manage",
        "iam.assignments.grant",
        "iam.assignments.revoke",
        "iam.fallback.manage",
        "iam.identities.link",
        "iam.identities.unlink",
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

describe("provisionManualUser", () => {
  const input = {
    email: "  Teacher@School.Example  ",
    username: "  Teacher.One  ",
    fullName: "  Guru Penguji  ",
    reason: "Provisioning akun guru untuk UAT Google.",
  };

  it("requires the distinct provisioning capability before opening a transaction", async () => {
    mocks.requireCapability.mockRejectedValueOnce(new AuthorizationDeniedError());

    await expect(provisionManualUser(input)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.requireCapability).toHaveBeenCalledWith("iam.users.provision");
    expect(mocks.database.$transaction).not.toHaveBeenCalled();
  });

  it("requires recent authentication before opening a transaction", async () => {
    mocks.hasRecentAuthentication.mockReturnValueOnce(false);

    await expect(provisionManualUser(input)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.database.$transaction).not.toHaveBeenCalled();
    expect(mocks.transaction.user.create).not.toHaveBeenCalled();
  });

  it("revalidates the actor capability inside the transaction before creating a user", async () => {
    mocks.getActivePrincipalBySessionId.mockResolvedValueOnce(null);

    await expect(provisionManualUser(input)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.getActivePrincipalBySessionId).toHaveBeenCalledWith(
      actorPrincipal.sessionId,
      mocks.transaction,
    );
    expect(mocks.transaction.user.create).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("creates a normalized tenant user without automatic access and audits the operation", async () => {
    mocks.transaction.user.create.mockResolvedValue({ id: "provisioned-user", version: 1 });

    await expect(provisionManualUser(input)).resolves.toEqual({ id: "provisioned-user" });

    expect(mocks.database.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(mocks.transaction.user.create).toHaveBeenCalledWith({
      data: {
        schoolId: actorPrincipal.schoolId,
        email: "teacher@school.example",
        username: "teacher.one",
        fullName: "Guru Penguji",
        status: "ACTIVE",
        provisioningSource: "MANUAL",
      },
      select: { id: true, version: true },
    });
    const createData = mocks.transaction.user.create.mock.calls[0]?.[0]?.data;
    expect(createData).not.toHaveProperty("password");
    expect(createData).not.toHaveProperty("assignments");
    expect(createData).not.toHaveProperty("identities");
    expect(createData).not.toHaveProperty("sessions");
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      mocks.transaction,
      expect.objectContaining({
        schoolId: actorPrincipal.schoolId,
        subjectUserId: "provisioned-user",
        actorAssignmentId: "assignment-actor",
        eventType: "iam.user.provisioned",
        entityType: "User",
        entityId: "provisioned-user",
        action: "provision-manual",
        outcome: "SUCCEEDED",
        reason: input.reason,
        after: {
          status: "ACTIVE",
          provisioningSource: "MANUAL",
          usernameProvided: true,
          version: 1,
        },
      }),
    );
  });

  it("maps a duplicate email or username to a safe conflict without audit", async () => {
    mocks.transaction.user.create.mockRejectedValueOnce({ code: "P2002" });

    await expect(provisionManualUser(input)).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });
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

describe("linkGoogleIdentity", () => {
  const input = {
    requestPrincipal: actorPrincipal,
    actorSessionId: actorPrincipal.sessionId,
    actorUserId: actorPrincipal.userId,
    schoolId: actorPrincipal.schoolId,
    targetUserId: "target-user",
    expectedVersion: 7,
    issuer: "https://accounts.google.com",
    subject: "google-subject-123",
    emailAtLink: "student@school.example",
    reason: "Penautan identitas disetujui Admin Akses.",
  };

  it.each([
    ["session actor berbeda", { actorSessionId: "session-other" }],
    ["user actor berbeda", { actorUserId: "actor-other" }],
    ["sekolah actor berbeda", { schoolId: "school-other" }],
  ])("denies %s before opening a transaction", async (_label, override) => {
    await expect(linkGoogleIdentity({ ...input, ...override })).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.database.$transaction).not.toHaveBeenCalled();
    expect(mocks.transaction.userIdentity.create).not.toHaveBeenCalled();
  });

  it("denies linking the actor's own Google identity", async () => {
    await expect(
      linkGoogleIdentity({ ...input, targetUserId: actorPrincipal.userId }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(mocks.database.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["invited", { id: input.targetUserId, version: 7, status: "INVITED" }],
    ["suspended", { id: input.targetUserId, version: 7, status: "SUSPENDED" }],
    ["foreign or unknown", null],
    ["deactivated", { id: input.targetUserId, version: 7, status: "DEACTIVATED" }],
  ])("denies a %s target", async (_label, target) => {
    mocks.transaction.user.findFirst.mockResolvedValue(target);

    await expect(linkGoogleIdentity(input)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.transaction.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: input.targetUserId, schoolId: actorPrincipal.schoolId },
      }),
    );
    expect(mocks.transaction.userIdentity.create).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a stale target version before writing", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue({
      id: input.targetUserId,
      version: input.expectedVersion + 1,
      status: "ACTIVE",
    });

    await expect(linkGoogleIdentity(input)).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.transaction.user.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.userIdentity.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate Google identity to a safe conflict and rolls back audit", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue({
      id: input.targetUserId,
      version: input.expectedVersion,
      status: "ACTIVE",
    });
    mocks.transaction.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.userIdentity.create.mockRejectedValue({ code: "P2002" });

    await expect(linkGoogleIdentity(input)).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("atomically creates the identity and writes a minimized audit record", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue({
      id: input.targetUserId,
      version: input.expectedVersion,
      status: "ACTIVE",
    });
    mocks.transaction.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.userIdentity.create.mockResolvedValue({ id: "identity-google" });

    await expect(linkGoogleIdentity(input)).resolves.toEqual({ id: "identity-google" });

    expect(mocks.database.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(mocks.transaction.user.updateMany).toHaveBeenCalledWith({
      where: {
        status: "ACTIVE",
        id: input.targetUserId,
        schoolId: actorPrincipal.schoolId,
        version: input.expectedVersion,
      },
      data: { version: { increment: 1 } },
    });
    expect(mocks.transaction.userIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: input.targetUserId,
          provider: "GOOGLE_WORKSPACE",
          issuer: input.issuer,
          subject: input.subject,
          emailAtLink: input.emailAtLink,
          emailVerified: true,
        }),
      }),
    );
    expect(mocks.appendAuditLog).toHaveBeenCalledWith(
      mocks.transaction,
      expect.objectContaining({
        eventType: "iam.identity.google.linked",
        entityId: "identity-google",
        subjectUserId: input.targetUserId,
        after: {
          provider: "GOOGLE_WORKSPACE",
          issuer: input.issuer,
          emailVerified: true,
          userVersion: input.expectedVersion + 1,
        },
      }),
    );
    const auditInput = mocks.appendAuditLog.mock.calls[0]?.[1];
    expect(auditInput.after).not.toHaveProperty("subject");
    expect(auditInput.after).not.toHaveProperty("emailAtLink");
  });
});

describe("unlinkGoogleIdentity", () => {
  const input = {
    identityId: "identity-google",
    targetUserId: "target-user",
    expectedVersion: 7,
    reason: "Pelepasan identitas untuk pemulihan akses.",
  };

  it("uses the separate unlink capability and denies self-targeting before a transaction", async () => {
    await expect(
      unlinkGoogleIdentity({ ...input, targetUserId: actorPrincipal.userId }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(mocks.requireCapability).toHaveBeenCalledWith("iam.identities.unlink");
    expect(mocks.database.$transaction).not.toHaveBeenCalled();
    expect(mocks.transaction.userIdentity.deleteMany).not.toHaveBeenCalled();
  });

  it("denies a foreign or missing target without reading the identity", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue(null);

    await expect(unlinkGoogleIdentity(input)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.transaction.user.findFirst).toHaveBeenCalledWith({
      where: { id: input.targetUserId, schoolId: actorPrincipal.schoolId },
      select: { id: true, version: true },
    });
    expect(mocks.transaction.userIdentity.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.userIdentity.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a stale target version before reading or deleting the identity", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue({
      id: input.targetUserId,
      version: input.expectedVersion + 1,
      status: "SUSPENDED",
    });

    await expect(unlinkGoogleIdentity(input)).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.transaction.userIdentity.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.user.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.session.updateMany).not.toHaveBeenCalled();
  });

  it("denies an identity that is not Google-linked to the selected target", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue({
      id: input.targetUserId,
      version: input.expectedVersion,
      status: "DEACTIVATED",
    });
    mocks.transaction.userIdentity.findFirst.mockResolvedValue(null);

    await expect(unlinkGoogleIdentity(input)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );

    expect(mocks.transaction.userIdentity.findFirst).toHaveBeenCalledWith({
      where: {
        id: input.identityId,
        userId: input.targetUserId,
        provider: "GOOGLE_WORKSPACE",
      },
      select: { id: true, issuer: true, emailVerified: true },
    });
    expect(mocks.transaction.userIdentity.deleteMany).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it("maps a concurrent identity deletion to a conflict without audit", async () => {
    mocks.transaction.user.findFirst.mockResolvedValue({
      id: input.targetUserId,
      version: input.expectedVersion,
      status: "INVITED",
    });
    mocks.transaction.userIdentity.findFirst.mockResolvedValue({
      id: input.identityId,
      issuer: "https://accounts.google.com",
      emailVerified: true,
    });
    mocks.transaction.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.userIdentity.deleteMany.mockResolvedValue({ count: 0 });

    await expect(unlinkGoogleIdentity(input)).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.transaction.session.updateMany).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
  });

  it.each(["INVITED", "SUSPENDED", "DEACTIVATED"])(
    "unlinks an identity from a %s target and revokes only active Google sessions",
    async (status) => {
      mocks.transaction.user.findFirst.mockResolvedValue({
        id: input.targetUserId,
        version: input.expectedVersion,
        status,
      });
      mocks.transaction.userIdentity.findFirst.mockResolvedValue({
        id: input.identityId,
        issuer: "https://accounts.google.com",
        emailVerified: true,
      });
      mocks.transaction.user.updateMany.mockResolvedValue({ count: 1 });
      mocks.transaction.userIdentity.deleteMany.mockResolvedValue({ count: 1 });
      mocks.transaction.session.updateMany.mockResolvedValue({ count: 2 });

      await expect(unlinkGoogleIdentity(input)).resolves.toEqual({
        id: input.identityId,
        revokedSessionCount: 2,
      });

      expect(mocks.database.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: "Serializable" },
      );
      expect(mocks.transaction.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: input.targetUserId,
          schoolId: actorPrincipal.schoolId,
          version: input.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });
      expect(mocks.transaction.userIdentity.deleteMany).toHaveBeenCalledWith({
        where: {
          id: input.identityId,
          userId: input.targetUserId,
          provider: "GOOGLE_WORKSPACE",
        },
      });
      expect(mocks.transaction.session.updateMany).toHaveBeenCalledWith({
        where: {
          userId: input.targetUserId,
          authMethod: "GOOGLE_WORKSPACE",
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: {
          revokedAt: expect.any(Date),
          revokedByUserId: actorPrincipal.userId,
          revokeReason: input.reason,
          version: { increment: 1 },
        },
      });
      expect(mocks.appendAuditLog).toHaveBeenCalledWith(
        mocks.transaction,
        expect.objectContaining({
          eventType: "iam.identity.google.unlinked",
          entityId: input.identityId,
          subjectUserId: input.targetUserId,
          before: {
            provider: "GOOGLE_WORKSPACE",
            issuer: "https://accounts.google.com",
            emailVerified: true,
            userVersion: input.expectedVersion,
          },
          after: { linked: false, userVersion: input.expectedVersion + 1 },
          metadata: {
            authMethod: "GOOGLE_WORKSPACE",
            revokedGoogleSessionCount: 2,
          },
        }),
      );
      const auditInput = mocks.appendAuditLog.mock.calls[0]?.[1];
      expect(auditInput.before).not.toHaveProperty("subject");
      expect(auditInput.before).not.toHaveProperty("emailAtLink");
      expect(auditInput.after).not.toHaveProperty("subject");
      expect(auditInput.after).not.toHaveProperty("emailAtLink");
      expect(auditInput.metadata).not.toHaveProperty("subject");
      expect(auditInput.metadata).not.toHaveProperty("emailAtLink");
      expect(mocks.transaction.fallbackCredential.updateMany).not.toHaveBeenCalled();
    },
  );
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
