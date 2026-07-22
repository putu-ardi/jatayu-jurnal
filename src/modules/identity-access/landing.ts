import { authorize, capabilities, type Principal } from "./policy";

export type ImplementedLanding = "/admin/akses" | null;

export function resolveImplementedLanding(
  principal: Principal,
  now = new Date(),
): ImplementedLanding {
  const schoolScope = {
    schoolId: principal.schoolId,
    type: "SCHOOL" as const,
    reference: null,
  };

  return authorize(principal, capabilities.usersRead, schoolScope, now).allowed
    ? "/admin/akses"
    : null;
}
