BEGIN;

-- Restore account-level quota fields before moving quota data out of organizations.
-- IF NOT EXISTS also supports databases where these fields were never removed.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthlyAiRequests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Move storage accounting to the account that owns each project.
UPDATE "User" u
SET "storageUsedBytes" = COALESCE(usage."bytes", 0)
FROM (
  SELECT
    p."ownerId",
    SUM(
      CASE WHEN a."originalRetiredAt" IS NULL THEN a."fileSize"::bigint ELSE 0::bigint END
      + COALESCE(a."previewFileSize", 0)::bigint
      + COALESCE(audio."bytes", 0)::bigint
    ) AS "bytes"
  FROM "Project" p
  LEFT JOIN "Asset" a ON a."projectId" = p."id"
  LEFT JOIN (
    SELECT c."assetId", SUM(COALESCE(c."audioFileSize", 0)::bigint) AS "bytes"
    FROM "Comment" c
    WHERE c."audioKey" IS NOT NULL
    GROUP BY c."assetId"
  ) audio ON audio."assetId" = a."id"
  GROUP BY p."ownerId"
) usage
WHERE u."id" = usage."ownerId";

UPDATE "User" u
SET "storageUsedBytes" = 0
WHERE NOT EXISTS (
  SELECT 1 FROM "Project" p WHERE p."ownerId" = u."id"
);

-- Preserve the strictest current AI usage count for organization owners.
UPDATE "User" u
SET
  "monthlyAiRequests" = COALESCE(usage."requests", u."monthlyAiRequests"),
  "quotaResetAt" = COALESCE(usage."resetAt", u."quotaResetAt")
FROM (
  SELECT
    om."userId",
    LEAST(SUM(o."monthlyAiRequests"), 2147483647)::integer AS "requests",
    MAX(o."quotaResetAt") AS "resetAt"
  FROM "OrganizationMember" om
  INNER JOIN "Organization" o ON o."id" = om."organizationId"
  WHERE om."role" = 'OWNER'
  GROUP BY om."userId"
) usage
WHERE u."id" = usage."userId";

ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_organizationId_fkey";
DROP INDEX IF EXISTS "Project_organizationId_updatedAt_idx";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "organizationId";

DROP TABLE IF EXISTS "OrganizationMember";
DROP TABLE IF EXISTS "Organization";

DROP INDEX IF EXISTS "User_role_createdAt_idx";
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
ALTER TABLE "User" DROP COLUMN IF EXISTS "plan";

-- Recreate quota integrity checks when a previous schema removed the fields.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_storageUsedBytes_nonnegative'
      AND conrelid = '"User"'::regclass
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_storageUsedBytes_nonnegative"
      CHECK ("storageUsedBytes" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_monthlyAiRequests_nonnegative'
      AND conrelid = '"User"'::regclass
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_monthlyAiRequests_nonnegative"
      CHECK ("monthlyAiRequests" >= 0);
  END IF;
END
$migration$;

DROP TYPE IF EXISTS "OrganizationRole";
DROP TYPE IF EXISTS "BillingSubscriptionStatus";
DROP TYPE IF EXISTS "AccountPlan";
DROP TYPE IF EXISTS "Role";

COMMIT;
