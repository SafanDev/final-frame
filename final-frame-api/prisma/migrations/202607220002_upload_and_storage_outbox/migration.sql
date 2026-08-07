-- Bind presigned uploads to a user/project and move R2 deletion into a
-- retryable outbox. This removes replay, cross-tenant key attachment and the
-- false assumption that PostgreSQL and R2 can commit atomically.

DO $$ BEGIN
  CREATE TYPE "UploadKind" AS ENUM ('ASSET', 'VOICE_NOTE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StorageDeletionStatus" AS ENUM ('PENDING', 'PROCESSING', 'FAILED', 'ABANDONED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Preserve one owner for legacy duplicate audio references before enforcing
-- one voice-note object per comment.
WITH ranked_audio AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "audioKey" ORDER BY "createdAt", "id") AS row_number
  FROM "Comment"
  WHERE "audioKey" IS NOT NULL
)
UPDATE "Comment" AS comment
SET "audioKey" = NULL
FROM ranked_audio
WHERE comment."id" = ranked_audio."id"
  AND ranked_audio.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Comment_audioKey_key" ON "Comment"("audioKey");

CREATE TABLE IF NOT EXISTS "UploadReservation" (
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
  CONSTRAINT "UploadReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UploadReservation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UploadReservation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UploadReservation_storageKey_key"
  ON "UploadReservation"("storageKey");
CREATE INDEX IF NOT EXISTS "UploadReservation_projectId_userId_kind_expiresAt_idx"
  ON "UploadReservation"("projectId", "userId", "kind", "expiresAt");
CREATE INDEX IF NOT EXISTS "UploadReservation_expiresAt_consumedAt_idx"
  ON "UploadReservation"("expiresAt", "consumedAt");

CREATE TABLE IF NOT EXISTS "StorageDeletionTask" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "status" "StorageDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorageDeletionTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StorageDeletionTask_objectKey_key"
  ON "StorageDeletionTask"("objectKey");
CREATE INDEX IF NOT EXISTS "StorageDeletionTask_status_nextAttemptAt_idx"
  ON "StorageDeletionTask"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "StorageDeletionTask_status_lockedAt_idx"
  ON "StorageDeletionTask"("status", "lockedAt");

-- The default exists only so a pre-existing deployment can create the table
-- safely. Prisma's @updatedAt owns all later writes, so remove the database
-- default to keep the live schema aligned with schema.prisma.
ALTER TABLE "StorageDeletionTask" ALTER COLUMN "updatedAt" DROP DEFAULT;
