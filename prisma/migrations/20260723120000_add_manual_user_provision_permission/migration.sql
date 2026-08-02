-- Add a distinct least-privilege capability for audited manual user provisioning.
INSERT INTO "permissions" ("id", "key", "description", "riskLevel")
VALUES (
  gen_random_uuid(),
  'iam.users.provision',
  'Membuat akun pengguna manual dalam scope.',
  'HIGH'
)
ON CONFLICT ("key") DO UPDATE
SET
  "description" = EXCLUDED."description",
  "riskLevel" = EXCLUDED."riskLevel";

-- Existing deployments are already bootstrapped, so grant the new capability forward
-- without rerunning the one-shot first-admin bootstrap.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role.id, permission.id
FROM "roles" role
JOIN "permissions" permission ON permission."key" = 'iam.users.provision'
WHERE role."key" = 'admin-akses'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
