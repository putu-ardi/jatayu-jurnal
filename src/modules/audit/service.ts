import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Principal } from "@/modules/identity-access/policy";
import { redactAuditValue } from "./redaction";

type AuditInput = {
  schoolId: string;
  principal?: Principal;
  subjectUserId?: string | null;
  actorAssignmentId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  outcome: "SUCCEEDED" | "DENIED" | "FAILED";
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  correlationId: string;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined
    ? undefined
    : (redactAuditValue(value) as Prisma.InputJsonValue);
}

export async function appendAuditLog(
  transaction: Prisma.TransactionClient,
  input: AuditInput,
) {
  const actorAssignment = input.principal?.assignments.find(
    (assignment) => assignment.id === input.actorAssignmentId,
  );

  await transaction.auditLog.create({
    data: {
      schoolId: input.schoolId,
      actorUserId: input.principal?.userId,
      subjectUserId: input.subjectUserId,
      actorAssignmentId: input.actorAssignmentId,
      actorAssignmentSnapshot: toJson(
        actorAssignment
          ? {
              id: actorAssignment.id,
              roleKey: actorAssignment.roleKey,
              scope: actorAssignment.scope,
              activeFrom: actorAssignment.activeFrom,
              activeUntil: actorAssignment.activeUntil,
            }
          : undefined,
      ),
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      outcome: input.outcome,
      reason: input.reason,
      before: toJson(input.before),
      after: toJson(input.after),
      metadata: toJson(input.metadata),
      correlationId: input.correlationId,
    },
  });
}
