"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateWithFallback } from "@/modules/identity-access/authentication";

const loginSchema = z.object({
  schoolCode: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9-]+$/),
  email: z.email().trim().max(254),
  password: z.string().min(1).max(128),
});

export type LoginState = { message: string } | undefined;

export async function loginWithFallback(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    schoolCode: formData.get("schoolCode"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { message: "Email atau kata sandi tidak valid." };
  }

  const result = await authenticateWithFallback(parsed.data);
  if (!result.ok) {
    return { message: result.message };
  }

  redirect("/");
}
