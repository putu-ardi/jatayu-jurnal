import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateWithFallback: vi.fn(),
  verifyCaptchaChallenge: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/identity-access/authentication", () => ({
  authenticateWithFallback: mocks.authenticateWithFallback,
}));
vi.mock("@/modules/identity-access/captcha", () => ({
  verifyCaptchaChallenge: mocks.verifyCaptchaChallenge,
}));

import { loginWithFallback } from "./actions";

const challengeId = "a".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCaptchaChallenge.mockResolvedValue(true);
  mocks.authenticateWithFallback.mockResolvedValue({ ok: false, message: "credential-failure" });
});

describe("loginWithFallback CAPTCHA gate", () => {
  it("rejects an invalid CAPTCHA before checking credentials", async () => {
    mocks.verifyCaptchaChallenge.mockResolvedValue(false);

    await expect(loginWithFallback(undefined, validFormData())).resolves.toEqual({
      message: "Verifikasi keamanan salah atau kedaluwarsa. Soal telah diganti.",
      attempt: 1,
    });
    expect(mocks.authenticateWithFallback).not.toHaveBeenCalled();
  });

  it("rejects the honeypot without consuming a challenge", async () => {
    const formData = validFormData();
    formData.set("website", "https://bot.example");

    await expect(loginWithFallback(undefined, formData)).resolves.toEqual({
      message: "Verifikasi keamanan salah atau kedaluwarsa. Soal telah diganti.",
      attempt: 1,
    });
    expect(mocks.verifyCaptchaChallenge).not.toHaveBeenCalled();
  });

  it("checks credentials only after CAPTCHA succeeds", async () => {
    await expect(loginWithFallback(undefined, validFormData())).resolves.toEqual({
      message: "credential-failure",
      attempt: 1,
    });
    expect(mocks.verifyCaptchaChallenge).toHaveBeenCalledWith(challengeId, "15");
    expect(mocks.authenticateWithFallback).toHaveBeenCalledWith({
      schoolCode: "jatayu",
      email: "admin@example.test",
      password: "Password-2026!",
    });
  });

  it("increments the attempt marker so the client fetches a fresh challenge", async () => {
    await expect(
      loginWithFallback({ message: "previous", attempt: 4 }, validFormData()),
    ).resolves.toEqual({ message: "credential-failure", attempt: 5 });
  });
});

function validFormData() {
  const formData = new FormData();
  formData.set("schoolCode", "jatayu");
  formData.set("email", "admin@example.test");
  formData.set("password", "Password-2026!");
  formData.set("captchaId", challengeId);
  formData.set("captchaAnswer", "15");
  formData.set("website", "");
  return formData;
}
