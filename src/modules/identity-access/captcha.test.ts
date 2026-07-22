import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const redis = vi.hoisted(() => ({
  get: vi.fn(),
  getdel: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/lib/application-redis", () => ({
  getApplicationRedis: () => redis,
}));

import {
  createCaptchaChallenge,
  getCaptchaExpression,
  renderCaptchaSvg,
  verifyCaptchaChallenge,
} from "./captcha";

beforeEach(() => {
  vi.clearAllMocks();
  redis.set.mockResolvedValue("OK");
});

describe("CAPTCHA challenge lifecycle", () => {
  it("stores only a salted answer hash with a five-minute TTL", async () => {
    const challenge = await createCaptchaChallenge();

    expect(challenge.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge.imageUrl).toBe(`/api/auth/captcha/${challenge.id}/image`);
    expect(challenge.expiresInSeconds).toBe(300);
    expect(redis.set).toHaveBeenCalledWith(
      `ejls:captcha:v1:${challenge.id}`,
      expect.any(String),
      "EX",
      300,
    );

    const stored = JSON.parse(redis.set.mock.calls[0][1] as string) as Record<string, string>;
    expect(stored.expression).toMatch(/^\d{2} [+-] \d =$/);
    expect(stored.answerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(stored).not.toHaveProperty("answer");
  });

  it("accepts the correct answer and consumes the key atomically", async () => {
    const challenge = await createCaptchaChallenge();
    const serialized = redis.set.mock.calls[0][1] as string;
    const { expression } = JSON.parse(serialized) as { expression: string };
    redis.getdel.mockResolvedValue(serialized);

    await expect(verifyCaptchaChallenge(challenge.id, solve(expression))).resolves.toBe(true);
    expect(redis.getdel).toHaveBeenCalledOnce();
    expect(redis.getdel).toHaveBeenCalledWith(`ejls:captcha:v1:${challenge.id}`);
  });

  it("rejects a wrong answer after consuming the challenge", async () => {
    const challenge = await createCaptchaChallenge();
    redis.getdel.mockResolvedValue(redis.set.mock.calls[0][1]);

    await expect(verifyCaptchaChallenge(challenge.id, "999")).resolves.toBe(false);
    expect(redis.getdel).toHaveBeenCalledOnce();
  });

  it("rejects malformed input without querying Redis", async () => {
    await expect(verifyCaptchaChallenge("not-an-id", "12")).resolves.toBe(false);
    await expect(verifyCaptchaChallenge("a".repeat(43), "not-a-number")).resolves.toBe(false);
    expect(redis.getdel).not.toHaveBeenCalled();
  });

  it("fails closed when Redis is unavailable or state is corrupt", async () => {
    redis.getdel.mockRejectedValueOnce(new Error("unavailable"));
    await expect(verifyCaptchaChallenge("a".repeat(43), "12")).resolves.toBe(false);

    redis.getdel.mockResolvedValueOnce("invalid-json");
    await expect(verifyCaptchaChallenge("a".repeat(43), "12")).resolves.toBe(false);
  });

  it("reads a valid expression for image rendering without consuming it", async () => {
    redis.get.mockResolvedValue(JSON.stringify({ expression: "12 + 3 =" }));

    await expect(getCaptchaExpression("a".repeat(43))).resolves.toBe("12 + 3 =");
    expect(redis.getdel).not.toHaveBeenCalled();
  });
});

describe("renderCaptchaSvg", () => {
  it("renders noisy vector shapes without exposing the expression as text", () => {
    const svg = renderCaptchaSvg("12 + 3 =");

    expect(svg).toContain("<svg");
    expect(svg).toContain("<circle");
    expect(svg).toContain("<path");
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("12 + 3 =");
  });
});

function solve(expression: string) {
  const match = /^(\d{2}) ([+-]) (\d) =$/.exec(expression);
  if (!match) throw new Error("Unexpected test expression.");
  const left = Number(match[1]);
  const right = Number(match[3]);
  return String(match[2] === "+" ? left + right : left - right);
}
