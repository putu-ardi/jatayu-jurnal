import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { shouldUseSecureCookies } from "./request-security";

function mockRequestHeaders(values: Record<string, string>) {
  mocks.headers.mockResolvedValue(new Headers(values));
}

describe("shouldUseSecureCookies", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.headers.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses secure cookies for HTTPS requests", async () => {
    mockRequestHeaders({
      host: "ejls.school.example",
      "x-forwarded-proto": "https",
    });

    await expect(shouldUseSecureCookies()).resolves.toBe(true);
  });

  it("allows non-secure cookies only for HTTP localhost testing", async () => {
    mockRequestHeaders({
      host: "localhost:8080",
      "x-forwarded-host": "localhost:8080",
      "x-forwarded-proto": "http",
    });

    await expect(shouldUseSecureCookies()).resolves.toBe(false);
  });

  it("keeps cookies secure for HTTP requests on non-loopback hosts", async () => {
    mockRequestHeaders({
      host: "ejls.school.example",
      "x-forwarded-proto": "http",
    });

    await expect(shouldUseSecureCookies()).resolves.toBe(true);
  });
});
