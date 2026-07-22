import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  headersGet: vi.fn(),
  sessionFindFirst: vi.fn(),
  sessionCreate: vi.fn(),
  hashOpaqueToken: vi.fn((value: string) => `hash:${value}`),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  }),
  headers: async () => ({ get: mocks.headersGet }),
}));

vi.mock("@/lib/database", () => ({
  getDatabase: () => ({
    session: {
      findFirst: mocks.sessionFindFirst,
      create: mocks.sessionCreate,
    },
  }),
}));

vi.mock("./crypto", () => ({
  hashOpaqueToken: mocks.hashOpaqueToken,
}));

import { AuthorizationDeniedError } from "./errors";
import { getCurrentPrincipal, requireCapability } from "./session-dal";

const now = new Date("2026-07-21T12:00:00.000Z");

function sessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    authenticatedAt: new Date("2026-07-21T11:55:00.000Z"),
    expiresAt: new Date("2026-07-21T20:00:00.000Z"),
    revokedAt: null,
    user: {
      id: "user-1",
      schoolId: "school-a",
      fullName: "Admin Akses",
      email: "admin@example.test",
      status: "ACTIVE",
      assignments: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.cookieGet.mockReturnValue({ value: "opaque-session-token" });
});

describe("getCurrentPrincipal", () => {
  it.each(["revoked", "expired", "owned by a suspended user"])(
    "rejects a session that is %s",
    async () => {
      mocks.sessionFindFirst.mockResolvedValue(null);

      await expect(getCurrentPrincipal()).resolves.toBeNull();
      expect(mocks.sessionFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            revokedAt: null,
            expiresAt: { gt: now },
            user: { status: "ACTIVE" },
          }),
        }),
      );
    },
  );

  it("uses only the opaque token hash for the session lookup", async () => {
    mocks.sessionFindFirst.mockResolvedValue(sessionRecord());

    await expect(getCurrentPrincipal()).resolves.toMatchObject({
      sessionId: "session-1",
      userId: "user-1",
      schoolId: "school-a",
    });
    expect(mocks.hashOpaqueToken).toHaveBeenCalledWith("opaque-session-token");
    expect(mocks.sessionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tokenHash: "hash:opaque-session-token",
          revokedAt: null,
          user: { status: "ACTIVE" },
        }),
      }),
    );
  });
});

describe("requireCapability", () => {
  it("denies an expired assignment even when its session remains active", async () => {
    mocks.sessionFindFirst.mockResolvedValue(
      sessionRecord({
        user: {
          ...sessionRecord().user,
          assignments: [
            {
              id: "assignment-expired",
              schoolId: "school-a",
              userId: "user-1",
              scopeType: "SCHOOL",
              scopeReference: null,
              activeFrom: new Date("2026-07-01T00:00:00.000Z"),
              activeUntil: new Date("2026-07-20T23:59:59.000Z"),
              revokedAt: null,
              role: {
                key: "access-admin",
                permissions: [{ permission: { key: "iam.users.read" } }],
              },
              grantBoundaries: [],
            },
          ],
        },
      }),
    );

    await expect(requireCapability("iam.users.read")).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
  });
});
