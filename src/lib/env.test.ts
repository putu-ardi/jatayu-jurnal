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
  it("parses a complete server environment", () => {
    expect(getServerEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      APP_VERSION: "test",
      HEALTH_CHECK_TIMEOUT_MS: 1000,
    });
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
