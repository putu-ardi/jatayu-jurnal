-- Add the explicit, high-risk permission required to link a Google identity.
INSERT INTO "permissions" ("id", "key", "description", "riskLevel")
VALUES (
  '5149db35-df25-4b59-950a-4d5ae86b1a07'::uuid,
  'iam.identities.link',
  'Menautkan identitas Google Workspace secara eksplisit.',
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
JOIN "permissions" permission ON permission."key" = 'iam.identities.link'
WHERE role."key" = 'admin-akses'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
