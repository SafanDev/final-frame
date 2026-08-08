-- Harden feedback anchors and account for voice-note storage.
ALTER TABLE "Comment"
  ADD COLUMN "audioFileSize" INTEGER;

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_audioFileSize_positive"
  CHECK ("audioFileSize" IS NULL OR "audioFileSize" > 0);

-- Normalize legacy rows before enforcing the exact anchor shape. Earlier
-- versions could retain one valid coordinate when the other coordinate was
-- invalid, even though the row had been downgraded to a GENERAL anchor.
UPDATE "Comment"
SET
  "xPos" = CASE
    WHEN "anchorType" IN ('POINT', 'PDF_POINT') THEN "xPos"
    WHEN "anchorType" = 'VIDEO_POINT' AND "xPos" IS NOT NULL AND "yPos" IS NOT NULL THEN "xPos"
    ELSE NULL
  END,
  "yPos" = CASE
    WHEN "anchorType" IN ('POINT', 'PDF_POINT') THEN "yPos"
    WHEN "anchorType" = 'VIDEO_POINT' AND "xPos" IS NOT NULL AND "yPos" IS NOT NULL THEN "yPos"
    ELSE NULL
  END,
  "pageNumber" = CASE WHEN "anchorType" = 'PDF_POINT' THEN "pageNumber" ELSE NULL END,
  "lineStart" = CASE WHEN "anchorType" = 'CODE_RANGE' THEN "lineStart" ELSE NULL END,
  "lineEnd" = CASE WHEN "anchorType" = 'CODE_RANGE' THEN "lineEnd" ELSE NULL END,
  "columnStart" = CASE WHEN "anchorType" = 'CODE_RANGE' THEN "columnStart" ELSE NULL END,
  "columnEnd" = CASE WHEN "anchorType" = 'CODE_RANGE' THEN "columnEnd" ELSE NULL END,
  "timestamp" = CASE WHEN "anchorType" = 'VIDEO_POINT' THEN "timestamp" ELSE NULL END;

-- Any malformed typed anchor is safely downgraded to GENERAL rather than
-- aborting deployment or preserving ambiguous feedback coordinates.
UPDATE "Comment"
SET
  "anchorType" = 'GENERAL',
  "xPos" = NULL,
  "yPos" = NULL,
  "pageNumber" = NULL,
  "lineStart" = NULL,
  "lineEnd" = NULL,
  "columnStart" = NULL,
  "columnEnd" = NULL,
  "timestamp" = NULL
WHERE
  ("anchorType" = 'POINT' AND ("xPos" IS NULL OR "yPos" IS NULL))
  OR ("anchorType" = 'PDF_POINT' AND ("xPos" IS NULL OR "yPos" IS NULL OR "pageNumber" IS NULL))
  OR ("anchorType" = 'CODE_RANGE' AND ("lineStart" IS NULL OR "lineEnd" IS NULL))
  OR ("anchorType" = 'VIDEO_POINT' AND "timestamp" IS NULL);

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_anchor_shape_valid"
  CHECK (
    (
      "anchorType" = 'GENERAL'
      AND "xPos" IS NULL AND "yPos" IS NULL
      AND "pageNumber" IS NULL
      AND "lineStart" IS NULL AND "lineEnd" IS NULL
      AND "columnStart" IS NULL AND "columnEnd" IS NULL
      AND "timestamp" IS NULL
    )
    OR
    (
      "anchorType" = 'POINT'
      AND "xPos" IS NOT NULL AND "yPos" IS NOT NULL
      AND "pageNumber" IS NULL
      AND "lineStart" IS NULL AND "lineEnd" IS NULL
      AND "columnStart" IS NULL AND "columnEnd" IS NULL
      AND "timestamp" IS NULL
    )
    OR
    (
      "anchorType" = 'PDF_POINT'
      AND "xPos" IS NOT NULL AND "yPos" IS NOT NULL
      AND "pageNumber" IS NOT NULL
      AND "lineStart" IS NULL AND "lineEnd" IS NULL
      AND "columnStart" IS NULL AND "columnEnd" IS NULL
      AND "timestamp" IS NULL
    )
    OR
    (
      "anchorType" = 'CODE_RANGE'
      AND "xPos" IS NULL AND "yPos" IS NULL
      AND "pageNumber" IS NULL
      AND "lineStart" IS NOT NULL AND "lineEnd" IS NOT NULL
      AND "timestamp" IS NULL
    )
    OR
    (
      "anchorType" = 'VIDEO_POINT'
      AND (("xPos" IS NULL AND "yPos" IS NULL) OR ("xPos" IS NOT NULL AND "yPos" IS NOT NULL))
      AND "pageNumber" IS NULL
      AND "lineStart" IS NULL AND "lineEnd" IS NULL
      AND "columnStart" IS NULL AND "columnEnd" IS NULL
      AND "timestamp" IS NOT NULL
    )
  );
