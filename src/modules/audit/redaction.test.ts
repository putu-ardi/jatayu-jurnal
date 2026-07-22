import { describe, expect, it } from "vitest";
import { redactAuditValue } from "./redaction";

describe("redactAuditValue", () => {
  it("redacts authentication and OIDC artifacts recursively by key", () => {
    expect(
      redactAuditValue({
        accessToken: "token-value",
        clientSecret: "secret-value",
        cookieValue: "cookie-value",
        nested: {
          nonce: "nonce-value",
          codeVerifier: "verifier-value",
          codeChallenge: "challenge-value",
          oidcState: "state-value",
          confirmationToken: "confirmation-value",
        },
        safe: { provider: "GOOGLE_WORKSPACE", emailVerified: true },
      }),
    ).toEqual({
      accessToken: "[REDACTED]",
      clientSecret: "[REDACTED]",
      cookieValue: "[REDACTED]",
      nested: {
        nonce: "[REDACTED]",
        codeVerifier: "[REDACTED]",
        codeChallenge: "[REDACTED]",
        oidcState: "[REDACTED]",
        confirmationToken: "[REDACTED]",
      },
      safe: { provider: "GOOGLE_WORKSPACE", emailVerified: true },
    });
  });

  it("serializes dates and truncates excessive strings, arrays, and depth", () => {
    const value = redactAuditValue({
      occurredAt: new Date("2026-07-22T10:00:00.000Z"),
      long: "x".repeat(2_001),
      many: Array.from({ length: 101 }, (_, index) => index),
      deep: { one: { two: { three: { four: { five: { six: "hidden" } } } } } },
    }) as Record<string, unknown>;

    expect(value.occurredAt).toBe("2026-07-22T10:00:00.000Z");
    expect(value.long).toBe(`${"x".repeat(2_000)}[TRUNCATED]`);
    expect(value.many).toHaveLength(100);
    expect(value.deep).toEqual({
      one: { two: { three: { four: { five: "[TRUNCATED]" } } } },
    });
  });
});
