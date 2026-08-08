-- FinalFrame world-class hardening migration.
-- Existing unsafe invitation links are deliberately invalidated because the
-- legacy schema cannot bind them to an intended email address.

ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'IN_REVIEW';

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PROJECT_DELETE_REQUESTED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PROJECT_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'MEMBER_APPROVER_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'INVITE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'INVITE_ACCEPTED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'INVITE_REVOKED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ASSET_PROCESSING_FAILED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'COMMENT_EDITED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'REVIEW_SUBMITTED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'REVIEW_WITHDRAWN';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PROJECT_APPROVED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'AI_ENABLED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'AI_DISABLED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_EXPORT_REQUESTED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETION_REQUESTED';

CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'DELETED');
CREATE TYPE "AccountPlan" AS ENUM ('FREE', 'PRO');
CREATE TYPE "ProjectDeletionStatus" AS ENUM ('ACTIVE', 'DELETING', 'DELETED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'ABANDONED', 'CANCELLED');
CREATE TYPE "EmailOutboxType" AS ENUM ('PROJECT_INVITATION', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'NOTIFICATION');
CREATE TYPE "ApprovalDecision" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'CHANGES_REQUESTED', 'APPROVED', 'REOPENED');
CREATE TYPE "AssetProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'CLEAN', 'REJECTED');
CREATE TYPE "CommentAnchorType" AS ENUM ('GENERAL', 'POINT', 'PDF_POINT', 'CODE_RANGE', 'VIDEO_POINT');
CREATE TYPE "AccountTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TYPE "NotificationType" AS ENUM ('INVITED', 'MEMBER_JOINED', 'COMMENT_ADDED', 'COMMENT_RESOLVED', 'REVIEW_SUBMITTED', 'CHANGES_REQUESTED', 'PROJECT_APPROVED', 'ACCESS_REVOKED');

ALTER TABLE "User"
  ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "plan" "AccountPlan" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecretCiphertext" TEXT,
  ADD COLUMN "mfaSecretIv" TEXT,
  ADD COLUMN "mfaSecretTag" TEXT,
  ADD COLUMN "mfaPendingCiphertext" TEXT,
  ADD COLUMN "mfaPendingIv" TEXT,
  ADD COLUMN "mfaPendingTag" TEXT,
  ADD COLUMN "mfaPendingExpiresAt" TIMESTAMP(3),
  ADD COLUMN "mfaLastUsedCounter" BIGINT,
  ADD COLUMN "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "monthlyAiRequests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
UPDATE "User" SET "role" = 'DESIGNER'
WHERE "id" IN (SELECT DISTINCT "ownerId" FROM "Project");

ALTER TABLE "Project"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletionStatus" "ProjectDeletionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "finalAssetId" TEXT;

UPDATE "Project" SET "archivedAt" = "updatedAt" WHERE "isArchived" = true;
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- Legacy project-level invite hashes cannot be safely converted to email-bound,
-- one-time invitations, so they are invalidated during the security migration.
ALTER TABLE "Project" DROP COLUMN "inviteTokenHash";
ALTER TABLE "Project" DROP COLUMN "inviteTokenExpiresAt";

ALTER TABLE "ProjectMember"
  ADD COLUMN "isApprover" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Asset"
  RENAME COLUMN "fileUrl" TO "storageKey";
ALTER TABLE "Asset"
  ADD COLUMN "previewKey" TEXT,
  ADD COLUMN "normalizedName" TEXT,
  ADD COLUMN "stackKey" TEXT,
  ADD COLUMN "sha256" CHAR(64),
  ADD COLUMN "previewMimeType" TEXT,
  ADD COLUMN "previewFileSize" INTEGER,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "durationSeconds" DOUBLE PRECISION,
  ADD COLUMN "processingStatus" "AssetProcessingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "processingError" TEXT,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3);

WITH ranked AS (
  SELECT "id", lower(trim("fileName")) AS normalized,
         row_number() OVER (PARTITION BY "projectId", lower(trim("fileName")), "version" ORDER BY "createdAt", "id") AS duplicate_number
  FROM "Asset"
)
UPDATE "Asset" AS asset
SET "normalizedName" = ranked.normalized,
    "stackKey" = CASE WHEN ranked.duplicate_number = 1 THEN ranked.normalized ELSE ranked.normalized || ':' || asset."id" END
FROM ranked
WHERE ranked."id" = asset."id";

ALTER TABLE "Asset" ALTER COLUMN "normalizedName" SET NOT NULL;
ALTER TABLE "Asset" ALTER COLUMN "stackKey" SET NOT NULL;
DROP INDEX IF EXISTS "Asset_projectId_fileName_version_key";
CREATE UNIQUE INDEX "Asset_projectId_stackKey_version_key" ON "Asset"("projectId", "stackKey", "version");
CREATE INDEX "Asset_projectId_normalizedName_idx" ON "Asset"("projectId", "normalizedName");
CREATE INDEX "Asset_projectId_processingStatus_idx" ON "Asset"("projectId", "processingStatus");

ALTER TABLE "Comment"
  ADD COLUMN "anchorType" "CommentAnchorType" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "pageNumber" INTEGER,
  ADD COLUMN "lineStart" INTEGER,
  ADD COLUMN "lineEnd" INTEGER,
  ADD COLUMN "columnStart" INTEGER,
  ADD COLUMN "columnEnd" INTEGER,
  ADD COLUMN "audioMimeType" TEXT,
  ADD COLUMN "isBlocking" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "Comment"
SET "anchorType" = CASE
  WHEN "timestamp" IS NOT NULL THEN 'VIDEO_POINT'::"CommentAnchorType"
  WHEN "xPos" BETWEEN 0 AND 100 AND "yPos" BETWEEN 0 AND 100 THEN 'POINT'::"CommentAnchorType"
  ELSE 'GENERAL'::"CommentAnchorType"
END,
"xPos" = CASE WHEN "xPos" BETWEEN 0 AND 100 THEN "xPos" ELSE NULL END,
"yPos" = CASE WHEN "yPos" BETWEEN 0 AND 100 THEN "yPos" ELSE NULL END;

CREATE TABLE "ProjectInvitation" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "invitedEmail" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "canApprove" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "deliveryStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "lastDeliveryError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommentRevision" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "editorId" TEXT,
  "previousText" TEXT NOT NULL,
  "newText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalEvent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "actorId" TEXT,
  "decision" "ApprovalDecision" NOT NULL,
  "projectVersion" INTEGER NOT NULL,
  "assetId" TEXT,
  "reason" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "AccountTokenType" NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "projectId" TEXT,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailOutbox" (
  "id" TEXT NOT NULL,
  "type" "EmailOutboxType" NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "providerId" TEXT,
  "lastError" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MfaRecoveryCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" CHAR(64) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project" ADD CONSTRAINT "Project_finalAssetId_fkey" FOREIGN KEY ("finalAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProjectInvitation_tokenHash_key" ON "ProjectInvitation"("tokenHash");
CREATE INDEX "ProjectInvitation_projectId_status_createdAt_idx" ON "ProjectInvitation"("projectId", "status", "createdAt");
CREATE INDEX "ProjectInvitation_invitedEmail_status_expiresAt_idx" ON "ProjectInvitation"("invitedEmail", "status", "expiresAt");
CREATE INDEX "ProjectInvitation_deliveryStatus_updatedAt_idx" ON "ProjectInvitation"("deliveryStatus", "updatedAt");
CREATE INDEX "ProjectMember_projectId_isApprover_idx" ON "ProjectMember"("projectId", "isApprover");
CREATE INDEX "Comment_assetId_isResolved_isBlocking_isDeleted_idx" ON "Comment"("assetId", "isResolved", "isBlocking", "isDeleted");
CREATE INDEX "CommentRevision_commentId_createdAt_idx" ON "CommentRevision"("commentId", "createdAt");
CREATE INDEX "ApprovalEvent_projectId_createdAt_idx" ON "ApprovalEvent"("projectId", "createdAt");
CREATE INDEX "ApprovalEvent_actorId_createdAt_idx" ON "ApprovalEvent"("actorId", "createdAt");
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");
CREATE INDEX "AccountToken_userId_type_expiresAt_idx" ON "AccountToken"("userId", "type", "expiresAt");
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");
CREATE INDEX "Notification_projectId_createdAt_idx" ON "Notification"("projectId", "createdAt");
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");
CREATE INDEX "EmailOutbox_recipient_createdAt_idx" ON "EmailOutbox"("recipient", "createdAt");
CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");
CREATE INDEX "MfaRecoveryCode_userId_usedAt_idx" ON "MfaRecoveryCode"("userId", "usedAt");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX "Project_status_isArchived_updatedAt_idx" ON "Project"("status", "isArchived", "updatedAt");
CREATE INDEX "Project_deletionStatus_deletionRequestedAt_idx" ON "Project"("deletionStatus", "deletionRequestedAt");

ALTER TABLE "User" ADD CONSTRAINT "User_storageUsedBytes_nonnegative" CHECK ("storageUsedBytes" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_monthlyAiRequests_nonnegative" CHECK ("monthlyAiRequests" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_mfa_active_material_consistent" CHECK (
  ("mfaEnabled" = false AND "mfaSecretCiphertext" IS NULL AND "mfaSecretIv" IS NULL AND "mfaSecretTag" IS NULL)
  OR
  ("mfaEnabled" = true AND "mfaSecretCiphertext" IS NOT NULL AND "mfaSecretIv" IS NOT NULL AND "mfaSecretTag" IS NOT NULL)
);
ALTER TABLE "User" ADD CONSTRAINT "User_mfa_pending_material_consistent" CHECK (
  ("mfaPendingCiphertext" IS NULL AND "mfaPendingIv" IS NULL AND "mfaPendingTag" IS NULL AND "mfaPendingExpiresAt" IS NULL)
  OR
  ("mfaPendingCiphertext" IS NOT NULL AND "mfaPendingIv" IS NOT NULL AND "mfaPendingTag" IS NOT NULL AND "mfaPendingExpiresAt" IS NOT NULL)
);
ALTER TABLE "Project" ADD CONSTRAINT "Project_version_positive" CHECK ("version" > 0);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_fileSize_positive" CHECK ("fileSize" > 0);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_previewFileSize_positive" CHECK ("previewFileSize" IS NULL OR "previewFileSize" > 0);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_dimensions_positive" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_duration_nonnegative" CHECK ("durationSeconds" IS NULL OR "durationSeconds" >= 0);
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_coordinates_normalized" CHECK (("xPos" IS NULL OR ("xPos" >= 0 AND "xPos" <= 100)) AND ("yPos" IS NULL OR ("yPos" >= 0 AND "yPos" <= 100)));
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_page_positive" CHECK ("pageNumber" IS NULL OR "pageNumber" > 0);
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_lines_valid" CHECK (("lineStart" IS NULL AND "lineEnd" IS NULL) OR ("lineStart" > 0 AND "lineEnd" >= "lineStart"));
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_columns_valid" CHECK (("columnStart" IS NULL AND "columnEnd" IS NULL) OR ("columnStart" >= 0 AND "columnEnd" >= "columnStart"));
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_timestamp_nonnegative" CHECK ("timestamp" IS NULL OR "timestamp" >= 0);
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_acceptance_consistent" CHECK (("status" = 'ACCEPTED' AND "acceptedAt" IS NOT NULL AND "acceptedById" IS NOT NULL) OR "status" <> 'ACCEPTED');
