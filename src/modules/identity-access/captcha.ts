import "server-only";

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getApplicationRedis } from "@/lib/application-redis";
import type { CaptchaChallenge } from "./captcha-types";

const CAPTCHA_KEY_PREFIX = "ejls:captcha:v1:";
const CAPTCHA_TTL_SECONDS = 5 * 60;
const CAPTCHA_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CAPTCHA_ANSWER_PATTERN = /^-?[0-9]{1,3}$/;

type StoredCaptcha = {
  expression: string;
  salt: string;
  answerHash: string;
};

export async function createCaptchaChallenge(): Promise<CaptchaChallenge> {
  const id = randomBytes(32).toString("base64url");
  const { expression, answer } = createMathProblem();
  const salt = randomBytes(16).toString("base64url");
  const stored: StoredCaptcha = {
    expression,
    salt,
    answerHash: hashAnswer(id, salt, answer.toString()),
  };

  await getApplicationRedis().set(
    `${CAPTCHA_KEY_PREFIX}${id}`,
    JSON.stringify(stored),
    "EX",
    CAPTCHA_TTL_SECONDS,
  );

  return {
    id,
    imageUrl: `/api/auth/captcha/${id}/image`,
    prompt: "Hitung hasil operasi matematika pada gambar.",
    expiresInSeconds: CAPTCHA_TTL_SECONDS,
  };
}

export async function verifyCaptchaChallenge(
  id: string,
  answer: string,
): Promise<boolean> {
  if (!CAPTCHA_ID_PATTERN.test(id) || !CAPTCHA_ANSWER_PATTERN.test(answer.trim())) {
    return false;
  }

  let serialized: string | null;
  try {
    serialized = await getApplicationRedis().getdel(`${CAPTCHA_KEY_PREFIX}${id}`);
  } catch {
    return false;
  }

  if (!serialized) return false;

  try {
    const stored = JSON.parse(serialized) as Partial<StoredCaptcha>;
    if (typeof stored.salt !== "string" || typeof stored.answerHash !== "string") {
      return false;
    }

    const suppliedHash = hashAnswer(id, stored.salt, answer.trim());
    const expected = Buffer.from(stored.answerHash, "hex");
    const supplied = Buffer.from(suppliedHash, "hex");
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch {
    return false;
  }
}

export async function getCaptchaExpression(id: string): Promise<string | null> {
  if (!CAPTCHA_ID_PATTERN.test(id)) return null;

  try {
    const serialized = await getApplicationRedis().get(`${CAPTCHA_KEY_PREFIX}${id}`);
    if (!serialized) return null;

    const stored = JSON.parse(serialized) as Partial<StoredCaptcha>;
    return typeof stored.expression === "string" &&
      /^[0-9]{1,2} [+-] [0-9]{1,2} =$/.test(stored.expression)
      ? stored.expression
      : null;
  } catch {
    return null;
  }
}

export function renderCaptchaSvg(expression: string) {
  const match = /^(\d{2}) ([+-]) (\d) =$/.exec(expression);
  if (!match) throw new Error("Invalid CAPTCHA expression.");

  const noisePaths = Array.from({ length: 7 }, (_, index) => {
    const y = 10 + index * 12 + randomInt(-4, 5);
    const firstControl = `${randomInt(20, 80)} ${y + randomInt(-12, 13)}`;
    const secondControl = `${randomInt(130, 200)} ${y + randomInt(-12, 13)}`;
    return `<path d="M-10 ${y} C ${firstControl}, ${secondControl}, 250 ${y + randomInt(-8, 9)}" />`;
  }).join("");
  const dots = Array.from({ length: 34 }, () =>
    `<circle cx="${randomInt(4, 236)}" cy="${randomInt(4, 84)}" r="${randomInt(1, 3)}" />`,
  ).join("");
  const operator = match[2] === "+"
    ? '<path d="M111 44h20M121 34v20" />'
    : '<path d="M111 44h20" />';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="88" viewBox="0 0 240 88">
  <rect width="240" height="88" rx="10" fill="#e0f2fe"/>
  <g fill="none" stroke="#0284c7" stroke-width="1.6" opacity=".52" stroke-linecap="round">${noisePaths}</g>
  <g fill="#0c4a6e" opacity=".22">${dots}</g>
  <g fill="#0f172a">${renderSevenSegmentDigit(match[1][0], 48)}${renderSevenSegmentDigit(match[1][1], 78)}${renderSevenSegmentDigit(match[3], 145)}</g>
  <g fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round">${operator}<path d="M178 39h20M178 49h20" /></g>
</svg>`;
}

function createMathProblem() {
  if (randomInt(2) === 0) {
    const left = randomInt(10, 20);
    const right = randomInt(2, 10);
    return { expression: `${left} + ${right} =`, answer: left + right };
  }

  const answer = randomInt(5, 16);
  const right = randomInt(5, 10);
  return { expression: `${answer + right} - ${right} =`, answer };
}

function hashAnswer(id: string, salt: string, answer: string) {
  return createHash("sha256")
    .update(`${id}:${salt}:${answer}`, "utf8")
    .digest("hex");
}

function renderSevenSegmentDigit(digit: string, x: number) {
  const activeSegments: Record<string, string> = {
    "0": "abcdef",
    "1": "bc",
    "2": "abdeg",
    "3": "abcdg",
    "4": "bcfg",
    "5": "acdfg",
    "6": "acdefg",
    "7": "abc",
    "8": "abcdefg",
    "9": "abcdfg",
  };
  const segments: Record<string, string> = {
    a: `x="${x + 4}" y="20" width="14" height="4"`,
    b: `x="${x + 18}" y="24" width="4" height="16"`,
    c: `x="${x + 18}" y="44" width="4" height="16"`,
    d: `x="${x + 4}" y="60" width="14" height="4"`,
    e: `x="${x}" y="44" width="4" height="16"`,
    f: `x="${x}" y="24" width="4" height="16"`,
    g: `x="${x + 4}" y="40" width="14" height="4"`,
  };

  return [...activeSegments[digit]]
    .map((segment) => `<rect ${segments[segment]} rx="2" />`)
    .join("");
}
