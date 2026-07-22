-- Prevent concurrent grants from creating overlapping effective assignments for
-- the same tenant, user, role, and scope. NULL scope references are normalized
-- only for comparison; SCHOOL assignments still keep NULL in persisted data.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX "schools_code_ci_key" ON "schools" (lower("code"));

ALTER TABLE "role_assignments"
ADD CONSTRAINT "role_assignments_no_overlapping_active_range"
EXCLUDE USING gist (
  "schoolId" WITH =,
  "userId" WITH =,
  "roleId" WITH =,
  "scopeType" WITH =,
  (coalesce("scopeReference", '')) WITH =,
  (tstzrange("activeFrom", coalesce("activeUntil", 'infinity'::timestamptz), '[)')) WITH &&
)
WHERE ("revokedAt" IS NULL);
