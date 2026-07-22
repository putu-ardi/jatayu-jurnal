import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  redisSet: vi.fn(),
  redisGet: vi.fn(),
  redisGetdel: vi.fn(),
  randomState: vi.fn(() => "S".repeat(43)),
  randomNonce: vi.fn(() => "N".repeat(43)),
  randomPKCECodeVerifier: vi.fn(() => "V".repeat(43)),
  calculatePKCECodeChallenge: vi.fn(async () => "C".repeat(43)),
}));

vi.mock("@/lib/application-redis", () => ({
  getApplicationRedis: () => ({
    set: mocks.redisSet,
    get: mocks.redisGet,
    getdel: mocks.redisGetdel,
  }),
}));

vi.mock("openid-client", () => ({
  randomState: mocks.randomState,
  randomNonce: mocks.randomNonce,
  randomPKCECodeVerifier: mocks.randomPKCECodeVerifier,
  calculatePKCECodeChallenge: mocks.calculatePKCECodeChallenge,
}));

import {
  consumeGoogleLinkConfirmation,
  consumeGoogleOidcTransaction,
  createGoogleLinkConfirmation,
  createGoogleOidcTransaction,
  peekGoogleLinkConfirmation,
} from "./google-oidc-state";

const linkInput = {
  purpose: "LINK" as const,
  schoolCode: "school-main",
  redirectUri: "https://ejls.school.example/api/auth/google/link/callback",
  returnPath: "/admin/akses?user=4d2c2e36-a3bd-4ac5-92a5-fcd5d7e29965",
  actorSessionId: "7503716b-d3bf-40d4-a728-e23cf34180e6",
  actorUserId: "24ea967f-8c48-4304-b3fa-2e729d2b683d",
  targetUserId: "4d2c2e36-a3bd-4ac5-92a5-fcd5d7e29965",
  targetVersion: 7,
  reason: "Penautan disetujui Admin Akses.",
};

const confirmation = {
  actorSessionId: linkInput.actorSessionId,
  actorUserId: linkInput.actorUserId,
  schoolId: "3e6cffab-4658-46db-8524-aad6d34775b1",
  targetUserId: linkInput.targetUserId,
  targetVersion: linkInput.targetVersion,
  reason: linkInput.reason,
  returnPath: linkInput.returnPath,
  issuer: "https://accounts.google.com",
  subject: "google-subject-123",
  email: "student@school.example",
  hostedDomain: "school.example",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redisSet.mockResolvedValue("OK");
});

describe("Google OIDC transaction state", () => {
  it("stores a login transaction with a ten-minute TTL and NX", async () => {
    const transaction = await createGoogleOidcTransaction({
      schoolCode: "school-main",
      redirectUri: "https://ejls.school.example/api/auth/google/callback",
    });

    expect(transaction).toMatchObject({
      state: "S".repeat(43),
      purpose: "LOGIN",
      nonce: "N".repeat(43),
      codeVerifier: "V".repeat(43),
      codeChallenge: "C".repeat(43),
      returnPath: "/",
    });
    expect(mocks.redisSet).toHaveBeenCalledWith(
      expect.stringContaining("oidc:google:state"),
      expect.any(String),
      "EX",
      600,
      "NX",
    );
  });

  it("fails closed when Redis does not persist the transaction", async () => {
    mocks.redisSet.mockResolvedValue(null);

    await expect(
      createGoogleOidcTransaction({
        schoolCode: "school-main",
        redirectUri: "https://ejls.school.example/api/auth/google/callback",
      }),
    ).rejects.toThrow("Could not persist");
  });

  it("rejects incomplete link binding and non-allowlisted returns", async () => {
    await expect(
      createGoogleOidcTransaction({
        purpose: "LINK",
        schoolCode: "school-main",
        redirectUri: linkInput.redirectUri,
        returnPath: linkInput.returnPath,
      }),
    ).rejects.toThrow("Incomplete");

    await expect(
      createGoogleOidcTransaction({
        ...linkInput,
        returnPath: "https://attacker.example/admin/akses?user=4d2c2e36-a3bd-4ac5-92a5-fcd5d7e29965",
      }),
    ).rejects.toThrow("return path");
  });

  it("consumes valid state once and rejects malformed or replayed state", async () => {
    const stored = JSON.stringify({
      purpose: "LINK",
      nonce: "N".repeat(43),
      codeVerifier: "V".repeat(43),
      codeChallenge: "C".repeat(43),
      schoolCode: linkInput.schoolCode,
      redirectUri: linkInput.redirectUri,
      returnPath: linkInput.returnPath,
      actorSessionId: linkInput.actorSessionId,
      actorUserId: linkInput.actorUserId,
      targetUserId: linkInput.targetUserId,
      targetVersion: linkInput.targetVersion,
      reason: linkInput.reason,
    });
    mocks.redisGetdel.mockResolvedValueOnce(stored).mockResolvedValueOnce(null);

    await expect(consumeGoogleOidcTransaction("S".repeat(43))).resolves.toMatchObject({
      purpose: "LINK",
      actorSessionId: linkInput.actorSessionId,
      targetUserId: linkInput.targetUserId,
      targetVersion: 7,
    });
    await expect(consumeGoogleOidcTransaction("S".repeat(43))).resolves.toBeNull();
    await expect(consumeGoogleOidcTransaction("invalid-state")).resolves.toBeNull();
    expect(mocks.redisGetdel).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed persisted transaction data and Redis errors", async () => {
    mocks.redisGetdel
      .mockResolvedValueOnce(JSON.stringify({ purpose: "LOGIN" }))
      .mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(consumeGoogleOidcTransaction("S".repeat(43))).resolves.toBeNull();
    await expect(consumeGoogleOidcTransaction("S".repeat(43))).resolves.toBeNull();
  });
});

describe("Google identity-link confirmation", () => {
  it("stores only server-side confirmation data with TTL and NX", async () => {
    await expect(createGoogleLinkConfirmation(confirmation)).resolves.toBe("S".repeat(43));

    expect(mocks.redisSet).toHaveBeenCalledWith(
      expect.stringContaining("link-confirmation"),
      JSON.stringify(confirmation),
      "EX",
      600,
      "NX",
    );
  });

  it("fails closed when a confirmation cannot be persisted", async () => {
    mocks.redisSet.mockResolvedValue(null);

    await expect(createGoogleLinkConfirmation(confirmation)).rejects.toThrow(
      "Could not persist",
    );
  });

  it("allows a non-consuming peek and a one-use consume", async () => {
    const serialized = JSON.stringify(confirmation);
    mocks.redisGet.mockResolvedValue(serialized);
    mocks.redisGetdel.mockResolvedValueOnce(serialized).mockResolvedValueOnce(null);

    await expect(peekGoogleLinkConfirmation("S".repeat(43))).resolves.toEqual({
      confirmationToken: "S".repeat(43),
      ...confirmation,
    });
    await expect(consumeGoogleLinkConfirmation("S".repeat(43))).resolves.toEqual({
      confirmationToken: "S".repeat(43),
      ...confirmation,
    });
    await expect(consumeGoogleLinkConfirmation("S".repeat(43))).resolves.toBeNull();
  });

  it("rejects malformed confirmation data and unsafe returns", async () => {
    mocks.redisGet
      .mockResolvedValueOnce(JSON.stringify({ ...confirmation, actorSessionId: 123 }))
      .mockResolvedValueOnce(JSON.stringify({ ...confirmation, returnPath: "//attacker.example" }));

    await expect(peekGoogleLinkConfirmation("S".repeat(43))).resolves.toBeNull();
    await expect(peekGoogleLinkConfirmation("S".repeat(43))).resolves.toBeNull();
  });
});
