import "server-only";

import { getDatabase } from "@/lib/database";
import {
  authorize,
  canGrantAssignment,
  canRevokeAssignment,
  capabilities,
} from "./policy";
import {
  hasRecentAuthentication,
  requireCapability,
} from "./session-dal";
import type { UserListQuery } from "./user-list-query";

export type UserAccessListItem = {
  id: string;
  fullName: string;
  email: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  provisioningSource: "GOOGLE_WORKSPACE" | "MANUAL" | "IMPORT";
  activeRoleLabels: string[];
  hasFallback: boolean;
  activeSessions: number;
};

export async function listUsersForAccess(query: UserListQuery) {
  const { principal } = await requireCapability(capabilities.usersRead);
  const now = new Date();
  const where = {
    schoolId: principal.schoolId,
    ...(query.status === "ALL" ? {} : { status: query.status }),
    ...(query.query
      ? {
          OR: [
            { fullName: { contains: query.query, mode: "insensitive" as const } },
            { email: { contains: query.query, mode: "insensitive" as const } },
            { username: { contains: query.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, users] = await getDatabase().$transaction([
    getDatabase().user.count({ where }),
    getDatabase().user.findMany({
      where,
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        provisioningSource: true,
        assignments: {
          where: {
            revokedAt: null,
            activeFrom: { lte: now },
            OR: [{ activeUntil: null }, { activeUntil: { gt: now } }],
          },
          select: { role: { select: { name: true } }, scopeLabel: true },
          orderBy: { activeFrom: "desc" },
        },
        fallbackCredential: { select: { disabledAt: true } },
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: now } },
          select: { id: true },
        },
      },
    }),
  ]);

  const items: UserAccessListItem[] = users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    status: user.status,
    provisioningSource: user.provisioningSource,
    activeRoleLabels: user.assignments.map(
      (assignment) => `${assignment.role.name} · ${assignment.scopeLabel}`,
    ),
    hasFallback: Boolean(user.fallbackCredential && !user.fallbackCredential.disabledAt),
    activeSessions: user.sessions.length,
  }));

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getUserAccessDetail(userId: string) {
  const { principal } = await requireCapability(capabilities.usersRead);
  const now = new Date();
  const user = await getDatabase().user.findFirst({
    where: { id: userId, schoolId: principal.schoolId },
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
      status: true,
      provisioningSource: true,
      version: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      identities: {
        select: {
          id: true,
          provider: true,
          issuer: true,
          subject: true,
          emailAtLink: true,
          emailVerified: true,
          linkedAt: true,
          lastUsedAt: true,
        },
      },
      assignments: {
        orderBy: { activeFrom: "desc" },
        select: {
          id: true,
          version: true,
          scopeType: true,
          scopeReference: true,
          scopeLabel: true,
          activeFrom: true,
          activeUntil: true,
          revokedAt: true,
          role: { select: { key: true, name: true } },
          grantBoundaries: {
            select: {
              boundaryScopeType: true,
              boundaryScopeReference: true,
              grantableRole: { select: { key: true, name: true } },
            },
          },
        },
      },
      sessions: {
        orderBy: { lastSeenAt: "desc" },
        take: 10,
        select: {
          id: true,
          version: true,
          authMethod: true,
          authenticatedAt: true,
          lastSeenAt: true,
          expiresAt: true,
          revokedAt: true,
          deviceLabel: true,
        },
      },
      fallbackCredential: {
        select: {
          enabledAt: true,
          disabledAt: true,
          failedAttempts: true,
          lockedUntil: true,
          passwordChangedAt: true,
          version: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const schoolScope = {
    schoolId: principal.schoolId,
    type: "SCHOOL" as const,
    reference: null,
  };
  const isSelf = principal.userId === user.id;
  const canReadAudit = authorize(principal, capabilities.auditRead, schoolScope).allowed;
  const canManageStatus =
    !isSelf && authorize(principal, capabilities.userStatusManage, schoolScope).allowed;
  const canManageFallback =
    !isSelf && authorize(principal, capabilities.fallbackManage, schoolScope).allowed;
  const canLinkIdentities =
    !isSelf &&
    authorize(principal, capabilities.identityLinkManage, schoolScope).allowed;
  const canUnlinkIdentities =
    !isSelf &&
    authorize(principal, capabilities.identityUnlinkManage, schoolScope).allowed;
  const canRevokeSessions = authorize(
    principal,
    capabilities.sessionsRevoke,
    schoolScope,
  ).allowed;
  const [auditLogs, roleCatalog] = await Promise.all([
    canReadAudit
      ? getDatabase().auditLog.findMany({
          where: { schoolId: principal.schoolId, subjectUserId: user.id },
          orderBy: { occurredAt: "desc" },
          take: 10,
          select: {
            id: true,
            eventType: true,
            action: true,
            outcome: true,
            occurredAt: true,
            actorUser: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
    getDatabase().role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true, description: true },
    }),
  ]);

  const assignments = user.assignments.map((assignment) => ({
    ...assignment,
    isActive:
      assignment.revokedAt === null &&
      assignment.activeFrom <= now &&
      (assignment.activeUntil === null || assignment.activeUntil > now),
    canRevoke: canRevokeAssignment({
      principal,
      targetUserId: user.id,
      targetRoleKey: assignment.role.key,
      targetScope: {
        schoolId: principal.schoolId,
        type: assignment.scopeType,
        reference: assignment.scopeReference,
      },
      now,
    }).allowed,
  }));

  const grantableRoles = roleCatalog.filter((role) =>
    canGrantAssignment({
      principal,
      targetUserId: user.id,
      targetRoleKey: role.key,
      targetScope: schoolScope,
      now,
    }).allowed,
  );

  return {
    ...user,
    auditLogs,
    canReadAudit,
    actions: {
      isSelf,
      hasRecentAuthentication: hasRecentAuthentication(principal, now),
      canManageStatus,
      canManageFallback,
      canLinkIdentities,
      canUnlinkIdentities,
      canRevokeSessions,
    },
    grantableRoles,
    assignments,
    sessions: user.sessions.map((session) => ({
      ...session,
      isActive: session.revokedAt === null && session.expiresAt > now,
    })),
  };
}
