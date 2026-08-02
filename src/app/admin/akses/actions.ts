"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { shouldUseSecureCookies } from "@/lib/request-security";
import {
  createGoogleIdentityLinkAuthorizationRequest,
} from "@/modules/identity-access/google-authentication";
import {
  isGoogleOidcEnabled,
  requireGoogleOidcSettings,
} from "@/modules/identity-access/google-oidc-config";
import {
  consumeGoogleLinkConfirmation,
  GOOGLE_LINK_CONFIRMATION_COOKIE,
  GOOGLE_LINK_STATE_COOKIE,
} from "@/modules/identity-access/google-oidc-state";
import {
  disableFallbackCredential,
  grantRoleAssignment,
  linkGoogleIdentity,
  provisionManualUser,
  revokeRoleAssignment,
  revokeUserSession,
  setFallbackCredential,
  unlinkGoogleIdentity,
  updateUserStatus,
} from "@/modules/identity-access/mutations";
import { getCurrentPrincipal } from "@/modules/identity-access/session-dal";

export type ActionState =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | undefined;

const reasonSchema = z.string().trim().min(12).max(500);
const commonSchema = z.object({
  targetUserId: z.uuid(),
  reason: reasonSchema,
});

function resultMessage(error: unknown) {
  return error instanceof Error && error.name === "ConflictError"
    ? "Data telah berubah atau sudah digunakan. Muat ulang lalu tinjau kembali."
    : "Aksi tidak dapat diproses. Periksa hak akses dan autentikasi terbaru.";
}

export async function provisionUser(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    fullName: z.string().trim().min(3).max(120),
    email: z.email().trim().max(254).transform((value) => value.toLowerCase()),
    username: z.string().trim().max(64).regex(/^[A-Za-z0-9._-]+$/).or(z.literal("")),
    reason: reasonSchema,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "Input pengguna tidak valid. Periksa nama, email, username, dan alasan." };
  }

  let user: Awaited<ReturnType<typeof provisionManualUser>>;
  try {
    user = await provisionManualUser({
      ...parsed.data,
      username: parsed.data.username ? parsed.data.username.toLowerCase() : null,
    });
  } catch (error) {
    return { ok: false, message: resultMessage(error) };
  }

  revalidatePath("/admin/akses");
  redirect(`/admin/akses?user=${user.id}&provision=success`);
}

export async function startGoogleIdentityLink(formData: FormData): Promise<never> {
  const parsed = commonSchema.extend({
    expectedVersion: z.coerce.number().int().positive(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isGoogleOidcEnabled()) {
    redirect("/admin/akses?googleLink=error");
  }

  let authorization: Awaited<ReturnType<typeof createGoogleIdentityLinkAuthorizationRequest>>;
  try {
    authorization = await createGoogleIdentityLinkAuthorizationRequest(parsed.data);
  } catch {
    redirect(`/admin/akses?user=${parsed.data.targetUserId}&googleLink=error`);
  }

  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_LINK_STATE_COOKIE, authorization.state, {
    httpOnly: true,
    secure: await shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/api/auth/google/link",
    maxAge: 10 * 60,
    priority: "high",
  });
  redirect(authorization.url.toString());
}

export async function confirmGoogleIdentityLink(
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  const cookieStore = await cookies();
  const confirmationToken = cookieStore.get(GOOGLE_LINK_CONFIRMATION_COOKIE)?.value;
  cookieStore.set(GOOGLE_LINK_CONFIRMATION_COOKIE, "", {
    httpOnly: true,
    secure: await shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/admin/akses",
    maxAge: 0,
  });
  if (!confirmationToken || !isGoogleOidcEnabled()) {
    return { ok: false, message: "Konfirmasi Google tidak tersedia atau sudah kedaluwarsa." };
  }

  const confirmation = await consumeGoogleLinkConfirmation(confirmationToken);
  if (!confirmation) {
    return { ok: false, message: "Konfirmasi Google tidak tersedia atau sudah digunakan." };
  }

  try {
    const [principal, settings] = await Promise.all([
      getCurrentPrincipal(),
      Promise.resolve(requireGoogleOidcSettings()),
    ]);
    if (
      !principal ||
      confirmation.issuer !== settings.issuer ||
      confirmation.hostedDomain !== settings.hostedDomain
    ) {
      return { ok: false, message: "Konfirmasi Google tidak lagi memenuhi kebijakan sekolah." };
    }
    await linkGoogleIdentity({
      requestPrincipal: principal,
      actorSessionId: confirmation.actorSessionId,
      actorUserId: confirmation.actorUserId,
      schoolId: confirmation.schoolId,
      targetUserId: confirmation.targetUserId,
      expectedVersion: confirmation.targetVersion,
      issuer: confirmation.issuer,
      subject: confirmation.subject,
      emailAtLink: confirmation.email,
      reason: confirmation.reason,
    });
    revalidatePath("/admin/akses");
    return { ok: true, message: "Identitas Google Workspace ditautkan dan dicatat di audit." };
  } catch (error) {
    return { ok: false, message: resultMessage(error) };
  }
}

export async function unlinkGoogleIdentityAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    identityId: z.uuid(),
    targetUserId: z.uuid(),
    expectedVersion: z.coerce.number().int().positive(),
    reason: reasonSchema,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Input pelepasan identitas tidak valid." };

  try {
    await unlinkGoogleIdentity(parsed.data);
    revalidatePath("/admin/akses");
    return { ok: true, message: "Identitas Google dilepas, sesi Google dicabut, dan perubahan diaudit." };
  } catch (error) {
    return { ok: false, message: resultMessage(error) };
  }
}

export async function changeUserStatus(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = commonSchema.extend({
    status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"]),
    expectedVersion: z.coerce.number().int().positive(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Input perubahan status tidak valid." };

  try {
    await updateUserStatus(parsed.data);
    revalidatePath("/admin/akses");
    return { ok: true, message: "Status pengguna diperbarui dan dicatat di audit." };
  } catch (error) {
    return { ok: false, message: resultMessage(error) };
  }
}

export async function grantAssignment(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = commonSchema.extend({
    roleKey: z.string().trim().min(1).max(64),
    activeUntil: z.string().trim().max(40),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Input penugasan tidak valid." };

  const activeUntil = parsed.data.activeUntil ? new Date(parsed.data.activeUntil) : null;
  if (activeUntil && (Number.isNaN(activeUntil.getTime()) || activeUntil <= new Date())) {
    return { ok: false, message: "Tanggal berakhir harus berada di masa depan." };
  }

  try {
    await grantRoleAssignment({ ...parsed.data, activeUntil });
    revalidatePath("/admin/akses");
    return { ok: true, message: "Penugasan diberikan sesuai grant boundary." };
  } catch (error) {
    return { ok: false, message: resultMessage(error) };
  }
}

export async function revokeAssignment(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    assignmentId: z.uuid(),
    expectedVersion: z.coerce.number().int().positive(),
    reason: reasonSchema,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Input pencabutan tidak valid." };

  try {
    await revokeRoleAssignment(parsed.data);
    revalidatePath("/admin/akses");
    return { ok: true, message: "Penugasan dicabut dan privilege berlaku segera." };
  } catch (error) {
    return { ok: false, message: resultMessage(error) };
  }
}

export async function revokeSession(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z.object({
    sessionId: z.uuid(),
    expectedVersion: z.coerce.number().int().positive(),
    reason: reasonSchema,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Input pencabutan sesi tidak valid." };

  try {
    await revokeUserSession(parsed.data);
    revalidatePath("/admin/akses");
    return { ok: true, message: "Sesi dicabut." };
  } catch (error) {
    return { ok: false, message: resultMessage(error) };
  }
}

export async function enableFallback(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = commonSchema.extend({
    password: z.string().min(12).max(72),
    expectedVersion: z.coerce.number().int().min(0),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Input fallback tidak valid." };

  try {
    await setFallbackCredential(parsed.data);
    revalidatePath("/admin/akses");
    return { ok: true, message: "Fallback akun diaktifkan secara eksplisit." };
  } catch (error) {
    return { ok: false, message: resultMessage(error) };
  }
}

export async function disableFallback(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = commonSchema.extend({
    expectedVersion: z.coerce.number().int().positive(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Input fallback tidak valid." };

  try {
    await disableFallbackCredential(parsed.data);
    revalidatePath("/admin/akses");
    return { ok: true, message: "Fallback akun dinonaktifkan." };
  } catch (error) {
    return { ok: false, message: resultMessage(error) };
  }
}
