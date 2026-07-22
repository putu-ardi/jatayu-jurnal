-- Add the explicit, high-risk permission required to unlink a Google identity.
INSERT INTO "permissions" ("id", "key", "description", "riskLevel")
VALUES (
  '37ad410a-72fd-4b66-b09d-a119df2e44f2'::uuid,
  'iam.identities.unlink',
  'Melepas identitas Google Workspace secara eksplisit.',
  'CRITICAL'::"RiskLevel"
)
ON CONFLICT ("key") DO UPDATE
SET
  "description" = EXCLUDED."description",
  "riskLevel" = EXCLUDED."riskLevel";

-- Existing Admin Akses assignments receive the capability through their role.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."key" = 'iam.identities.unlink'
WHERE role."key" = 'admin-akses'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
