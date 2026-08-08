import type { BasicUser, ProjectComment } from "@/lib/api/types";
import type { FeedbackAnchorPayload } from "@/lib/feedback/anchor-core";

const OPTIMISTIC_COMMENT_PREFIX = "local-feedback-";

interface BuildOptimisticCommentInput {
  assetId: string;
  authorId: string;
  author: BasicUser | null;
  text: string;
  anchor: FeedbackAnchorPayload;
  id?: string;
  now?: string;
}

export function buildOptimisticComment({
  assetId,
  authorId,
  author,
  text,
  anchor,
  id,
  now = new Date().toISOString(),
}: BuildOptimisticCommentInput): ProjectComment {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  const localId = id ?? `${OPTIMISTIC_COMMENT_PREFIX}${Date.now()}-${randomId}`;
  return {
    id: localId,
    text,
    ...anchor,
    hasAudio: false,
    audioMimeType: null,
    timestamp: anchor.timestamp,
    isBlocking: false,
    isResolved: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    assetId,
    authorId,
    author,
  };
}

export function isOptimisticComment(commentOrId: ProjectComment | string): boolean {
  const id = typeof commentOrId === "string" ? commentOrId : commentOrId.id;
  return id.startsWith(OPTIMISTIC_COMMENT_PREFIX);
}
