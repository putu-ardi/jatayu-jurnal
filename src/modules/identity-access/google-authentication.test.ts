import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "./policy";

vi.mock("server-only", () => ({}));

const settings = {
  issuer: "https://accounts.google.com",
  clientId: "client-id.apps.googleusercontent.com",
  clientSecret: "client-secret",
  hostedDomain: "school.example",
  redirectUri: "https://ejls.school.example/api/auth/google/callback",
  linkRedirectUri: "https://ejls.school.example/api/auth/google/link/callback",
  schoolCode: "school-main",
};

const mocks = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    user: { update: vi.fn() },
    userIdentity: { update: vi.fn() },
  };
  return {
    transaction,
    databaseTransaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    schoolFindFirst: vi.fn(),
    schoolFindUnique: vi.fn(),
    userFindFirst: vi.fn(),
    appendAuditLog: vi.fn(),
    authorizationCodeGrant: vi.fn(),
    buildAuthorizationUrl: vi.fn(),
    consumeGoogleOidcTransaction: vi.fn(),
    createGoogleLinkConfirmation: vi.fn(),
    createGoogleOidcTransaction: vi.fn(),
    getCurrentPrincipal: vi.fn(),
    hasRecentAuthentication: vi.fn(),
    persistSession: vi.fn(),
    setSessionCookie: vi.fn(),
    requireCapability: vi.fn(),
    createOpaqueSessionToken: vi.fn(),
  };
});

vi.mock("@/lib/database", () => ({
  getDatabase: () => ({
    school: {
      findFirst: mocks.schoolFindFirst,
      findUnique: mocks.schoolFindUnique,
    },
    user: { findFirst: mocks.userFindFirst },
    $transaction: mocks.databaseTransaction,
  }),
}));

vi.mock("@/modules/audit/service", () => ({
  appendAuditLog: mocks.appendAuditLog,
}));

vi.mock("openid-client", () => ({
  authorizationCodeGrant: mocks.authorizationCodeGrant,
  buildAuthorizationUrl: mocks.buildAuthorizationUrl,
}));

vi.mock("./crypto", () => ({
  createOpaqueSessionToken: mocks.createOpaqueSessionToken,
}));

vi.mock("./google-oidc-config", () => ({
  getGoogleOidcProviderConfiguration: async () => ({}),
  requireGoogleOidcSettings: () => settings,
}));

vi.mock("./google-oidc-state", () => ({
  consumeGoogleOidcTransaction: mocks.consumeGoogleOidcTransaction,
  createGoogleLinkConfirmation: mocks.createGoogleLinkConfirmation,
  createGoogleOidcTransaction: mocks.createGoogleOidcTransaction,
}));

vi.mock("./session-dal", () => ({
  getCurrentPrincipal: mocks.getCurrentPrincipal,
  hasRecentAuthentication: mocks.hasRecentAuthentication,
  persistSession: mocks.persistSession,
  requireCapability: mocks.requireCapability,
  setSessionCookie: mocks.setSessionCookie,
}));

import { AuthorizationDeniedError } from "./errors";
import {
  authenticateWithGoogleCallback,
  createGoogleIdentityLinkAuthorizationRequest,
  validateGoogleClaims,
} from "./google-authentication";

const state = "S".repeat(43);
const actorPrincipal: Principal = {
  sessionId: "session-actor",
  userId: "actor-user",
  schoolId: "school-a",
  fullName: "Admin Akses",
  email: "admin@school.example",
  authenticatedAt: new Date("2026-07-22T10:00:00.000Z"),
  assignments: [
    {
      id: "assignment-actor",
      schoolId: "school-a",
      userId: "actor-user",
      roleKey: "admin-akses",
      permissions: ["iam.identities.link"],
      scope: { schoolId: "school-a", type: "SCHOOL", reference: null },
      activeFrom: new Date("2026-01-01T00:00:00.000Z"),
      activeUntil: null,
      revokedAt: null,
      grantBoundaries: [],
    },
  ],
};

const validClaims = {
  iss: settings.issuer,
  sub: "google-subject-123",
  aud: settings.clientId,
  azp: settings.clientId,
  email: " Student@School.Example ",
  email_verified: true,
  hd: "School.Example",
  iat: 1_800_000_000,
  exp: 1_800_000_600,
};

const loginTransaction = {
  state,
  purpose: "LOGIN" as const,
  nonce: "nonce",
  codeVerifier: "verifier",
  codeChallenge: "challenge",
  schoolCode: settings.schoolCode,
  redirectUri: settings.redirectUri,
  returnPath: "/",
};

const linkTransaction = {
  ...loginTransaction,
  purpose: "LINK" as const,
  redirectUri: settings.linkRedirectUri,
  returnPath: "/admin/akses?user=4d2c2e36-a3bd-4ac5-92a5-fcd5d7e29965",
  actorSessionId: actorPrincipal.sessionId,
  actorUserId: actorPrincipal.userId,
  targetUserId: "target-user",
  targetVersion: 7,
  reason: "Penautan disetujui Admin Akses.",
};

function callbackRequest(purpose: "LOGIN" | "LINK" = "LOGIN") {
  const redirectUri = purpose === "LOGIN" ? settings.redirectUri : settings.linkRedirectUri;
  return new Request(`${redirectUri}?code=authorization-code&state=${state}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.schoolFindFirst.mockResolvedValue({ id: actorPrincipal.schoolId });
  mocks.schoolFindUnique.mockResolvedValue({ code: settings.schoolCode });
  mocks.authorizationCodeGrant.mockResolvedValue({ claims: () => validClaims });
  mocks.getCurrentPrincipal.mockResolvedValue(actorPrincipal);
  mocks.requireCapability.mockResolvedValue({
    principal: actorPrincipal,
    actorAssignmentId: "assignment-actor",
  });
  mocks.createGoogleOidcTransaction.mockResolvedValue({
    state,
    nonce: "nonce",
    codeChallenge: "challenge",
    redirectUri: settings.linkRedirectUri,
  });
  mocks.buildAuthorizationUrl.mockReturnValue("https://accounts.google.com/o/oauth2/auth");
  mocks.hasRecentAuthentication.mockReturnValue(true);
  mocks.userFindFirst.mockResolvedValue({
    version: linkTransaction.targetVersion,
    status: "ACTIVE",
    identities: [],
  });
  mocks.createGoogleLinkConfirmation.mockResolvedValue("C".repeat(43));
  mocks.createOpaqueSessionToken.mockReturnValue({ token: "opaque", tokenHash: "hash" });
});

describe("validateGoogleClaims", () => {
  it("normalizes a valid signed Google identity", () => {
    expect(validateGoogleClaims(validClaims as never, settings)).toEqual({
      subject: validClaims.sub,
      email: "student@school.example",
      hostedDomain: "school.example",
    });
  });

  it.each([
    ["issuer", { iss: "https://issuer.example" }],
    ["missing subject", { sub: "" }],
    ["long subject", { sub: "x".repeat(256) }],
    ["audience", { aud: "other-client" }],
    ["authorized party", { azp: "other-client" }],
    ["verified email", { email_verified: false }],
    ["hosted domain", { hd: "other.example" }],
    ["email storage limit", { email: `${"a".repeat(250)}@school.example` }],
  ])("rejects an invalid %s claim", (_label, override) => {
    expect(validateGoogleClaims({ ...validClaims, ...override } as never, settings)).toBeNull();
  });

  it("requires azp to identify this client for a multi-audience token", () => {
    expect(
      validateGoogleClaims(
        { ...validClaims, aud: [settings.clientId, "other-client"], azp: undefined } as never,
        settings,
      ),
    ).toBeNull();
  });
});

describe("createGoogleIdentityLinkAuthorizationRequest", () => {
  const input = {
    targetUserId: "target-user",
    expectedVersion: 7,
    reason: "Penautan identitas disetujui Admin Akses.",
  };

  it("rejects a non-active target before creating an OIDC transaction", async () => {
    for (const status of ["INVITED", "SUSPENDED", "DEACTIVATED"] as const) {
      vi.clearAllMocks();
      mocks.requireCapability.mockResolvedValue({
        principal: actorPrincipal,
        actorAssignmentId: "assignment-actor",
      });
      mocks.hasRecentAuthentication.mockReturnValue(true);
      mocks.userFindFirst.mockResolvedValue({
        id: input.targetUserId,
        version: input.expectedVersion,
        status,
        identities: [],
      });

      await expect(
        createGoogleIdentityLinkAuthorizationRequest(input),
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      expect(mocks.createGoogleOidcTransaction).not.toHaveBeenCalled();
    }
  });

  it("creates a bound link transaction only for an active target", async () => {
    mocks.userFindFirst.mockResolvedValue({
      id: input.targetUserId,
      version: input.expectedVersion,
      status: "ACTIVE",
      identities: [],
    });

    await expect(
      createGoogleIdentityLinkAuthorizationRequest(input),
    ).resolves.toEqual({
      url: "https://accounts.google.com/o/oauth2/auth",
      state,
    });
    expect(mocks.createGoogleOidcTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "LINK",
        targetUserId: input.targetUserId,
        targetVersion: input.expectedVersion,
        actorSessionId: actorPrincipal.sessionId,
        actorUserId: actorPrincipal.userId,
      }),
    );
  });
});

describe("authenticateWithGoogleCallback", () => {
  it("rejects unknown, expired, or replayed state before token exchange", async () => {
    mocks.consumeGoogleOidcTransaction.mockResolvedValue(null);

    await expect(
      authenticateWithGoogleCallback(callbackRequest(), "LOGIN"),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.authorizationCodeGrant).not.toHaveBeenCalled();
  });

  it("rejects purpose and exact redirect URI mismatches", async () => {
    mocks.consumeGoogleOidcTransaction
      .mockResolvedValueOnce(linkTransaction)
      .mockResolvedValueOnce({ ...loginTransaction, redirectUri: settings.linkRedirectUri });

    await expect(
      authenticateWithGoogleCallback(callbackRequest(), "LOGIN"),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      authenticateWithGoogleCallback(callbackRequest(), "LOGIN"),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.authorizationCodeGrant).not.toHaveBeenCalled();
  });

  it("creates only a bound confirmation for a valid link callback", async () => {
    mocks.consumeGoogleOidcTransaction.mockResolvedValue(linkTransaction);

    await expect(
      authenticateWithGoogleCallback(callbackRequest("LINK"), "LINK"),
    ).resolves.toEqual({
      ok: true,
      purpose: "LINK",
      returnPath: linkTransaction.returnPath,
      confirmationToken: "C".repeat(43),
    });

    expect(mocks.createGoogleLinkConfirmation).toHaveBeenCalledWith({
      actorSessionId: linkTransaction.actorSessionId,
      actorUserId: linkTransaction.actorUserId,
      schoolId: actorPrincipal.schoolId,
      targetUserId: linkTransaction.targetUserId,
      targetVersion: linkTransaction.targetVersion,
      reason: linkTransaction.reason,
      returnPath: linkTransaction.returnPath,
      issuer: settings.issuer,
      subject: validClaims.sub,
      email: "student@school.example",
      hostedDomain: "school.example",
    });
    expect(mocks.createOpaqueSessionToken).not.toHaveBeenCalled();
    expect(mocks.persistSession).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it.each([
    ["session", { sessionId: "session-other" }],
    ["actor", { userId: "target-user" }],
    ["school", { schoolId: "school-other" }],
  ])("denies a link callback with mismatched %s binding", async (_label, principalOverride) => {
    mocks.consumeGoogleOidcTransaction.mockResolvedValue(linkTransaction);
    mocks.getCurrentPrincipal.mockResolvedValue({ ...actorPrincipal, ...principalOverride });

    await expect(
      authenticateWithGoogleCallback(callbackRequest("LINK"), "LINK"),
    ).resolves.toMatchObject({ ok: false });

    expect(mocks.createGoogleLinkConfirmation).not.toHaveBeenCalled();
    expect(mocks.persistSession).not.toHaveBeenCalled();
  });

  it.each(["INVITED", "SUSPENDED", "DEACTIVATED"])(
    "denies a link callback for a %s target",
    async (status) => {
      mocks.consumeGoogleOidcTransaction.mockResolvedValue(linkTransaction);
      mocks.userFindFirst.mockResolvedValue({
        version: linkTransaction.targetVersion,
        status,
        identities: [],
      });

      await expect(
        authenticateWithGoogleCallback(callbackRequest("LINK"), "LINK"),
      ).resolves.toMatchObject({ ok: false });
      expect(mocks.createGoogleLinkConfirmation).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["stale version", { version: linkTransaction.targetVersion + 1, status: "ACTIVE", identities: [] }],
    ["existing Google identity", { version: linkTransaction.targetVersion, status: "ACTIVE", identities: [{ id: "identity-existing" }] }],
  ])("denies a link callback with %s", async (_label, target) => {
    mocks.consumeGoogleOidcTransaction.mockResolvedValue(linkTransaction);
    mocks.userFindFirst.mockResolvedValue(target);

    await expect(
      authenticateWithGoogleCallback(callbackRequest("LINK"), "LINK"),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.createGoogleLinkConfirmation).not.toHaveBeenCalled();
  });

  it("never auto-links a login by email when issuer and subject are unknown", async () => {
    mocks.consumeGoogleOidcTransaction.mockResolvedValue(loginTransaction);
    mocks.transaction.$queryRaw.mockResolvedValue([]);

    await expect(
      authenticateWithGoogleCallback(callbackRequest(), "LOGIN"),
    ).resolves.toMatchObject({ ok: false });

    expect(mocks.transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.persistSession).not.toHaveBeenCalled();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });
});
