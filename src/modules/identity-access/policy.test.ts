import { describe, expect, it } from "vitest";
import {
  authorize,
  canGrantAssignment,
  canRevokeAssignment,
  capabilities,
  isAssignmentActive,
  scopeContains,
  type EffectiveAssignment,
  type Principal,
  type ResourceScope,
} from "./policy";

const NOW = new Date("2026-07-21T12:00:00.000Z");
const SCHOOL_A = "school-a";
const SCHOOL_B = "school-b";

const schoolScope = (schoolId = SCHOOL_A): ResourceScope => ({
  schoolId,
  type: "SCHOOL",
  reference: null,
});

const classScope = (reference: string, schoolId = SCHOOL_A): ResourceScope => ({
  schoolId,
  type: "CLASS",
  reference,
});

function assignment(
  overrides: Partial<EffectiveAssignment> = {},
): EffectiveAssignment {
  return {
    id: "assignment-admin",
    schoolId: SCHOOL_A,
    userId: "actor-user",
    roleKey: "admin-akses",
    permissions: Object.values(capabilities),
    scope: schoolScope(),
    activeFrom: new Date("2026-07-20T12:00:00.000Z"),
    activeUntil: null,
    revokedAt: null,
    grantBoundaries: [
      { grantableRoleKey: "guru", scope: schoolScope() },
      { grantableRoleKey: "admin-data", scope: classScope("class-a") },
    ],
    ...overrides,
  };
}

function principal(
  assignments: readonly EffectiveAssignment[] = [assignment()],
): Principal {
  return {
    sessionId: "session-actor",
    userId: "actor-user",
    schoolId: SCHOOL_A,
    fullName: "Admin Akses",
    email: "admin@example.test",
    authenticatedAt: NOW,
    assignments,
  };
}

describe("assignment activity", () => {
  it("accepts an assignment only inside its active window", () => {
    expect(isAssignmentActive(assignment(), NOW)).toBe(true);
    expect(
      isAssignmentActive(
        assignment({ activeFrom: new Date("2026-07-21T12:00:01.000Z") }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isAssignmentActive(
        assignment({ activeUntil: new Date("2026-07-21T12:00:00.000Z") }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isAssignmentActive(
        assignment({ revokedAt: new Date("2026-07-21T11:59:59.000Z") }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("scope containment", () => {
  it("contains every target in the same school from a school scope", () => {
    expect(scopeContains(schoolScope(), classScope("class-a"))).toBe(true);
  });

  it("denies cross-school targets even from a school scope", () => {
    expect(scopeContains(schoolScope(), classScope("class-a", SCHOOL_B))).toBe(
      false,
    );
  });

  it("requires exact type and reference below school scope", () => {
    expect(scopeContains(classScope("class-a"), classScope("class-a"))).toBe(true);
    expect(scopeContains(classScope("class-a"), classScope("class-b"))).toBe(false);
    expect(
      scopeContains(classScope("class-a"), {
        schoolId: SCHOOL_A,
        type: "PROGRAM",
        reference: "class-a",
      }),
    ).toBe(false);
  });
});

describe("capability authorization", () => {
  it("allows an active capability inside the assignment scope", () => {
    expect(authorize(principal(), capabilities.usersRead, classScope("class-a"), NOW)).toEqual({
      allowed: true,
      assignmentId: "assignment-admin",
    });
  });

  it("denies IDOR-style access to another school", () => {
    expect(
      authorize(
        principal(),
        capabilities.usersRead,
        schoolScope(SCHOOL_B),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "scope-denied" });
  });

  it("denies an expired, revoked, or future-dated actor assignment", () => {
    const inactiveAssignments = [
      assignment({ activeUntil: NOW }),
      assignment({ revokedAt: new Date("2026-07-21T11:00:00.000Z") }),
      assignment({ activeFrom: new Date("2026-07-21T13:00:00.000Z") }),
    ];

    for (const inactiveAssignment of inactiveAssignments) {
      expect(
        authorize(
          principal([inactiveAssignment]),
          capabilities.usersRead,
          schoolScope(),
          NOW,
        ),
      ).toEqual({ allowed: false, reason: "assignment-inactive" });
    }
  });

  it("distinguishes a missing capability from a scope mismatch", () => {
    expect(
      authorize(
        principal([assignment({ permissions: [] })]),
        capabilities.usersRead,
        schoolScope(),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "capability-missing" });

    expect(
      authorize(
        principal([assignment({ scope: classScope("class-a") })]),
        capabilities.usersRead,
        classScope("class-b"),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "scope-denied" });
  });
});

describe("grant and revoke boundaries", () => {
  const grantInput = {
    principal: principal(),
    targetUserId: "target-user",
    targetRoleKey: "guru",
    targetScope: classScope("class-a"),
    now: NOW,
  };

  it("allows only roles and scopes contained by both actor and boundary", () => {
    expect(canGrantAssignment(grantInput)).toEqual({
      allowed: true,
      actorAssignmentId: "assignment-admin",
    });
    expect(canRevokeAssignment(grantInput)).toEqual({
      allowed: true,
      actorAssignmentId: "assignment-admin",
    });
  });

  it("denies grant and revoke against the actor's own account", () => {
    expect(
      canGrantAssignment({ ...grantInput, targetUserId: "actor-user" }),
    ).toEqual({ allowed: false, reason: "self-elevation" });
    expect(
      canRevokeAssignment({ ...grantInput, targetUserId: "actor-user" }),
    ).toEqual({ allowed: false, reason: "self-elevation" });
  });

  it("denies a role outside the explicit grant boundary", () => {
    expect(
      canGrantAssignment({ ...grantInput, targetRoleKey: "admin-branding" }),
    ).toEqual({ allowed: false, reason: "role-outside-boundary" });
  });

  it("denies a target outside the actor scope", () => {
    const classBoundActor = principal([
      assignment({
        scope: classScope("class-a"),
        grantBoundaries: [{ grantableRoleKey: "guru", scope: schoolScope() }],
      }),
    ]);

    expect(
      canGrantAssignment({
        ...grantInput,
        principal: classBoundActor,
        targetScope: classScope("class-b"),
      }),
    ).toEqual({ allowed: false, reason: "scope-denied" });
  });

  it("denies a target outside the grant boundary", () => {
    expect(
      canGrantAssignment({
        ...grantInput,
        targetRoleKey: "admin-data",
        targetScope: classScope("class-b"),
      }),
    ).toEqual({ allowed: false, reason: "scope-denied" });
  });

  it("denies inactive actors and actors without the required capability", () => {
    expect(
      canGrantAssignment({
        ...grantInput,
        principal: principal([assignment({ activeUntil: NOW })]),
      }),
    ).toEqual({ allowed: false, reason: "assignment-inactive" });

    expect(
      canGrantAssignment({
        ...grantInput,
        principal: principal([
          assignment({ permissions: [capabilities.assignmentsRevoke] }),
        ]),
      }),
    ).toEqual({ allowed: false, reason: "capability-missing" });
  });
});
