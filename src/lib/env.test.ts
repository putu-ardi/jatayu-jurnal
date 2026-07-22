import { describe, expect, it } from "vitest";
import { getServerEnvironment } from "./env";

const validEnvironment = {
  NODE_ENV: "test",
  APP_VERSION: "test",
  DATABASE_URL: "postgresql://user:password@database:5432/ejls",
  REDIS_URL: "redis://:password@redis:6379/0",
  HEALTH_CHECK_TIMEOUT_MS: "1000",
} as NodeJS.ProcessEnv;

describe("getServerEnvironment", () => {
  it("parses a complete server environment with Google OIDC disabled by default", () => {
    expect(getServerEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      APP_VERSION: "test",
      HEALTH_CHECK_TIMEOUT_MS: 1000,
      GOOGLE_OIDC_ENABLED: false,
    });
  });

  it("accepts a complete Google OIDC configuration", () => {
    expect(
      getServerEnvironment({
        ...validEnvironment,
        GOOGLE_OIDC_ENABLED: "true",
        GOOGLE_OIDC_ISSUER: "https://accounts.google.com",
        GOOGLE_OIDC_CLIENT_ID: "client-id.apps.googleusercontent.com",
        GOOGLE_OIDC_CLIENT_SECRET: "client-secret",
        GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN: "school.example",
        GOOGLE_OIDC_REDIRECT_URI: "https://ejls.school.example/api/auth/google/callback",
        GOOGLE_OIDC_LINK_REDIRECT_URI: "https://ejls.school.example/api/auth/google/link/callback",
        GOOGLE_OIDC_SCHOOL_CODE: "school-main",
      }),
    ).toMatchObject({
      GOOGLE_OIDC_ENABLED: true,
      GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN: "school.example",
      GOOGLE_OIDC_SCHOOL_CODE: "school-main",
    });
  });

  it("accepts exact HTTP callback paths on localhost for local testing", () => {
    expect(
      getServerEnvironment({
        ...validEnvironment,
        GOOGLE_OIDC_ENABLED: "true",
        GOOGLE_OIDC_ISSUER: "https://accounts.google.com",
        GOOGLE_OIDC_CLIENT_ID: "client-id.apps.googleusercontent.com",
        GOOGLE_OIDC_CLIENT_SECRET: "client-secret",
        GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN: "school.example",
        GOOGLE_OIDC_REDIRECT_URI: "http://localhost:8080/api/auth/google/callback",
        GOOGLE_OIDC_LINK_REDIRECT_URI: "http://localhost:8080/api/auth/google/link/callback",
        GOOGLE_OIDC_SCHOOL_CODE: "school-main",
      }),
    ).toMatchObject({
      GOOGLE_OIDC_ENABLED: true,
      GOOGLE_OIDC_REDIRECT_URI: "http://localhost:8080/api/auth/google/callback",
    });
  });

  it("rejects an incomplete enabled Google OIDC configuration", () => {
    expect(() =>
      getServerEnvironment({ ...validEnvironment, GOOGLE_OIDC_ENABLED: "true" }),
    ).toThrow();
  });

  it("rejects an unsafe Google OIDC redirect URI", () => {
    expect(() =>
      getServerEnvironment({
        ...validEnvironment,
        GOOGLE_OIDC_ENABLED: "true",
        GOOGLE_OIDC_ISSUER: "https://accounts.google.com",
        GOOGLE_OIDC_CLIENT_ID: "client-id",
        GOOGLE_OIDC_CLIENT_SECRET: "client-secret",
        GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN: "school.example",
        GOOGLE_OIDC_REDIRECT_URI: "http://ejls.school.example/api/auth/google/callback?next=/",
        GOOGLE_OIDC_LINK_REDIRECT_URI: "https://ejls.school.example/api/auth/google/link/callback",
        GOOGLE_OIDC_SCHOOL_CODE: "school-main",
      }),
    ).toThrow();
  });

  it("rejects exact HTTP callback paths on a non-loopback host", () => {
    expect(() =>
      getServerEnvironment({
        ...validEnvironment,
        GOOGLE_OIDC_ENABLED: "true",
        GOOGLE_OIDC_ISSUER: "https://accounts.google.com",
        GOOGLE_OIDC_CLIENT_ID: "client-id",
        GOOGLE_OIDC_CLIENT_SECRET: "client-secret",
        GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN: "school.example",
        GOOGLE_OIDC_REDIRECT_URI: "http://ejls.school.example/api/auth/google/callback",
        GOOGLE_OIDC_LINK_REDIRECT_URI: "http://ejls.school.example/api/auth/google/link/callback",
        GOOGLE_OIDC_SCHOOL_CODE: "school-main",
      }),
    ).toThrow();
  });

  it("rejects a non-Google OIDC issuer", () => {
    expect(() =>
      getServerEnvironment({
        ...validEnvironment,
        GOOGLE_OIDC_ENABLED: "true",
        GOOGLE_OIDC_ISSUER: "https://issuer.example",
        GOOGLE_OIDC_CLIENT_ID: "client-id",
        GOOGLE_OIDC_CLIENT_SECRET: "client-secret",
        GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN: "school.example",
        GOOGLE_OIDC_REDIRECT_URI: "https://ejls.school.example/api/auth/google/callback",
        GOOGLE_OIDC_LINK_REDIRECT_URI: "https://ejls.school.example/api/auth/google/link/callback",
        GOOGLE_OIDC_SCHOOL_CODE: "school-main",
      }),
    ).toThrow();
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() =>
      getServerEnvironment({ ...validEnvironment, DATABASE_URL: "https://db.local" }),
    ).toThrow();
  });

  it("rejects non-Redis URLs", () => {
    expect(() =>
      getServerEnvironment({ ...validEnvironment, REDIS_URL: "https://cache.local" }),
    ).toThrow();
  });
});
