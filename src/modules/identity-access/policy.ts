export const capabilities = {
  usersRead: "iam.users.read",
  usersProvision: "iam.users.provision",
  userStatusManage: "iam.users.status.manage",
  assignmentsGrant: "iam.assignments.grant",
  assignmentsRevoke: "iam.assignments.revoke",
  fallbackManage: "iam.fallback.manage",
  identityLinkManage: "iam.identities.link",
  identityUnlinkManage: "iam.identities.unlink",
  sessionsRevoke: "iam.sessions.revoke",
  auditRead: "iam.audit.read",
} as const;

export type Capability = (typeof capabilities)[keyof typeof capabilities];
export type ScopeType = "SELF" | "CLASS" | "PROGRAM" | "ROOM" | "SCHOOL";

export type ResourceScope = {
  schoolId: string;
  type: ScopeType;
  reference: string | null;
};

export type GrantBoundary = {
  grantableRoleKey: string;
  scope: ResourceScope;
};

export type EffectiveAssignment = {
  id: string;
  schoolId: string;
  userId: string;
  roleKey: string;
  permissions: readonly string[];
  scope: ResourceScope;
  activeFrom: Date;
  activeUntil: Date | null;
  revokedAt: Date | null;
  grantBoundaries: readonly GrantBoundary[];
};

export type Principal = {
  sessionId: string;
  userId: string;
  schoolId: string;
  fullName: string;
  email: string;
  authenticatedAt: Date;
  assignments: readonly EffectiveAssignment[];
};

export type AuthorizationResult =
  | { allowed: true; assignmentId: string }
  | { allowed: false; reason: "assignment-inactive" | "capability-missing" | "scope-denied" };

export type GrantDecision =
  | { allowed: true; actorAssignmentId: string }
  | {
      allowed: false;
      reason:
        | "self-elevation"
        | "assignment-inactive"
        | "capability-missing"
        | "role-outside-boundary"
        | "scope-denied";
    };

export function isAssignmentActive(assignment: EffectiveAssignment, now = new Date()) {
  return (
    assignment.revokedAt === null &&
    assignment.activeFrom <= now &&
    (assignment.activeUntil === null || assignment.activeUntil > now)
  );
}

export function scopeContains(boundary: ResourceScope, target: ResourceScope) {
  if (boundary.schoolId !== target.schoolId) {
    return false;
  }

  if (boundary.type === "SCHOOL") {
    return true;
  }

  return boundary.type === target.type && boundary.reference === target.reference;
}

export function authorize(
  principal: Principal,
  capability: Capability,
  targetScope: ResourceScope,
  now = new Date(),
): AuthorizationResult {
  let foundCapability = false;
  let foundInactive = false;

  for (const assignment of principal.assignments) {
    if (!assignment.permissions.includes(capability)) {
      continue;
    }

    foundCapability = true;
    if (!isAssignmentActive(assignment, now)) {
      foundInactive = true;
      continue;
    }

    if (scopeContains(assignment.scope, targetScope)) {
      return { allowed: true, assignmentId: assignment.id };
    }
  }

  if (foundInactive) {
    return { allowed: false, reason: "assignment-inactive" };
  }

  return {
    allowed: false,
    reason: foundCapability ? "scope-denied" : "capability-missing",
  };
}

function canManageAssignment(input: {
  principal: Principal;
  targetUserId: string;
  targetRoleKey: string;
  targetScope: ResourceScope;
  capability: typeof capabilities.assignmentsGrant | typeof capabilities.assignmentsRevoke;
  now?: Date;
}): GrantDecision {
  const { principal, targetUserId, targetRoleKey, targetScope, capability } = input;
  const now = input.now ?? new Date();

  if (principal.userId === targetUserId) {
    return { allowed: false, reason: "self-elevation" };
  }

  let foundCapability = false;
  let foundInactive = false;
  let foundRoleBoundary = false;

  for (const assignment of principal.assignments) {
    if (!assignment.permissions.includes(capability)) {
      continue;
    }

    foundCapability = true;
    if (!isAssignmentActive(assignment, now)) {
      foundInactive = true;
      continue;
    }

    for (const boundary of assignment.grantBoundaries) {
      if (boundary.grantableRoleKey !== targetRoleKey) {
        continue;
      }

      foundRoleBoundary = true;
      if (
        scopeContains(assignment.scope, targetScope) &&
        scopeContains(boundary.scope, targetScope)
      ) {
        return { allowed: true, actorAssignmentId: assignment.id };
      }
    }
  }

  if (foundInactive) {
    return { allowed: false, reason: "assignment-inactive" };
  }
  if (!foundCapability) {
    return { allowed: false, reason: "capability-missing" };
  }
  if (!foundRoleBoundary) {
    return { allowed: false, reason: "role-outside-boundary" };
  }

  return { allowed: false, reason: "scope-denied" };
}

export function canGrantAssignment(
  input: Omit<Parameters<typeof canManageAssignment>[0], "capability">,
) {
  return canManageAssignment({ ...input, capability: capabilities.assignmentsGrant });
}

export function canRevokeAssignment(
  input: Omit<Parameters<typeof canManageAssignment>[0], "capability">,
) {
  return canManageAssignment({ ...input, capability: capabilities.assignmentsRevoke });
}
