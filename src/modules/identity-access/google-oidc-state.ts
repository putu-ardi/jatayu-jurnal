import "server-only";

import { getApplicationRedis } from "@/lib/application-redis";
import {
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";

const STATE_KEY_PREFIX = "ejls:oidc:google:state:v1:";
const CONFIRMATION_KEY_PREFIX = "ejls:oidc:google:link-confirmation:v1:";
export const GOOGLE_LINK_STATE_COOKIE = "ejls_google_link_state";
export const GOOGLE_LINK_CONFIRMATION_COOKIE = "ejls_google_link_confirmation";
const STATE_TTL_SECONDS = 10 * 60;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETURN_PATH = "/";

function isAllowedReturnPath(purpose: GoogleOidcPurpose, value: string) {
  if (purpose === "LOGIN") return value === RETURN_PATH;
  try {
    const url = new URL(value, "https://ejls.invalid");
    return (
      url.origin === "https://ejls.invalid" &&
      url.pathname === "/admin/akses" &&
      url.hash === "" &&
      url.searchParams.size === 1 &&
      UUID_PATTERN.test(url.searchParams.get("user") ?? "")
    );
  } catch {
    return false;
  }
}

export type GoogleOidcPurpose = "LOGIN" | "LINK";

export type GoogleOidcTransaction = {
  state: string;
  purpose: GoogleOidcPurpose;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  schoolCode: string;
  redirectUri: string;
  returnPath: string;
  actorSessionId?: string;
  actorUserId?: string;
  targetUserId?: string;
  targetVersion?: number;
  reason?: string;
};

export type GoogleLinkConfirmation = {
  confirmationToken: string;
  actorSessionId: string;
  actorUserId: string;
  schoolId: string;
  targetUserId: string;
  targetVersion: number;
  reason: string;
  returnPath: string;
  issuer: string;
  subject: string;
  email: string;
  hostedDomain: string;
};

type StoredTransaction = Omit<GoogleOidcTransaction, "state">;
type StoredConfirmation = Omit<GoogleLinkConfirmation, "confirmationToken">;

export async function createGoogleOidcTransaction(input: {
  purpose?: GoogleOidcPurpose;
  schoolCode: string;
  redirectUri: string;
  returnPath?: string;
  actorSessionId?: string;
  actorUserId?: string;
  targetUserId?: string;
  targetVersion?: number;
  reason?: string;
}): Promise<GoogleOidcTransaction> {
  const purpose = input.purpose ?? "LOGIN";
  const isCompleteLinkTransaction =
    typeof input.actorSessionId === "string" &&
    typeof input.actorUserId === "string" &&
    typeof input.targetUserId === "string" &&
    typeof input.targetVersion === "number" &&
    typeof input.reason === "string";
  if (purpose === "LINK" && !isCompleteLinkTransaction) {
    throw new Error("Incomplete Google identity-link transaction.");
  }
  const returnPath = input.returnPath ?? RETURN_PATH;
  if (!isAllowedReturnPath(purpose, returnPath)) {
    throw new Error("Google OIDC return path is not allowed.");
  }

  const state = randomState();
  const codeVerifier = randomPKCECodeVerifier();
  const transaction: StoredTransaction = {
    purpose,
    nonce: randomNonce(),
    codeVerifier,
    codeChallenge: await calculatePKCECodeChallenge(codeVerifier),
    schoolCode: input.schoolCode,
    redirectUri: input.redirectUri,
    returnPath,
    actorSessionId: input.actorSessionId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    targetVersion: input.targetVersion,
    reason: input.reason,
  };

  const stored = await getApplicationRedis().set(
    `${STATE_KEY_PREFIX}${state}`,
    JSON.stringify(transaction),
    "EX",
    STATE_TTL_SECONDS,
    "NX",
  );
  if (stored !== "OK") {
    throw new Error("Could not persist Google OIDC transaction.");
  }

  return { state, ...transaction };
}

export async function consumeGoogleOidcTransaction(
  state: string,
): Promise<GoogleOidcTransaction | null> {
  if (!STATE_PATTERN.test(state)) return null;

  let serialized: string | null;
  try {
    serialized = await getApplicationRedis().getdel(`${STATE_KEY_PREFIX}${state}`);
  } catch {
    return null;
  }

  if (!serialized) return null;

  try {
    const parsed = JSON.parse(serialized) as Partial<StoredTransaction>;
    if (
      (parsed.purpose !== "LOGIN" && parsed.purpose !== "LINK") ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.codeChallenge !== "string" ||
      typeof parsed.schoolCode !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.returnPath !== "string" ||
      !isAllowedReturnPath(parsed.purpose, parsed.returnPath)
    ) {
      return null;
    }

    return {
      state,
      purpose: parsed.purpose,
      nonce: parsed.nonce,
      codeVerifier: parsed.codeVerifier,
      codeChallenge: parsed.codeChallenge,
      schoolCode: parsed.schoolCode,
      redirectUri: parsed.redirectUri,
      returnPath: parsed.returnPath,
      actorSessionId: parsed.actorSessionId,
      actorUserId: parsed.actorUserId,
      targetUserId: parsed.targetUserId,
      targetVersion: parsed.targetVersion,
      reason: parsed.reason,
    };
  } catch {
    return null;
  }
}

export async function createGoogleLinkConfirmation(input: Omit<GoogleLinkConfirmation, "confirmationToken">) {
  const confirmationToken = randomState();
  const serialized = JSON.stringify(input);
  const stored = await getApplicationRedis().set(
    `${CONFIRMATION_KEY_PREFIX}${confirmationToken}`,
    serialized,
    "EX",
    STATE_TTL_SECONDS,
    "NX",
  );
  if (stored !== "OK") {
    throw new Error("Could not persist Google identity-link confirmation.");
  }
  return confirmationToken;
}

export async function peekGoogleLinkConfirmation(
  confirmationToken: string,
): Promise<GoogleLinkConfirmation | null> {
  if (!STATE_PATTERN.test(confirmationToken)) return null;

  let serialized: string | null;
  try {
    serialized = await getApplicationRedis().get(
      `${CONFIRMATION_KEY_PREFIX}${confirmationToken}`,
    );
  } catch {
    return null;
  }
  return parseGoogleLinkConfirmation(serialized, confirmationToken);
}

export async function consumeGoogleLinkConfirmation(
  confirmationToken: string,
): Promise<GoogleLinkConfirmation | null> {
  if (!STATE_PATTERN.test(confirmationToken)) return null;

  let serialized: string | null;
  try {
    serialized = await getApplicationRedis().getdel(
      `${CONFIRMATION_KEY_PREFIX}${confirmationToken}`,
    );
  } catch {
    return null;
  }
  return parseGoogleLinkConfirmation(serialized, confirmationToken);
}

function parseGoogleLinkConfirmation(
  serialized: string | null,
  confirmationToken: string,
): GoogleLinkConfirmation | null {
  if (!serialized) return null;

  try {
    const parsed = JSON.parse(serialized) as Partial<StoredConfirmation>;
    if (
      typeof parsed.actorSessionId !== "string" ||
      typeof parsed.actorUserId !== "string" ||
      typeof parsed.schoolId !== "string" ||
      typeof parsed.targetUserId !== "string" ||
      typeof parsed.targetVersion !== "number" ||
      typeof parsed.reason !== "string" ||
      typeof parsed.returnPath !== "string" ||
      !isAllowedReturnPath("LINK", parsed.returnPath) ||
      typeof parsed.issuer !== "string" ||
      typeof parsed.subject !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.hostedDomain !== "string"
    ) {
      return null;
    }
    return {
      confirmationToken,
      actorSessionId: parsed.actorSessionId,
      actorUserId: parsed.actorUserId,
      schoolId: parsed.schoolId,
      targetUserId: parsed.targetUserId,
      targetVersion: parsed.targetVersion,
      reason: parsed.reason,
      returnPath: parsed.returnPath,
      issuer: parsed.issuer,
      subject: parsed.subject,
      email: parsed.email,
      hostedDomain: parsed.hostedDomain,
    };
  } catch {
    return null;
  }
}
