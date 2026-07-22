import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    fallbackCredential: { updateMany: vi.fn() },
    session: { create: vi.fn() },
    user: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  };

  return {
    schoolFindFirst: vi.fn(),
    userFindFirst: vi.fn(),
    transaction,
    databaseTransaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    appendAuditLog: vi.fn(),
    verifyFallbackPassword: vi.fn(),
    createOpaqueSessionToken: vi.fn(),
    persistSession: vi.fn(),
    setSessionCookie: vi.fn(),
  };
});

vi.mock("@/lib/database", () => ({
  getDatabase: () => ({
    school: { findFirst: mocks.schoolFindFirst },
    user: { findFirst: mocks.userFindFirst },
    $transaction: mocks.databaseTransaction,
  }),
}));

vi.mock("@/modules/audit/service", () => ({
  appendAuditLog: mocks.appendAuditLog,
}));

vi.mock("./crypto", () => ({
  createOpaqueSessionToken: mocks.createOpaqueSessionToken,
  verifyFallbackPassword: mocks.verifyFallbackPassword,
}));

vi.mock("./session-dal", () => ({
  persistSession: mocks.persistSession,
  setSessionCookie: mocks.setSessionCookie,
}));

import { authenticateWithFallback } from "./authentication";

const input = {
  schoolCode: " jatayu ",
  email: " ADMIN@EXAMPLE.TEST ",
  password: "Wrong-password-2026!",
};
const genericFailure = {
  ok: false,
  message: "Email atau kata sandi tidak valid.",
};

function userRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    schoolId: "school-a",
    status: "ACTIVE",
    fallbackCredential: {
      id: "credential-1",
      passwordHash: "real-password-hash",
      disabledAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      version: 1,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.schoolFindFirst.mockResolvedValue({ id: "school-a" });
  mocks.userFindFirst.mockResolvedValue(userRecord());
  mocks.verifyFallbackPassword.mockResolvedValue(false);
  mocks.transaction.$queryRaw.mockResolvedValue([
    {
      userStatus: "ACTIVE",
      credentialVersion: 1,
      credentialDisabledAt: null,
      credentialLockedUntil: null,
    },
  ]);
  mocks.transaction.fallbackCredential.updateMany.mockResolvedValue({ count: 1 });
});

describe("authenticateWithFallback failure privacy", () => {
  it("normalizes school and email before tenant-qualified lookup", async () => {
    await authenticateWithFallback(input);

    expect(mocks.schoolFindFirst).toHaveBeenCalledWith({
      where: { code: { equals: "jatayu", mode: "insensitive" } },
      select: { id: true },
    });
    expect(mocks.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: "school-a",
          email: { equals: "admin@example.test", mode: "insensitive" },
        },
      }),
    );
  });

  it("runs dummy password verification when the school does not exist", async () => {
    mocks.schoolFindFirst.mockResolvedValue(null);

    await expect(authenticateWithFallback(input)).resolves.toEqual(genericFailure);

    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.verifyFallbackPassword).toHaveBeenCalledWith(
      input.password,
      expect.stringMatching(/^\$2b\$12\$/),
    );
    expect(mocks.databaseTransaction).not.toHaveBeenCalled();
  });

  it("increments failed attempts atomically before applying the lock threshold", async () => {
    await expect(authenticateWithFallback(input)).resolves.toEqual(genericFailure);

    expect(mocks.transaction.fallbackCredential.updateMany).toHaveBeenNthCalledWith(
      1,
      {
        where: {
          id: "credential-1",
          disabledAt: null,
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: expect.any(Date) } }],
        },
        data: {
          failedAttempts: { increment: 1 },
          version: { increment: 1 },
        },
      },
    );
    expect(mocks.transaction.fallbackCredential.updateMany).toHaveBeenNthCalledWith(
      2,
      {
        where: {
          id: "credential-1",
          disabledAt: null,
          failedAttempts: { gte: 5 },
        },
        data: { lockedUntil: expect.any(Date) },
      },
    );
  });

  it.each([
    ["unknown user", null, false],
    ["wrong password", userRecord(), false],
    ["suspended user", userRecord({ status: "SUSPENDED" }), true],
    [
      "disabled credential",
      userRecord({
        fallbackCredential: {
          ...userRecord().fallbackCredential,
          disabledAt: new Date("2026-07-20T00:00:00.000Z"),
        },
      }),
      true,
    ],
    [
      "locked credential",
      userRecord({
        fallbackCredential: {
          ...userRecord().fallbackCredential,
          lockedUntil: new Date("2099-01-01T00:00:00.000Z"),
        },
      }),
      true,
    ],
  ])("returns the same message for %s", async (_label, user, passwordMatches) => {
    mocks.userFindFirst.mockResolvedValue(user);
    mocks.verifyFallbackPassword.mockResolvedValue(passwordMatches);

    await expect(authenticateWithFallback(input)).resolves.toEqual(genericFailure);
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it("revalidates locked user and credential state before creating a session", async () => {
    mocks.verifyFallbackPassword.mockResolvedValue(true);
    mocks.createOpaqueSessionToken.mockReturnValue({
      token: "opaque-token",
      tokenHash: "token-hash",
    });
    mocks.transaction.$queryRaw.mockResolvedValue([
      {
        userStatus: "SUSPENDED",
        credentialVersion: 1,
        credentialDisabledAt: null,
        credentialLockedUntil: null,
      },
    ]);

    await expect(authenticateWithFallback(input)).resolves.toEqual(genericFailure);

    expect(mocks.transaction.fallbackCredential.updateMany).not.toHaveBeenCalled();
    expect(mocks.persistSession).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it("returns a generic failure without session side effects after a credential race", async () => {
    mocks.verifyFallbackPassword.mockResolvedValue(true);
    mocks.createOpaqueSessionToken.mockReturnValue({
      token: "opaque-token",
      tokenHash: "token-hash",
    });
    mocks.transaction.fallbackCredential.updateMany.mockResolvedValue({ count: 0 });

    await expect(authenticateWithFallback(input)).resolves.toEqual(genericFailure);

    expect(mocks.persistSession).not.toHaveBeenCalled();
    expect(mocks.transaction.user.update).not.toHaveBeenCalled();
    expect(mocks.appendAuditLog).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });
});
