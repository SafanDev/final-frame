-- FinalFrame production baseline.
--
-- Fresh databases can apply the complete migration chain directly. Existing
-- databases that already contain the pre-hardening schema must mark this
-- baseline as applied before running the two upgrade migrations that follow.

CREATE TYPE "Role" AS ENUM ('DESIGNER', 'CLIENT');
CREATE TYPE "ProjectStatus" AS ENUM ('IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');
CREATE TYPE "ActivityAction" AS ENUM (
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_STATUS_CHANGED',
  'PROJECT_ARCHIVED',
  'PROJECT_REOPENED',
  'DOWNLOAD_UNLOCKED',
  'DOWNLOAD_REVOKED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'INVITE_SENT',
  'ASSET_UPLOADED',
  'ASSET_RENAMED',
  'ASSET_DELETED',
  'COMMENT_ADDED',
  'COMMENT_RESOLVED',
  'COMMENT_REOPENED',
  'COMMENT_DELETED'
);
CREATE TYPE "UploadKind" AS ENUM ('ASSET', 'VOICE_NOTE');
CREATE TYPE "StorageDeletionStatus" AS ENUM ('PENDING', 'PROCESSING', 'FAILED', 'ABANDONED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'CLIENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'IN_REVIEW',
  "inviteTokenHash" CHAR(64),
  "inviteTokenExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "isDownloadUnlocked" BOOLEAN NOT NULL DEFAULT false,
  "ownerId" TEXT NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectMember" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "projectId" TEXT NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
  "id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "xPos" DOUBLE PRECISION,
  "yPos" DOUBLE PRECISION,
  "audioKey" TEXT,
  "timestamp" DOUBLE PRECISION,
  "isResolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "assetId" TEXT NOT NULL,
  "authorId" TEXT,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityLog" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT,
  "action" "ActivityAction" NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UploadReservation" (
  "id" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "UploadKind" NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorageDeletionTask" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "status" "StorageDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorageDeletionTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX "Project_inviteTokenHash_key" ON "Project"("inviteTokenHash");
CREATE INDEX "Project_ownerId_updatedAt_idx" ON "Project"("ownerId", "updatedAt");
CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_isArchived_idx" ON "Project"("isArchived");

CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
CREATE INDEX "ProjectMember_userId_joinedAt_idx" ON "ProjectMember"("userId", "joinedAt");

CREATE UNIQUE INDEX "Asset_projectId_fileName_version_key" ON "Asset"("projectId", "fileName", "version");
CREATE INDEX "Asset_projectId_createdAt_idx" ON "Asset"("projectId", "createdAt");
CREATE INDEX "Asset_projectId_fileName_idx" ON "Asset"("projectId", "fileName");

CREATE UNIQUE INDEX "Comment_audioKey_key" ON "Comment"("audioKey");
CREATE INDEX "Comment_assetId_createdAt_idx" ON "Comment"("assetId", "createdAt");
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

CREATE INDEX "ActivityLog_projectId_createdAt_idx" ON "ActivityLog"("projectId", "createdAt");
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

CREATE UNIQUE INDEX "UploadReservation_storageKey_key" ON "UploadReservation"("storageKey");
CREATE INDEX "UploadReservation_projectId_userId_kind_expiresAt_idx"
  ON "UploadReservation"("projectId", "userId", "kind", "expiresAt");
CREATE INDEX "UploadReservation_expiresAt_consumedAt_idx"
  ON "UploadReservation"("expiresAt", "consumedAt");

CREATE UNIQUE INDEX "StorageDeletionTask_objectKey_key" ON "StorageDeletionTask"("objectKey");
CREATE INDEX "StorageDeletionTask_status_nextAttemptAt_idx"
  ON "StorageDeletionTask"("status", "nextAttemptAt");
CREATE INDEX "StorageDeletionTask_status_lockedAt_idx"
  ON "StorageDeletionTask"("status", "lockedAt");

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UploadReservation"
  ADD CONSTRAINT "UploadReservation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UploadReservation"
  ADD CONSTRAINT "UploadReservation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
