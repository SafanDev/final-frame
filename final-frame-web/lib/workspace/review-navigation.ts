import type { ProjectComment } from "@/lib/api/types";

export interface FeedbackDeepLinkTarget {
  assetId: string | null;
  commentId: string | null;
}

export function parseFeedbackDeepLink(search: string): FeedbackDeepLinkTarget {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const assetId = params.get("asset")?.trim() || null;
  const commentId = params.get("comment")?.trim() || null;
  return { assetId, commentId };
}

export function buildFeedbackDeepLink(currentUrl: string, assetId: string, commentId: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("asset", assetId);
  url.searchParams.set("comment", commentId);
  url.hash = "";
  return url.toString();
}

export function buildProjectLink(currentUrl: string): string {
  const url = new URL(currentUrl);
  url.searchParams.delete("asset");
  url.searchParams.delete("comment");
  url.hash = "";
  return url.toString();
}

export function nextOpenFeedback(
  comments: readonly ProjectComment[],
  currentId: string | null,
  direction: -1 | 1,
): ProjectComment | null {
  const open = comments
    .filter((comment) => !comment.isResolved)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  if (open.length === 0) return null;
  const currentIndex = currentId ? open.findIndex((comment) => comment.id === currentId) : -1;
  if (currentIndex < 0) return direction === 1 ? open[0] : open[open.length - 1];
  return open[(currentIndex + direction + open.length) % open.length] ?? null;
}
