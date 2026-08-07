-- A security-rejected original can be retired while its audit-visible Asset row
-- remains available to explain why the upload failed. Retired originals are no
-- longer downloadable, quota-accounted, or treated as required storage objects.
ALTER TABLE "Asset" ADD COLUMN "originalRetiredAt" TIMESTAMP(3);

-- Normalize any legacy rejected asset whose original was already queued for
-- secure deletion before this explicit lifecycle field existed.
UPDATE "Asset" AS asset
SET "originalRetiredAt" = COALESCE(asset."updatedAt", CURRENT_TIMESTAMP)
WHERE asset."processingStatus" = 'REJECTED'
  AND EXISTS (
    SELECT 1
    FROM "StorageDeletionTask" AS deletion
    WHERE deletion."objectKey" = asset."storageKey"
  );

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_originalRetired_requires_rejected"
  CHECK ("originalRetiredAt" IS NULL OR "processingStatus" = 'REJECTED');
