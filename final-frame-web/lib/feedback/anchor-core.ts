export type FeedbackAnchorType = "GENERAL" | "POINT" | "PDF_POINT" | "CODE_RANGE" | "VIDEO_POINT";

export interface FeedbackPoint {
  x: number;
  y: number;
}

export interface FeedbackAnchorDraft {
  location?: FeedbackPoint | null;
  pageNumber?: number | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  columnStart?: number | null;
  columnEnd?: number | null;
  timestamp?: number | null;
}

export interface FeedbackAnchorPayload {
  anchorType: FeedbackAnchorType;
  xPos: number | null;
  yPos: number | null;
  pageNumber: number | null;
  lineStart: number | null;
  lineEnd: number | null;
  columnStart: number | null;
  columnEnd: number | null;
  timestamp: number | null;
}

export function resolveFeedbackAnchor(draft: FeedbackAnchorDraft): FeedbackAnchorPayload {
  const location = draft.location ?? null;
  const pageNumber = draft.pageNumber ?? null;
  const lineStart = draft.lineStart ?? null;
  const lineEnd = draft.lineEnd ?? null;
  const timestamp = draft.timestamp ?? null;

  const anchorType: FeedbackAnchorType = timestamp !== null
    ? "VIDEO_POINT"
    : pageNumber !== null && location
      ? "PDF_POINT"
      : lineStart !== null && lineEnd !== null
        ? "CODE_RANGE"
        : location
          ? "POINT"
          : "GENERAL";

  return {
    anchorType,
    xPos: location?.x ?? null,
    yPos: location?.y ?? null,
    pageNumber,
    lineStart,
    lineEnd,
    columnStart: draft.columnStart ?? null,
    columnEnd: draft.columnEnd ?? null,
    timestamp,
  };
}
