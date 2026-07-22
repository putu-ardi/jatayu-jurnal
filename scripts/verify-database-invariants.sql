\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "schools" ("id", "code", "name", "updatedAt") VALUES
  ('10000000-0000-0000-0000-000000000001', 'invariant-a', 'Invariant School A', CURRENT_TIMESTAMP),
  ('10000000-0000-0000-0000-000000000002', 'invariant-b', 'Invariant School B', CURRENT_TIMESTAMP);

INSERT INTO "users" (
  "id", "schoolId", "email", "fullName", "status", "provisioningSource", "updatedAt"
) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'admin-a@invariant.test', 'Admin A', 'ACTIVE', 'MANUAL', CURRENT_TIMESTAMP),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'teacher-a@invariant.test', 'Teacher A', 'ACTIVE', 'MANUAL', CURRENT_TIMESTAMP),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'admin-b@invariant.test', 'Admin B', 'ACTIVE', 'MANUAL', CURRENT_TIMESTAMP);

INSERT INTO "roles" ("id", "key", "name", "description", "updatedAt") VALUES
  ('30000000-0000-0000-0000-000000000001', 'invariant-teacher', 'Invariant Teacher', 'Role fixture for invariant verification.', CURRENT_TIMESTAMP);

CREATE OR REPLACE FUNCTION pg_temp.assert_rejected(
  statement_text text,
  expected_state text,
  expected_message text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  actual_state text;
  actual_message text;
BEGIN
  BEGIN
    EXECUTE statement_text;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      actual_state = RETURNED_SQLSTATE,
      actual_message = MESSAGE_TEXT;
  END;

  IF actual_state IS NULL THEN
    RAISE EXCEPTION 'Invariant unexpectedly accepted statement: %', statement_text;
  END IF;
  IF actual_state <> expected_state THEN
    RAISE EXCEPTION 'Expected SQLSTATE %, got % (%). Statement: %', expected_state, actual_state, actual_message, statement_text;
  END IF;
  IF expected_message IS NOT NULL AND position(expected_message IN actual_message) = 0 THEN
    RAISE EXCEPTION 'Expected message containing %, got %. Statement: %', expected_message, actual_message, statement_text;
  END IF;
END;
$$;

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "schools" ("id", "code", "name", "updatedAt") VALUES ('10000000-0000-0000-0000-000000000003', 'INVARIANT-A', 'Duplicate code', CURRENT_TIMESTAMP)$sql$,
  '23505',
  'schools_code_ci_key'
);

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "users" ("id", "schoolId", "email", "fullName", "status", "provisioningSource", "updatedAt") VALUES ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'ADMIN-A@INVARIANT.TEST', 'Duplicate email', 'ACTIVE', 'MANUAL', CURRENT_TIMESTAMP)$sql$,
  '23505',
  'users_schoolId_email_ci_key'
);

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "role_assignments" ("id", "schoolId", "userId", "roleId", "scopeType", "scopeLabel", "activeFrom", "grantedByUserId", "grantReason", "updatedAt") VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'SCHOOL', 'School', CURRENT_TIMESTAMP, '20000000-0000-0000-0000-000000000001', 'Cross-school fixture', CURRENT_TIMESTAMP)$sql$,
  'P0001',
  'same school'
);

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "role_assignments" ("id", "schoolId", "userId", "roleId", "scopeType", "scopeReference", "scopeLabel", "activeFrom", "grantedByUserId", "grantReason", "updatedAt") VALUES ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'SCHOOL', 'must-be-null', 'School', CURRENT_TIMESTAMP, '20000000-0000-0000-0000-000000000001', 'Invalid scope fixture', CURRENT_TIMESTAMP)$sql$,
  '23514',
  'role_assignments_scope_reference_check'
);

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "role_assignments" ("id", "schoolId", "userId", "roleId", "scopeType", "scopeLabel", "activeFrom", "activeUntil", "grantedByUserId", "grantReason", "updatedAt") VALUES ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'SCHOOL', 'School', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '20000000-0000-0000-0000-000000000001', 'Invalid range fixture', CURRENT_TIMESTAMP)$sql$,
  '23514',
  'role_assignments_effective_range_check'
);

INSERT INTO "role_assignments" (
  "id", "schoolId", "userId", "roleId", "scopeType", "scopeLabel", "activeFrom", "grantedByUserId", "grantReason", "updatedAt"
) VALUES (
  '40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'SCHOOL', 'School', CURRENT_TIMESTAMP, '20000000-0000-0000-0000-000000000001', 'Valid assignment fixture', CURRENT_TIMESTAMP
);

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "role_assignments" ("id", "schoolId", "userId", "roleId", "scopeType", "scopeLabel", "activeFrom", "grantedByUserId", "grantReason", "updatedAt") VALUES ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'SCHOOL', 'School', CURRENT_TIMESTAMP + interval '1 second', '20000000-0000-0000-0000-000000000001', 'Overlapping assignment fixture', CURRENT_TIMESTAMP)$sql$,
  '23P01',
  'role_assignments_no_overlapping_active_range'
);

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "sessions" ("id", "userId", "tokenHash", "authMethod", "authenticatedAt", "lastSeenAt", "expiresAt", "version") VALUES ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'not-a-token-hash', 'FALLBACK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', 1)$sql$,
  '23514',
  'sessions_token_hash_check'
);

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "sessions" ("id", "userId", "tokenHash", "authMethod", "authenticatedAt", "lastSeenAt", "expiresAt", "version") VALUES ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', repeat('a', 64), 'FALLBACK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', 0)$sql$,
  '23514',
  'sessions_version_check'
);

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "sessions" ("id", "userId", "tokenHash", "authMethod", "authenticatedAt", "lastSeenAt", "expiresAt", "revokedAt", "revokedByUserId", "revokeReason") VALUES ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', repeat('b', 64), 'FALLBACK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP, '20000000-0000-0000-0000-000000000003', 'Cross-school revoker fixture')$sql$,
  'P0001',
  'same school'
);

SELECT pg_temp.assert_rejected(
  $sql$INSERT INTO "audit_logs" ("id", "schoolId", "actorUserId", "eventType", "entityType", "action", "outcome", "correlationId") VALUES ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'invariant.cross-tenant', 'User', 'verify', 'DENIED', 'invariant-cross-tenant')$sql$,
  'P0001',
  'same school'
);

INSERT INTO "audit_logs" (
  "id", "schoolId", "actorUserId", "eventType", "entityType", "action", "outcome", "correlationId"
) VALUES (
  '60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'invariant.valid', 'User', 'verify', 'SUCCEEDED', 'invariant-valid'
);

SELECT pg_temp.assert_rejected(
  $sql$UPDATE "audit_logs" SET "reason" = 'mutation' WHERE "id" = '60000000-0000-0000-0000-000000000002'$sql$,
  'P0001',
  'append-only'
);

SELECT pg_temp.assert_rejected(
  $sql$DELETE FROM "audit_logs" WHERE "id" = '60000000-0000-0000-0000-000000000002'$sql$,
  'P0001',
  'append-only'
);

INSERT INTO "branding_revisions" (
  "id", "schoolId", "revisionNumber", "status", "applicationName", "shortName", "schoolName", "themePreset", "changeReason", "createdById", "publishedById", "publishedAt", "updatedAt"
) VALUES (
  '70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'PUBLISHED', 'E-JLS Invariant', 'E-JLS', 'Invariant School A', 'jatayu-blue', 'Published fixture for immutability verification.', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

SELECT pg_temp.assert_rejected(
  $sql$UPDATE "branding_revisions" SET "applicationName" = 'Mutated' WHERE "id" = '70000000-0000-0000-0000-000000000001'$sql$,
  'P0001',
  'immutable'
);

SELECT pg_temp.assert_rejected(
  $sql$DELETE FROM "branding_revisions" WHERE "id" = '70000000-0000-0000-0000-000000000001'$sql$,
  'P0001',
  'immutable'
);

ROLLBACK;

SELECT 'database invariants: passed' AS result;
