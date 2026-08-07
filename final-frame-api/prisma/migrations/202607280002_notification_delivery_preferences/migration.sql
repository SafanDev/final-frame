CREATE TYPE "NotificationDeliveryMode" AS ENUM ('IMMEDIATE', 'DAILY_DIGEST', 'IN_APP_ONLY');

ALTER TABLE "User"
  ADD COLUMN "notificationDelivery" "NotificationDeliveryMode" NOT NULL DEFAULT 'IMMEDIATE',
  ADD COLUMN "locale" VARCHAR(35) NOT NULL DEFAULT 'en-US',
  ADD COLUMN "timeZone" VARCHAR(100) NOT NULL DEFAULT 'UTC';

ALTER TABLE "Notification"
  ADD COLUMN "emailStatus" "EmailDeliveryStatus",
  ADD COLUMN "emailedAt" TIMESTAMP(3);

ALTER TABLE "EmailOutbox"
  ADD COLUMN "batchKey" VARCHAR(191);

CREATE INDEX "EmailOutbox_batchKey_status_nextAttemptAt_idx" ON "EmailOutbox"("batchKey", "status", "nextAttemptAt");
CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON "Notification"("recipientId", "createdAt" DESC, "id" DESC);

ALTER TABLE "User"
  ADD CONSTRAINT "User_locale_length_check" CHECK (char_length("locale") BETWEEN 2 AND 35),
  ADD CONSTRAINT "User_timeZone_length_check" CHECK (char_length("timeZone") BETWEEN 1 AND 100);
