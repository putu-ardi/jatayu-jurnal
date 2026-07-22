"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/database";
import { appendAuditLog } from "@/modules/audit/service";
import {
  clearSessionCookie,
  getCurrentPrincipal,
} from "@/modules/identity-access/session-dal";

export async function logout() {
  const principal = await getCurrentPrincipal();

  if (principal) {
    await getDatabase().$transaction(async (transaction) => {
      await transaction.session.updateMany({
        where: { id: principal.sessionId, userId: principal.userId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedByUserId: principal.userId,
          revokeReason: "Pengguna keluar dari aplikasi.",
          version: { increment: 1 },
        },
      });

      await appendAuditLog(transaction, {
        schoolId: principal.schoolId,
        principal,
        subjectUserId: principal.userId,
        eventType: "auth.session.ended",
        entityType: "Session",
        entityId: principal.sessionId,
        action: "logout",
        outcome: "SUCCEEDED",
        reason: "Pengguna keluar dari aplikasi.",
        correlationId: randomUUID(),
      });
    });
  }

  await clearSessionCookie();
  redirect("/login");
}
