"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateWithFallback } from "@/modules/identity-access/authentication";
import { verifyCaptchaChallenge } from "@/modules/identity-access/captcha";

const captchaSchema = z.object({
  captchaId: z.string().trim().min(1).max(64),
  captchaAnswer: z.string().trim().min(1).max(4),
  website: z.string().max(0),
});

const loginSchema = z.object({
  schoolCode: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9-]+$/),
  email: z.email().trim().max(254),
  password: z.string().min(1).max(128),
});

export type LoginState = { message: string; attempt: number } | undefined;

export async function loginWithFallback(
  state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const nextAttempt = (state?.attempt ?? 0) + 1;
  const captcha = captchaSchema.safeParse({
    captchaId: formData.get("captchaId"),
    captchaAnswer: formData.get("captchaAnswer"),
    website: formData.get("website") ?? "",
  });

  if (
    !captcha.success ||
    !(await verifyCaptchaChallenge(captcha.data.captchaId, captcha.data.captchaAnswer))
  ) {
    return {
      message: "Verifikasi keamanan salah atau kedaluwarsa. Soal telah diganti.",
      attempt: nextAttempt,
    };
  }

  const parsed = loginSchema.safeParse({
    schoolCode: formData.get("schoolCode"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { message: "Email atau kata sandi tidak valid.", attempt: nextAttempt };
  }

  const result = await authenticateWithFallback(parsed.data);
  if (!result.ok) {
    return { message: result.message, attempt: nextAttempt };
  }

  redirect("/");
}
