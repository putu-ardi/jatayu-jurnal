import "server-only";

import { randomUUID } from "node:crypto";
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  type IDToken,
} from "openid-client";
import { getDatabase } from "@/lib/database";
import { appendAuditLog } from "@/modules/audit/service";
import { createOpaqueSessionToken } from "./crypto";
import { AuthorizationDeniedError, ConflictError } from "./errors";
import {
  getGoogleOidcProviderConfiguration,
  requireGoogleOidcSettings,
} from "./google-oidc-config";
import {
  consumeGoogleOidcTransaction,
  createGoogleLinkConfirmation,
  createGoogleOidcTransaction,
} from "./google-oidc-state";
import { authorize, capabilities } from "./policy";
import {
  getCurrentPrincipal,
  hasRecentAuthentication,
  persistSession,
  requireCapability,
  setSessionCookie,
} from "./session-dal";

const GOOGLE_PROVIDER = "GOOGLE_WORKSPACE" as const;
const GENERIC_FAILURE = "Login Google Workspace tidak dapat diproses.";

export type GoogleAuthenticationResult =
  | { ok: true; purpose: "LOGIN"; returnPath: string }
  | { ok: true; purpose: "LINK"; returnPath: string; confirmationToken: string }
  | { ok: false; message: string };

export async function createGoogleAuthorizationRequest() {
  const settings = requireGoogleOidcSettings();
  const configuration = await getGoogleOidcProviderConfiguration();
  const transaction = await createGoogleOidcTransaction({
    schoolCode: settings.schoolCode,
    redirectUri: settings.redirectUri,
  });

  const url = buildAuthorizationUrl(configuration, {
    redirect_uri: transaction.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: transaction.codeChallenge,
    code_challenge_method: "S256",
    hd: settings.hostedDomain,
    prompt: "select_account",
  });

  return { url, state: transaction.state };
}

export async function createGoogleIdentityLinkAuthorizationRequest(input: {
  targetUserId: string;
  expectedVersion: number;
  reason: string;
}) {
  const settings = requireGoogleOidcSettings();
  const { principal, actorAssignmentId } = await requireCapability(
    capabilities.identityLinkManage,
  );
  if (
    !hasRecentAuthentication(principal) ||
    principal.userId === input.targetUserId
  ) {
    throw new AuthorizationDeniedError();
  }

  const target = await getDatabase().user.findFirst({
    where: { id: input.targetUserId, schoolId: principal.schoolId },
    select: {
      id: true,
      version: true,
      status: true,
      identities: {
        where: { provider: GOOGLE_PROVIDER, issuer: settings.issuer },
        select: { id: true },
      },
    },
  });
  if (!target || !actorAssignmentId || target.status !== "ACTIVE") {
    throw new AuthorizationDeniedError();
  }
  if (target.version !== input.expectedVersion || target.identities.length > 0) {
    throw new ConflictError();
  }

  const school = await getDatabase().school.findUnique({
    where: { id: principal.schoolId },
    select: { code: true },
  });
  if (!school || school.code.toLowerCase() !== settings.schoolCode.toLowerCase()) {
    throw new AuthorizationDeniedError();
  }

  const transaction = await createGoogleOidcTransaction({
    purpose: "LINK",
    schoolCode: school.code,
    redirectUri: settings.linkRedirectUri,
    returnPath: `/admin/akses?user=${target.id}`,
    actorSessionId: principal.sessionId,
    actorUserId: principal.userId,
    targetUserId: target.id,
    targetVersion: target.version,
    reason: input.reason,
  });
  const configuration = await getGoogleOidcProviderConfiguration();
  const url = buildAuthorizationUrl(configuration, {
    redirect_uri: transaction.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: transaction.codeChallenge,
    code_challenge_method: "S256",
    hd: settings.hostedDomain,
    prompt: "select_account",
  });
  return { url, state: transaction.state };
}

export async function authenticateWithGoogleCallback(
  request: Request,
  expectedPurpose: "LOGIN" | "LINK",
): Promise<GoogleAuthenticationResult> {
  const settings = requireGoogleOidcSettings();
  const incomingUrl = new URL(request.url);
  const state = incomingUrl.searchParams.get("state");
  if (!state) return { ok: false, message: GENERIC_FAILURE };

  const transaction = await consumeGoogleOidcTransaction(state);
  const expectedRedirectUri =
    expectedPurpose === "LOGIN" ? settings.redirectUri : settings.linkRedirectUri;
  if (
    !transaction ||
    transaction.purpose !== expectedPurpose ||
    transaction.redirectUri !== expectedRedirectUri ||
    transaction.schoolCode.toLowerCase() !== settings.schoolCode.toLowerCase()
  ) {
    return { ok: false, message: GENERIC_FAILURE };
  }

  if (incomingUrl.searchParams.get("error") || !incomingUrl.searchParams.get("code")) {
    const school = await getDatabase().school.findFirst({
      where: { code: { equals: transaction.schoolCode, mode: "insensitive" } },
      select: { id: true },
    });
    if (school) {
      await recordGoogleDenial(school.id, "Google tidak mengembalikan authorization code.");
    }
    return { ok: false, message: GENERIC_FAILURE };
  }

  const school = await getDatabase().school.findFirst({
    where: { code: { equals: transaction.schoolCode, mode: "insensitive" } },
    select: { id: true },
  });
  if (!school || transaction.schoolCode.toLowerCase() !== settings.schoolCode.toLowerCase()) {
    return { ok: false, message: GENERIC_FAILURE };
  }

  try {
    const configuration = await getGoogleOidcProviderConfiguration();
    const callbackUrl = new URL(transaction.redirectUri);
    callbackUrl.search = incomingUrl.search;
    const tokens = await authorizationCodeGrant(configuration, callbackUrl, {
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      pkceCodeVerifier: transaction.codeVerifier,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    const identity = validateGoogleClaims(claims, settings);
    if (!identity) {
      await recordGoogleDenial(school.id, "Klaim identitas Google tidak memenuhi kebijakan.");
      return { ok: false, message: GENERIC_FAILURE };
    }

    if (transaction.purpose === "LINK") {
      if (
        !transaction.actorSessionId ||
        !transaction.actorUserId ||
        !transaction.targetUserId ||
        typeof transaction.targetVersion !== "number" ||
        !transaction.reason
      ) {
        return { ok: false, message: GENERIC_FAILURE };
      }
      const principal = await getCurrentPrincipal();
      const linkScope = {
        schoolId: school.id,
        type: "SCHOOL" as const,
        reference: null,
      };
      if (
        !principal ||
        principal.sessionId !== transaction.actorSessionId ||
        principal.userId !== transaction.actorUserId ||
        principal.userId === transaction.targetUserId ||
        principal.schoolId !== school.id ||
        !hasRecentAuthentication(principal) ||
        !authorize(principal, capabilities.identityLinkManage, linkScope).allowed
      ) {
        return { ok: false, message: GENERIC_FAILURE };
      }
      const target = await getDatabase().user.findFirst({
        where: { id: transaction.targetUserId, schoolId: school.id },
        select: {
          version: true,
          status: true,
          identities: {
            where: { provider: GOOGLE_PROVIDER, issuer: settings.issuer },
            select: { id: true },
          },
        },
      });
      if (
        !target ||
        target.status !== "ACTIVE" ||
        target.version !== transaction.targetVersion ||
        target.identities.length > 0
      ) {
        return { ok: false, message: GENERIC_FAILURE };
      }
      const confirmationToken = await createGoogleLinkConfirmation({
        actorSessionId: transaction.actorSessionId,
        actorUserId: transaction.actorUserId,
        schoolId: school.id,
        targetUserId: transaction.targetUserId,
        targetVersion: transaction.targetVersion,
        reason: transaction.reason,
        returnPath: transaction.returnPath,
        issuer: settings.issuer,
        subject: identity.subject,
        email: identity.email,
        hostedDomain: identity.hostedDomain,
      });
      return {
        ok: true,
        purpose: "LINK",
        returnPath: transaction.returnPath,
        confirmationToken,
      };
    }

    const { token, tokenHash } = createOpaqueSessionToken();
    const now = new Date();
    const sessionResult = await getDatabase().$transaction(async (transactionClient) => {
      const [linkedIdentity] = await transactionClient.$queryRaw<Array<{
        identityId: string;
        userId: string;
        schoolId: string;
        userStatus: string;
      }>>`
        SELECT
          identity.id AS "identityId",
          identity."userId" AS "userId",
          actor."schoolId" AS "schoolId",
          actor.status::text AS "userStatus"
        FROM "user_identities" identity
        JOIN "users" actor ON actor.id = identity."userId"
        WHERE identity.provider = ${GOOGLE_PROVIDER}::"IdentityProvider"
          AND identity.issuer = ${settings.issuer}
          AND identity.subject = ${identity.subject}
          AND actor."schoolId" = ${school.id}::uuid
        FOR UPDATE OF identity, actor
      `;

      if (!linkedIdentity || linkedIdentity.userStatus !== "ACTIVE") {
        await appendAuditLog(transactionClient, {
          schoolId: school.id,
          eventType: "auth.google.denied",
          entityType: "Authentication",
          action: "login",
          outcome: "DENIED",
          reason: "Identitas Google belum tertaut atau pengguna tidak aktif.",
          metadata: {
            authMethod: GOOGLE_PROVIDER,
            hostedDomain: identity.hostedDomain,
          },
          correlationId: randomUUID(),
        });
        return null;
      }

      const session = await persistSession(
        {
          userId: linkedIdentity.userId,
          token,
          tokenHash,
          authMethod: GOOGLE_PROVIDER,
          authenticatedAt: now,
        },
        transactionClient,
      );
      await transactionClient.user.update({
        where: { id: linkedIdentity.userId },
        data: { lastLoginAt: now },
      });
      await transactionClient.userIdentity.update({
        where: { id: linkedIdentity.identityId },
        data: { lastUsedAt: now, emailVerified: true },
      });
      await appendAuditLog(transactionClient, {
        schoolId: school.id,
        subjectUserId: linkedIdentity.userId,
        eventType: "auth.google.succeeded",
        entityType: "User",
        entityId: linkedIdentity.userId,
        action: "login",
        outcome: "SUCCEEDED",
        metadata: {
          authMethod: GOOGLE_PROVIDER,
          hostedDomain: identity.hostedDomain,
        },
        correlationId: randomUUID(),
      });

      return session;
    });

    if (!sessionResult) return { ok: false, message: GENERIC_FAILURE };
    await setSessionCookie(token, sessionResult.expiresAt);
    return { ok: true, purpose: "LOGIN", returnPath: transaction.returnPath };
  } catch {
    await recordGoogleDenial(school.id, "Proses OIDC Google gagal.");
    return { ok: false, message: GENERIC_FAILURE };
  }
}

type GoogleIdentityClaims = {
  subject: string;
  email: string;
  hostedDomain: string;
};

export function validateGoogleClaims(
  claims: IDToken | undefined,
  settings: ReturnType<typeof requireGoogleOidcSettings>,
): GoogleIdentityClaims | null {
  if (
    !claims ||
    claims.iss !== settings.issuer ||
    typeof claims.sub !== "string" ||
    claims.sub.length === 0 ||
    claims.sub.length > 255
  ) {
    return null;
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !audiences.includes(settings.clientId) ||
    (audiences.length > 1 && claims.azp !== settings.clientId) ||
    (claims.azp !== undefined && claims.azp !== settings.clientId)
  ) {
    return null;
  }

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const hostedDomain = typeof claims.hd === "string" ? claims.hd.trim().toLowerCase() : "";
  if (
    !email ||
    email.length > 254 ||
    !hostedDomain ||
    claims.email_verified !== true ||
    hostedDomain !== settings.hostedDomain.toLowerCase()
  ) {
    return null;
  }

  return { subject: claims.sub, email, hostedDomain };
}

async function recordGoogleDenial(schoolId: string, reason: string) {
  try {
    await getDatabase().$transaction(async (transaction) => {
      await appendAuditLog(transaction, {
        schoolId,
        eventType: "auth.google.denied",
        entityType: "Authentication",
        action: "login",
        outcome: "DENIED",
        reason,
        metadata: { authMethod: GOOGLE_PROVIDER },
        correlationId: randomUUID(),
      });
    });
  } catch {
    // Authentication remains denied if audit persistence is unavailable.
  }
}
