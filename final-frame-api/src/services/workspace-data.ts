import { prisma } from '../config/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { createPage, type Page } from '../utils/pagination.js';

const authorSelect = { id: true, name: true } as const;

/** Internal feedback row. Storage keys never leave the API response layer. */
export const commentDatabaseSelect = {
  id: true,
  text: true,
  anchorType: true,
  xPos: true,
  yPos: true,
  pageNumber: true,
  lineStart: true,
  lineEnd: true,
  columnStart: true,
  columnEnd: true,
  audioKey: true,
  audioMimeType: true,
  audioFileSize: true,
  timestamp: true,
  isBlocking: true,
  isResolved: true,
  isDeleted: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  assetId: true,
  authorId: true,
  author: { select: authorSelect },
} as const;

type CommentDatabaseRow = Prisma.CommentGetPayload<{ select: typeof commentDatabaseSelect }>;

export function serializeComment(comment: CommentDatabaseRow) {
  const { audioKey, audioFileSize: _audioFileSize, ...publicComment } = comment;
  return {
    ...publicComment,
    hasAudio: Boolean(audioKey),
  };
}

export const assetPublicSelect = {
  id: true,
  fileName: true,
  normalizedName: true,
  stackKey: true,
  mimeType: true,
  fileSize: true,
  previewMimeType: true,
  previewFileSize: true,
  width: true,
  height: true,
  durationSeconds: true,
  processingStatus: true,
  processingError: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  projectId: true,
} as const;

export async function loadAssetPage(
  projectId: string,
  cursor: string | undefined,
  limit: number,
  initialCommentLimit = 50,
) {
  const rows = await prisma.asset.findMany({
    where: { projectId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      ...assetPublicSelect,
      comments: {
        where: { isDeleted: false },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: initialCommentLimit + 1,
        select: commentDatabaseSelect,
      },
    },
  });
  const page = createPage(rows, limit);
  return {
    ...page,
    items: page.items.map((asset) => {
      const commentPage = createPage(asset.comments, initialCommentLimit);
      return {
        ...asset,
        comments: [...commentPage.items].reverse().map(serializeComment),
        commentPageInfo: commentPage.pageInfo,
      };
    }),
  };
}

export async function loadActivityPage(projectId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.activityLog.findMany({
    where: { projectId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, projectId: true, userId: true, action: true, details: true, createdAt: true, user: { select: authorSelect } },
  });
  return createPage(rows, limit);
}

export async function loadCommentPage(
  assetId: string,
  cursor: string | undefined,
  limit: number,
): Promise<Page<ReturnType<typeof serializeComment>>> {
  const page = createPage(await fetchCommentRows(assetId, cursor, limit), limit);
  return {
    ...page,
    items: page.items.map(serializeComment),
  };
}

const fetchCommentRows = (assetId: string, cursor: string | undefined, limit: number) => prisma.comment.findMany({
  where: { assetId, isDeleted: false },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: limit + 1,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  select: commentDatabaseSelect,
});
