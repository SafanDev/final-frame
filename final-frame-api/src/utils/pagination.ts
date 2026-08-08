import type { Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';

const queryInteger = (fallback: number, maximum: number) =>
  z.preprocess(
    (raw) => {
      if (raw === undefined || raw === '') return fallback;
      if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return Number.NaN;
      return Number(raw);
    },
    z.number().int().min(1).max(maximum),
  );

export const cursorPageQuerySchema = z.object({
  cursor: z.string().cuid('Invalid pagination cursor.').optional(),
  limit: queryInteger(env.PAGE_DEFAULT_SIZE, env.PAGE_MAX_SIZE),
}).strict();

export interface PageInfo {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface Page<T> {
  items: T[];
  pageInfo: PageInfo;
}

export const createPage = <T extends { id: string }>(
  rows: readonly T[],
  limit: number,
): Page<T> => {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const nextCursor = hasMore ? items.at(-1)?.id ?? null : null;

  return {
    items,
    pageInfo: { hasMore, nextCursor },
  };
};

/**
 * Existing dashboard code expects an array for GET /projects. Pagination data
 * is therefore exposed in headers until the frontend moves to page envelopes.
 */
export const setPaginationHeaders = (response: Response, pageInfo: PageInfo): void => {
  response.setHeader('X-Has-More', String(pageInfo.hasMore));
  if (pageInfo.nextCursor) response.setHeader('X-Next-Cursor', pageInfo.nextCursor);
};
