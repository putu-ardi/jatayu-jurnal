import { describe, expect, it } from "vitest";
import { resolveImplementedLanding } from "./landing";
import { capabilities, type EffectiveAssignment, type Principal } from "./policy";

const NOW = new Date("2026-07-22T08:00:00.000Z");

function principal(assignments: readonly EffectiveAssignment[]): Principal {
  return {
    sessionId: "session-1",
    userId: "user-1",
    schoolId: "school-a",
    fullName: "Pengguna Foundation",
    email: "user@example.test",
    authenticatedAt: NOW,
    assignments,
  };
}

function assignment(overrides: Partial<EffectiveAssignment> = {}): EffectiveAssignment {
  return {
    id: "assignment-1",
    schoolId: "school-a",
    userId: "user-1",
    roleKey: "admin-akses",
    permissions: [capabilities.usersRead],
    scope: { schoolId: "school-a", type: "SCHOOL", reference: null },
    activeFrom: new Date("2026-07-21T08:00:00.000Z"),
    activeUntil: null,
    revokedAt: null,
    grantBoundaries: [],
    ...overrides,
  };
}

describe("implemented landing resolver", () => {
  it("routes a P-10-capable principal to the implemented admin module", () => {
    expect(resolveImplementedLanding(principal([assignment()]), NOW)).toBe("/admin/akses");
  });

  it("keeps a valid principal without an implemented capability on the neutral landing", () => {
    expect(
      resolveImplementedLanding(
        principal([assignment({ roleKey: "guru", permissions: [] })]),
        NOW,
      ),
    ).toBeNull();
  });

  it("does not route principals through inactive or cross-school assignments", () => {
    expect(resolveImplementedLanding(principal([assignment({ activeUntil: NOW })]), NOW)).toBeNull();
    expect(
      resolveImplementedLanding(
        principal([
          assignment({
            schoolId: "school-b",
            scope: { schoolId: "school-b", type: "SCHOOL", reference: null },
          }),
        ]),
        NOW,
      ),
    ).toBeNull();
  });
});
