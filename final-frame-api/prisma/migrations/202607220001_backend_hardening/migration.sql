-- Existing invite links are intentionally invalidated because only hashes are
-- stored after this migration. Generate new links after deployment.

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ASSET_RENAMED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'COMMENT_REOPENED';

DROP INDEX IF EXISTS "Project_inviteToken_key";
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "inviteTokenHash" CHAR(64);
ALTER TABLE "Project" DROP COLUMN IF EXISTS "inviteToken";
CREATE UNIQUE INDEX IF NOT EXISTS "Project_inviteTokenHash_key"
  ON "Project"("inviteTokenHash");

ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Comment"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Defaults are used only to backfill existing rows. Prisma owns future values
-- through @updatedAt, so leaving database defaults would create schema drift.
ALTER TABLE "Asset" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Comment" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "Project_ownerId_updatedAt_idx"
  ON "Project"("ownerId", "updatedAt");
CREATE INDEX IF NOT EXISTS "ProjectMember_userId_joinedAt_idx"
  ON "ProjectMember"("userId", "joinedAt");
CREATE INDEX IF NOT EXISTS "Asset_projectId_createdAt_idx"
  ON "Asset"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "Asset_projectId_fileName_idx"
  ON "Asset"("projectId", "fileName");
CREATE INDEX IF NOT EXISTS "Comment_assetId_createdAt_idx"
  ON "Comment"("assetId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_projectId_createdAt_idx"
  ON "ActivityLog"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_userId_createdAt_idx"
  ON "ActivityLog"("userId", "createdAt");

-- Remove superseded single-column indexes where their left-most columns are
-- already covered by the new composite indexes.
DROP INDEX IF EXISTS "Project_ownerId_idx";
DROP INDEX IF EXISTS "ProjectMember_userId_idx";
DROP INDEX IF EXISTS "Comment_assetId_idx";
DROP INDEX IF EXISTS "ActivityLog_projectId_idx";
DROP INDEX IF EXISTS "ActivityLog_userId_idx";
