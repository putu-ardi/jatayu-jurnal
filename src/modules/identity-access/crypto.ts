import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";

const BCRYPT_COST = 12;
const BCRYPT_MAX_BYTES = 72;

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOpaqueSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashOpaqueToken(token) };
}

export function validateFallbackPassword(password: string) {
  const byteLength = Buffer.byteLength(password, "utf8");
  return (
    password.length >= 12 &&
    byteLength <= BCRYPT_MAX_BYTES &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export async function hashFallbackPassword(password: string) {
  if (!validateFallbackPassword(password)) {
    throw new Error("Password fallback tidak memenuhi kebijakan keamanan.");
  }

  return hash(password, BCRYPT_COST);
}

export async function verifyFallbackPassword(password: string, passwordHash: string) {
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES) {
    return false;
  }

  return compare(password, passwordHash);
}
