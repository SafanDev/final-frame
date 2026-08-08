ALTER TABLE "UploadReservation"
  ADD COLUMN "multipartUploadId" TEXT,
  ADD COLUMN "multipartPartSize" INTEGER,
  ADD COLUMN "multipartCompletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "UploadReservation_multipartUploadId_key"
  ON "UploadReservation"("multipartUploadId");

CREATE INDEX "UploadReservation_multipartUploadId_multipartCompletedAt_idx"
  ON "UploadReservation"("multipartUploadId", "multipartCompletedAt");

ALTER TABLE "UploadReservation"
  ADD CONSTRAINT "UploadReservation_multipart_fields_check"
  CHECK (
    ("multipartUploadId" IS NULL AND "multipartPartSize" IS NULL AND "multipartCompletedAt" IS NULL)
    OR
    ("multipartUploadId" IS NOT NULL AND "multipartPartSize" >= 5242880)
  );
