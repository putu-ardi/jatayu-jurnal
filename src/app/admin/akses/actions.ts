"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  disableFallbackCredential,
  grantRoleAssignment,
  revokeRoleAssignment,
  revokeUserSession,
  setFallbackCredential,
  updateUserStatus,
} from "@/modules/identity-access/mutations";

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
    ? "Data telah berubah. Muat ulang lalu tinjau kembali."
    : "Aksi tidak dapat diproses. Periksa hak akses dan autentikasi terbaru.";
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
