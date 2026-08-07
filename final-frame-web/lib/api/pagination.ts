import type { CursorPageQuery, PageInfo } from "./types";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function normalizePageLimit(limit = DEFAULT_PAGE_SIZE): number {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}

export function withCursorQuery(path: string, query: CursorPageQuery = {}): string {
  const parameters = new URLSearchParams();
  if (query.cursor) parameters.set("cursor", query.cursor);
  parameters.set("limit", String(normalizePageLimit(query.limit)));
  if (query.q?.trim()) parameters.set("q", query.q.trim());
  if (query.status) parameters.set("status", query.status);
  if (query.archived) parameters.set("archived", query.archived);
  if (query.scope) parameters.set("scope", query.scope);
  if (query.sort) parameters.set("sort", query.sort);
  return `${path}?${parameters.toString()}`;
}

export function mergePageItems<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

export const emptyPageInfo: PageInfo = Object.freeze({
  hasMore: false,
  nextCursor: null,
});
