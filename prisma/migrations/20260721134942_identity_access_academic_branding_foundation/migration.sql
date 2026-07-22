-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ProvisioningSource" AS ENUM ('GOOGLE_WORKSPACE', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('GOOGLE_WORKSPACE');

-- CreateEnum
CREATE TYPE "SessionAuthMethod" AS ENUM ('GOOGLE_WORKSPACE', 'FALLBACK');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('SELF', 'CLASS', 'PROGRAM', 'ROOM', 'SCHOOL');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AcademicPeriodStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BrandingRevisionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BrandAssetStatus" AS ENUM ('QUARANTINED', 'SCAN_PASSED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED');

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_settings" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "effectiveBrandingRevisionId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "username" VARCHAR(64),
    "fullName" VARCHAR(120) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "provisioningSource" "ProvisioningSource" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMPTZ(3),
    "deactivatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "issuer" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "emailAtLink" VARCHAR(254) NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "linkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(96) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeReference" VARCHAR(128),
    "scopeLabel" VARCHAR(120) NOT NULL,
    "activeFrom" TIMESTAMPTZ(3) NOT NULL,
    "activeUntil" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "grantedByUserId" UUID,
    "revokedByUserId" UUID,
    "grantReason" VARCHAR(500) NOT NULL,
    "revokeReason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_grant_boundaries" (
    "id" UUID NOT NULL,
    "actorAssignmentId" UUID NOT NULL,
    "grantableRoleId" UUID NOT NULL,
    "boundaryScopeType" "ScopeType" NOT NULL,
    "boundaryScopeReference" VARCHAR(128),

    CONSTRAINT "role_grant_boundaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "authMethod" "SessionAuthMethod" NOT NULL,
    "authenticatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "revokeReason" VARCHAR(500),
    "userAgentHash" CHAR(64),
    "deviceLabel" VARCHAR(80),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fallback_credentials" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "enabledAt" TIMESTAMPTZ(3) NOT NULL,
    "disabledAt" TIMESTAMPTZ(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "passwordChangedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fallback_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" "AcademicPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "activatedById" UUID,
    "activatedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branding_revisions" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "BrandingRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "applicationName" VARCHAR(80) NOT NULL,
    "shortName" VARCHAR(24) NOT NULL,
    "schoolName" VARCHAR(120) NOT NULL,
    "slogan" VARCHAR(140),
    "logoAltText" VARCHAR(120),
    "themePreset" VARCHAR(48) NOT NULL DEFAULT 'jatayu-blue',
    "primaryColor" CHAR(7),
    "footerText" VARCHAR(200),
    "supportText" VARCHAR(120),
    "footerLinks" JSONB NOT NULL DEFAULT '[]',
    "showBuildVersion" BOOLEAN NOT NULL DEFAULT true,
    "primaryLogoAssetId" UUID,
    "inverseLogoAssetId" UUID,
    "applicationIconAssetId" UUID,
    "footerLogoAssetId" UUID,
    "changeReason" VARCHAR(500),
    "createdById" UUID NOT NULL,
    "publishedById" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branding_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_assets" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "status" "BrandAssetStatus" NOT NULL DEFAULT 'QUARANTINED',
    "mediaType" VARCHAR(32) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "privateStorageKey" VARCHAR(255) NOT NULL,
    "publishedStorageKey" VARCHAR(255),
    "originalFileName" VARCHAR(160),
    "uploadedById" UUID NOT NULL,
    "scannedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brand_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "schoolId" UUID NOT NULL,
    "actorUserId" UUID,
    "subjectUserId" UUID,
    "actorAssignmentId" UUID,
    "actorAssignmentSnapshot" JSONB,
    "eventType" VARCHAR(96) NOT NULL,
    "entityType" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(128),
    "action" VARCHAR(96) NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "reason" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "correlationId" VARCHAR(64) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");

-- CreateIndex
CREATE UNIQUE INDEX "school_settings_schoolId_key" ON "school_settings"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "school_settings_effectiveBrandingRevisionId_key" ON "school_settings"("effectiveBrandingRevisionId");

-- CreateIndex
CREATE INDEX "users_schoolId_status_fullName_idx" ON "users"("schoolId", "status", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "users_schoolId_email_key" ON "users"("schoolId", "email");

-- Case-insensitive identity protection for normalized login identifiers.
CREATE UNIQUE INDEX "users_schoolId_email_ci_key" ON "users"("schoolId", lower("email"));

-- CreateIndex
CREATE UNIQUE INDEX "users_schoolId_username_key" ON "users"("schoolId", "username");

CREATE UNIQUE INDEX "users_schoolId_username_ci_key" ON "users"("schoolId", lower("username")) WHERE "username" IS NOT NULL;

-- CreateIndex
CREATE INDEX "user_identities_userId_idx" ON "user_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_issuer_subject_key" ON "user_identities"("provider", "issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_userId_provider_issuer_key" ON "user_identities"("userId", "provider", "issuer");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_assignments_schoolId_userId_revokedAt_idx" ON "role_assignments"("schoolId", "userId", "revokedAt");

-- CreateIndex
CREATE INDEX "role_assignments_schoolId_roleId_scopeType_scopeReference_idx" ON "role_assignments"("schoolId", "roleId", "scopeType", "scopeReference");

-- CreateIndex
-- NULLS NOT DISTINCT prevents duplicate school-wide grant boundaries.
CREATE UNIQUE INDEX "role_grant_boundaries_actorAssignmentId_grantableRoleId_bou_key" ON "role_grant_boundaries"("actorAssignmentId", "grantableRoleId", "boundaryScopeType", "boundaryScopeReference") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_expiresAt_idx" ON "sessions"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "fallback_credentials_userId_key" ON "fallback_credentials"("userId");

-- CreateIndex
CREATE INDEX "academic_periods_schoolId_status_startsOn_idx" ON "academic_periods"("schoolId", "status", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_schoolId_code_key" ON "academic_periods"("schoolId", "code");

-- Database-level protection against concurrent activation attempts.
CREATE UNIQUE INDEX "academic_periods_one_active_per_school_key"
ON "academic_periods"("schoolId")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "branding_revisions_schoolId_status_createdAt_idx" ON "branding_revisions"("schoolId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "branding_revisions_schoolId_revisionNumber_key" ON "branding_revisions"("schoolId", "revisionNumber");

-- A school edits one draft at a time; published history remains immutable.
CREATE UNIQUE INDEX "branding_revisions_one_draft_per_school_key"
ON "branding_revisions"("schoolId")
WHERE "status" = 'DRAFT';

-- CreateIndex
CREATE INDEX "brand_assets_schoolId_status_createdAt_idx" ON "brand_assets"("schoolId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "brand_assets_schoolId_sha256_key" ON "brand_assets"("schoolId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_sequence_key" ON "audit_logs"("sequence");

-- CreateIndex
CREATE INDEX "audit_logs_schoolId_occurredAt_idx" ON "audit_logs"("schoolId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_schoolId_entityType_entityId_occurredAt_idx" ON "audit_logs"("schoolId", "entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_schoolId_actorUserId_occurredAt_idx" ON "audit_logs"("schoolId", "actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_schoolId_subjectUserId_occurredAt_idx" ON "audit_logs"("schoolId", "subjectUserId", "occurredAt");

-- AddForeignKey
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_effectiveBrandingRevisionId_fkey" FOREIGN KEY ("effectiveBrandingRevisionId") REFERENCES "branding_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_grant_boundaries" ADD CONSTRAINT "role_grant_boundaries_actorAssignmentId_fkey" FOREIGN KEY ("actorAssignmentId") REFERENCES "role_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_grant_boundaries" ADD CONSTRAINT "role_grant_boundaries_grantableRoleId_fkey" FOREIGN KEY ("grantableRoleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fallback_credentials" ADD CONSTRAINT "fallback_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_revisions" ADD CONSTRAINT "branding_revisions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_revisions" ADD CONSTRAINT "branding_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_revisions" ADD CONSTRAINT "branding_revisions_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_revisions" ADD CONSTRAINT "branding_revisions_primaryLogoAssetId_fkey" FOREIGN KEY ("primaryLogoAssetId") REFERENCES "brand_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_revisions" ADD CONSTRAINT "branding_revisions_inverseLogoAssetId_fkey" FOREIGN KEY ("inverseLogoAssetId") REFERENCES "brand_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_revisions" ADD CONSTRAINT "branding_revisions_applicationIconAssetId_fkey" FOREIGN KEY ("applicationIconAssetId") REFERENCES "brand_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branding_revisions" ADD CONSTRAINT "branding_revisions_footerLogoAssetId_fkey" FOREIGN KEY ("footerLogoAssetId") REFERENCES "brand_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorAssignmentId_fkey" FOREIGN KEY ("actorAssignmentId") REFERENCES "role_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain invariants that Prisma cannot express directly.
ALTER TABLE "role_assignments"
  ADD CONSTRAINT "role_assignments_effective_range_check" CHECK ("activeUntil" IS NULL OR "activeUntil" > "activeFrom"),
  ADD CONSTRAINT "role_assignments_scope_reference_check" CHECK (("scopeType" = 'SCHOOL' AND "scopeReference" IS NULL) OR ("scopeType" <> 'SCHOOL' AND "scopeReference" IS NOT NULL)),
  ADD CONSTRAINT "role_assignments_version_check" CHECK ("version" > 0);

ALTER TABLE "role_grant_boundaries"
  ADD CONSTRAINT "role_grant_boundaries_scope_reference_check" CHECK (("boundaryScopeType" = 'SCHOOL' AND "boundaryScopeReference" IS NULL) OR ("boundaryScopeType" <> 'SCHOOL' AND "boundaryScopeReference" IS NOT NULL));

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_token_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sessions_expiry_check" CHECK ("expiresAt" > "authenticatedAt"),
  ADD CONSTRAINT "sessions_version_check" CHECK ("version" > 0);

ALTER TABLE "fallback_credentials"
  ADD CONSTRAINT "fallback_credentials_failed_attempts_check" CHECK ("failedAttempts" >= 0),
  ADD CONSTRAINT "fallback_credentials_version_check" CHECK ("version" > 0);

ALTER TABLE "academic_periods"
  ADD CONSTRAINT "academic_periods_date_range_check" CHECK ("endsOn" >= "startsOn"),
  ADD CONSTRAINT "academic_periods_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "academic_periods_activation_check" CHECK (("status" <> 'ACTIVE') OR ("activatedById" IS NOT NULL AND "activatedAt" IS NOT NULL));

ALTER TABLE "branding_revisions"
  ADD CONSTRAINT "branding_revisions_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "branding_revisions_number_check" CHECK ("revisionNumber" > 0),
  ADD CONSTRAINT "branding_revisions_primary_color_check" CHECK ("primaryColor" IS NULL OR "primaryColor" ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT "branding_revisions_publish_metadata_check" CHECK (("status" = 'DRAFT' AND "publishedById" IS NULL AND "publishedAt" IS NULL) OR ("status" <> 'DRAFT' AND "publishedById" IS NOT NULL AND "publishedAt" IS NOT NULL AND length(trim("changeReason")) > 0));

ALTER TABLE "brand_assets"
  ADD CONSTRAINT "brand_assets_dimensions_check" CHECK ("byteSize" > 0 AND "width" > 0 AND "height" > 0),
  ADD CONSTRAINT "brand_assets_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "brand_assets_publish_metadata_check" CHECK (("status" <> 'PUBLISHED') OR ("publishedStorageKey" IS NOT NULL AND "scannedAt" IS NOT NULL AND "publishedAt" IS NOT NULL));

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_correlation_id_check" CHECK (length(trim("correlationId")) > 0);

-- Prevent cross-school references even when a valid identifier is known.
CREATE FUNCTION enforce_ejls_tenant_consistency() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'role_assignments' THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."userId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Role assignment user must belong to the same school';
    END IF;
    IF NEW."grantedByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."grantedByUserId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Role assignment grantor must belong to the same school';
    END IF;
    IF NEW."revokedByUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."revokedByUserId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Role assignment revoker must belong to the same school';
    END IF;
  ELSIF TG_TABLE_NAME = 'academic_periods' THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."createdById" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Academic period creator must belong to the same school';
    END IF;
    IF NEW."activatedById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."activatedById" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Academic period activator must belong to the same school';
    END IF;
  ELSIF TG_TABLE_NAME = 'branding_revisions' THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."createdById" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Branding revision creator must belong to the same school';
    END IF;
    IF NEW."publishedById" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."publishedById" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Branding revision publisher must belong to the same school';
    END IF;
    IF NEW."primaryLogoAssetId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.brand_assets WHERE id = NEW."primaryLogoAssetId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Primary logo asset must belong to the same school';
    END IF;
    IF NEW."inverseLogoAssetId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.brand_assets WHERE id = NEW."inverseLogoAssetId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Inverse logo asset must belong to the same school';
    END IF;
    IF NEW."applicationIconAssetId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.brand_assets WHERE id = NEW."applicationIconAssetId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Application icon asset must belong to the same school';
    END IF;
    IF NEW."footerLogoAssetId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.brand_assets WHERE id = NEW."footerLogoAssetId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Footer logo asset must belong to the same school';
    END IF;
  ELSIF TG_TABLE_NAME = 'brand_assets' THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."uploadedById" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Brand asset uploader must belong to the same school';
    END IF;
  ELSIF TG_TABLE_NAME = 'school_settings' THEN
    IF NEW."effectiveBrandingRevisionId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.branding_revisions
      WHERE id = NEW."effectiveBrandingRevisionId" AND "schoolId" = NEW."schoolId" AND status = 'PUBLISHED'
    ) THEN
      RAISE EXCEPTION 'Effective branding revision must be published and belong to the same school';
    END IF;
  ELSIF TG_TABLE_NAME = 'audit_logs' THEN
    IF NEW."actorUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."actorUserId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Audit actor must belong to the same school';
    END IF;
    IF NEW."subjectUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW."subjectUserId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Audit subject must belong to the same school';
    END IF;
    IF NEW."actorAssignmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.role_assignments WHERE id = NEW."actorAssignmentId" AND "schoolId" = NEW."schoolId") THEN
      RAISE EXCEPTION 'Audit actor assignment must belong to the same school';
    END IF;
  ELSIF TG_TABLE_NAME = 'sessions' THEN
    IF NEW."revokedByUserId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.users subject
      JOIN public.users actor ON actor.id = NEW."revokedByUserId" AND actor."schoolId" = subject."schoolId"
      WHERE subject.id = NEW."userId"
    ) THEN
      RAISE EXCEPTION 'Session revoker must belong to the same school';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER role_assignments_tenant_check BEFORE INSERT OR UPDATE ON "role_assignments" FOR EACH ROW EXECUTE FUNCTION enforce_ejls_tenant_consistency();
CREATE TRIGGER academic_periods_tenant_check BEFORE INSERT OR UPDATE ON "academic_periods" FOR EACH ROW EXECUTE FUNCTION enforce_ejls_tenant_consistency();
CREATE TRIGGER branding_revisions_tenant_check BEFORE INSERT OR UPDATE ON "branding_revisions" FOR EACH ROW EXECUTE FUNCTION enforce_ejls_tenant_consistency();
CREATE TRIGGER brand_assets_tenant_check BEFORE INSERT OR UPDATE ON "brand_assets" FOR EACH ROW EXECUTE FUNCTION enforce_ejls_tenant_consistency();
CREATE TRIGGER school_settings_tenant_check BEFORE INSERT OR UPDATE ON "school_settings" FOR EACH ROW EXECUTE FUNCTION enforce_ejls_tenant_consistency();
CREATE TRIGGER audit_logs_tenant_check BEFORE INSERT ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION enforce_ejls_tenant_consistency();
CREATE TRIGGER sessions_tenant_check BEFORE INSERT OR UPDATE ON "sessions" FOR EACH ROW EXECUTE FUNCTION enforce_ejls_tenant_consistency();

-- Published branding content and audit events are immutable records.
CREATE FUNCTION protect_published_branding_revision() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Published branding history is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'Superseded branding revisions are immutable';
  END IF;

  IF OLD.status = 'PUBLISHED' THEN
    IF NEW.status = 'SUPERSEDED'
       AND (to_jsonb(NEW) - 'status' - 'updatedAt') = (to_jsonb(OLD) - 'status' - 'updatedAt') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Published branding content is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER branding_revisions_immutable_check
BEFORE UPDATE OR DELETE ON "branding_revisions"
FOR EACH ROW EXECUTE FUNCTION protect_published_branding_revision();

CREATE FUNCTION forbid_audit_log_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only';
END;
$$;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_mutation();
