CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('INACTIVE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "plan" "AccountPlan" NOT NULL DEFAULT 'FREE',
  "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
  "monthlyAiRequests" INTEGER NOT NULL DEFAULT 0,
  "quotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "billingStatus" "BillingSubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
  "billingProvider" VARCHAR(40),
  "billingCustomerRef" VARCHAR(191),
  "billingSubscriptionRef" VARCHAR(191),
  "billingCurrentPeriodEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMember" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project" ADD COLUMN "organizationId" TEXT;

-- Every existing account receives a deterministic personal organization; project owners keep their current quota history.
INSERT INTO "Organization" (
  "id", "name", "slug", "plan", "storageUsedBytes", "monthlyAiRequests", "quotaResetAt", "createdAt", "updatedAt"
)
SELECT
  'org_' || md5(u."id"),
  LEFT(u."name" || ' workspace', 120),
  'workspace-' || SUBSTRING(md5(u."id") FROM 1 FOR 24),
  u."plan",
  u."storageUsedBytes",
  u."monthlyAiRequests",
  u."quotaResetAt",
  u."createdAt",
  CURRENT_TIMESTAMP
FROM "User" u;

INSERT INTO "OrganizationMember" ("id", "organizationId", "userId", "role", "joinedAt", "updatedAt")
SELECT
  'om_' || md5('org_' || md5(u."id") || ':' || u."id"),
  'org_' || md5(u."id"),
  u."id",
  'OWNER',
  u."createdAt",
  CURRENT_TIMESTAMP
FROM "User" u;

UPDATE "Project" p
SET "organizationId" = 'org_' || md5(p."ownerId")
WHERE "organizationId" IS NULL;

ALTER TABLE "Project" ALTER COLUMN "organizationId" SET NOT NULL;

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Organization_billingCustomerRef_key" ON "Organization"("billingCustomerRef");
CREATE UNIQUE INDEX "Organization_billingSubscriptionRef_key" ON "Organization"("billingSubscriptionRef");
CREATE INDEX "Organization_plan_billingStatus_idx" ON "Organization"("plan", "billingStatus");
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX "OrganizationMember_userId_joinedAt_idx" ON "OrganizationMember"("userId", "joinedAt");
CREATE INDEX "OrganizationMember_organizationId_role_idx" ON "OrganizationMember"("organizationId", "role");
CREATE INDEX "Project_organizationId_updatedAt_idx" ON "Project"("organizationId", "updatedAt" DESC);

ALTER TABLE "OrganizationMember"
  ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_storage_nonnegative" CHECK ("storageUsedBytes" >= 0),
  ADD CONSTRAINT "Organization_ai_nonnegative" CHECK ("monthlyAiRequests" >= 0);
