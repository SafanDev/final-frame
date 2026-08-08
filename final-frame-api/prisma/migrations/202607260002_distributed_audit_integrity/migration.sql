ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PROJECT_AUDIT_EXPORTED';

-- Persist signatures for final approval certificates. Existing approval events
-- remain valid audit history; only new APPROVED decisions receive certificates.
ALTER TABLE "ApprovalEvent"
  ADD COLUMN "certificateDigest" CHAR(64),
  ADD COLUMN "certificateSignature" TEXT,
  ADD COLUMN "certificatePublicKey" TEXT,
  ADD COLUMN "certificateKeyId" TEXT;

CREATE INDEX "ApprovalEvent_projectId_decision_createdAt_idx"
  ON "ApprovalEvent"("projectId", "decision", "createdAt");
