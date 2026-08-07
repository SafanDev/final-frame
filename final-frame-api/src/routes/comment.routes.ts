import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  ActivityAction,
  AssetProcessingStatus,
  CommentAnchorType,
  NotificationType,
  UploadKind,
} from '../generated/prisma/enums.js';
import {
  storageKeyBelongsToProject,
  verifyUploadedObject,
} from '../config/storage.js';
import { prisma } from '../config/prisma.js';
import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '../errors/app-error.js';
import { getAuthenticatedUser, requireAuth, type AuthRequest } from '../middleware/auth.js';
import { commentLimiter, secureUrlLimiter } from '../middleware/rate-limit.js';
import { recordActivity } from '../services/activity.js';
import { UnsafeFileError } from '../errors/unsafe-file-error.js';
import { notifyProjectParticipants } from '../services/notifications.js';
import {
  assertProjectContentMutable,
  requireProjectAccess,
} from '../services/project-access.js';
import {
  addStorageUsage,
  removeStorageUsage,
  requireCommentCapacity,
  requireStorageCapacity,
} from '../services/quotas.js';
import { emitWorkspaceRefresh } from '../services/realtime.js';
import { queueStorageDeletion } from '../services/storage-cleanup.js';
import { runSerializableTransaction } from '../services/transaction.js';
import {
  consumeUploadReservation,
  requireActiveUploadReservation,
} from '../services/upload-reservations.js';
import { inspectVoiceNote } from '../services/voice-note-inspection.js';
import {
  commentDatabaseSelect,
  loadCommentPage,
  serializeComment,
} from '../services/workspace-data.js';
import { cursorPageQuerySchema } from '../utils/pagination.js';
import { disableResponseCaching } from '../utils/http.js';
import { streamPrivateObject } from '../utils/private-media.js';

const router = Router({ mergeParams: true });

const cuid = z.string().cuid('Invalid identifier.');
const assetParamsSchema = z.object({ projectId: cuid, assetId: cuid }).strict();
const commentParamsSchema = z.object({ projectId: cuid, assetId: cuid, commentId: cuid }).strict();
const coordinate = z.number().finite().min(0).max(100);
const positiveInteger = z.number().int().positive();
const nonnegativeInteger = z.number().int().nonnegative();

const rawCreateCommentSchema = z.object({
  text: z.string().trim().max(5_000).optional().default(''),
  anchorType: z.enum(CommentAnchorType).optional(),
  xPos: coordinate.nullable().optional(),
  yPos: coordinate.nullable().optional(),
  pageNumber: positiveInteger.nullable().optional(),
  lineStart: positiveInteger.nullable().optional(),
  lineEnd: positiveInteger.nullable().optional(),
  columnStart: nonnegativeInteger.nullable().optional(),
  columnEnd: nonnegativeInteger.nullable().optional(),
  audioKey: z.string().trim().min(1).max(1_024).nullable().optional(),
  timestamp: z.number().finite().min(0).max(604_800).nullable().optional(),
  isBlocking: z.boolean().optional(),
}).strict();

type RawCreateComment = z.infer<typeof rawCreateCommentSchema>;

function inferAnchorType(value: RawCreateComment): CommentAnchorType {
  if (value.timestamp !== undefined && value.timestamp !== null) return CommentAnchorType.VIDEO_POINT;
  if (value.pageNumber !== undefined && value.pageNumber !== null) return CommentAnchorType.PDF_POINT;
  if (value.lineStart !== undefined && value.lineStart !== null) return CommentAnchorType.CODE_RANGE;
  if (value.xPos !== undefined && value.xPos !== null) return CommentAnchorType.POINT;
  return CommentAnchorType.GENERAL;
}

function isNullish(value: unknown): boolean {
  return value === undefined || value === null;
}

const createCommentSchema = rawCreateCommentSchema
  .transform((value) => ({ ...value, anchorType: value.anchorType ?? inferAnchorType(value) }))
  .superRefine((value, context) => {
    if (!value.text && !value.audioKey) {
      context.addIssue({ code: 'custom', path: ['text'], message: 'A comment must contain text or a voice note.' });
    }

    const hasX = !isNullish(value.xPos);
    const hasY = !isNullish(value.yPos);
    if (hasX !== hasY) {
      context.addIssue({ code: 'custom', path: ['xPos'], message: 'Pinned feedback must include both coordinates.' });
    }

    const hasColumnStart = !isNullish(value.columnStart);
    const hasColumnEnd = !isNullish(value.columnEnd);
    if (hasColumnStart !== hasColumnEnd) {
      context.addIssue({ code: 'custom', path: ['columnStart'], message: 'Code columns must include both a start and end.' });
    }
    if (hasColumnStart && (value.columnEnd ?? 0) < (value.columnStart ?? 0)) {
      context.addIssue({ code: 'custom', path: ['columnEnd'], message: 'The ending column cannot precede the starting column.' });
    }
    if (!isNullish(value.lineStart) && !isNullish(value.lineEnd) && (value.lineEnd ?? 0) < (value.lineStart ?? 0)) {
      context.addIssue({ code: 'custom', path: ['lineEnd'], message: 'The ending line cannot precede the starting line.' });
    }

    const rejectUnexpected = (condition: boolean, path: string, message: string): void => {
      if (condition) context.addIssue({ code: 'custom', path: [path], message });
    };

    switch (value.anchorType) {
      case CommentAnchorType.GENERAL:
        rejectUnexpected(hasX || hasY || !isNullish(value.pageNumber) || !isNullish(value.lineStart)
          || !isNullish(value.lineEnd) || hasColumnStart || hasColumnEnd || !isNullish(value.timestamp),
        'anchorType', 'General feedback cannot include a file position.');
        break;
      case CommentAnchorType.POINT:
        rejectUnexpected(!hasX || !hasY, 'xPos', 'Pinned feedback requires both coordinates.');
        rejectUnexpected(!isNullish(value.pageNumber) || !isNullish(value.lineStart) || !isNullish(value.lineEnd)
          || hasColumnStart || hasColumnEnd || !isNullish(value.timestamp),
        'anchorType', 'A point anchor can only contain normalized coordinates.');
        break;
      case CommentAnchorType.PDF_POINT:
        rejectUnexpected(!hasX || !hasY || isNullish(value.pageNumber), 'pageNumber', 'PDF feedback requires a page and coordinates.');
        rejectUnexpected(!isNullish(value.lineStart) || !isNullish(value.lineEnd) || hasColumnStart || hasColumnEnd
          || !isNullish(value.timestamp), 'anchorType', 'A PDF anchor cannot include code or video positions.');
        break;
      case CommentAnchorType.CODE_RANGE:
        rejectUnexpected(isNullish(value.lineStart) || isNullish(value.lineEnd), 'lineStart', 'Code feedback requires a line range.');
        rejectUnexpected(hasX || hasY || !isNullish(value.pageNumber) || !isNullish(value.timestamp),
          'anchorType', 'A code anchor cannot include visual or video positions.');
        break;
      case CommentAnchorType.VIDEO_POINT:
        rejectUnexpected(isNullish(value.timestamp), 'timestamp', 'Video feedback requires a timestamp.');
        rejectUnexpected(!isNullish(value.pageNumber) || !isNullish(value.lineStart) || !isNullish(value.lineEnd)
          || hasColumnStart || hasColumnEnd, 'anchorType', 'A video anchor cannot include document or code positions.');
        break;
    }
  });

const updateCommentSchema = z.object({
  text: z.string().trim().max(5_000),
}).strict();

const resolveCommentSchema = z.object({ isResolved: z.boolean() }).strict();

function assertAnchorMatchesAsset(
  anchorType: CommentAnchorType,
  asset: { mimeType: string; previewMimeType: string | null; durationSeconds: number | null },
  timestamp: number | null,
): void {
  const reviewMimeType = asset.previewMimeType ?? asset.mimeType;
  if (anchorType === CommentAnchorType.PDF_POINT && reviewMimeType !== 'application/pdf') {
    throw new AppError({ statusCode: 400, code: 'INVALID_PDF_ANCHOR', message: 'PDF feedback can only be attached to a PDF preview.' });
  }
  if (anchorType === CommentAnchorType.CODE_RANGE && reviewMimeType !== 'text/plain' && reviewMimeType !== 'application/json') {
    throw new AppError({ statusCode: 400, code: 'INVALID_CODE_ANCHOR', message: 'Code ranges can only be attached to a text preview.' });
  }
  if (anchorType === CommentAnchorType.VIDEO_POINT && !reviewMimeType.startsWith('video/')) {
    throw new AppError({ statusCode: 400, code: 'INVALID_VIDEO_ANCHOR', message: 'Video feedback can only be attached to a video preview.' });
  }
  if (
    anchorType === CommentAnchorType.VIDEO_POINT
    && timestamp !== null
    && asset.durationSeconds !== null
    && timestamp > asset.durationSeconds + 0.5
  ) {
    throw new AppError({ statusCode: 400, code: 'VIDEO_TIMESTAMP_OUT_OF_RANGE', message: 'The feedback timestamp is outside the video duration.' });
  }
}

async function findNestedComment(projectId: string, assetId: string, commentId: string) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, assetId, isDeleted: false, asset: { projectId } },
    select: commentDatabaseSelect,
  });
  if (!comment) throw new NotFoundError('Comment not found.');
  return comment;
}

router.get('/', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId } = assetParamsSchema.parse(request.params);
  const query = cursorPageQuerySchema.parse(request.query);
  await requireProjectAccess(projectId, user.id);
  const asset = await prisma.asset.findFirst({ where: { id: assetId, projectId }, select: { id: true } });
  if (!asset) throw new NotFoundError('Asset not found.');

  const page = await loadCommentPage(assetId, query.cursor, query.limit);
  disableResponseCaching(response);
  response.status(200).json(page);
});

router.post('/', requireAuth, commentLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId } = assetParamsSchema.parse(request.params);
  const input = createCommentSchema.parse(request.body);

  const reservation = input.audioKey
    ? await requireActiveUploadReservation(input.audioKey, projectId, user.id, UploadKind.VOICE_NOTE)
    : null;

  if (reservation) {
    try {
      await verifyUploadedObject(reservation.storageKey, reservation.mimeType, reservation.fileSize);
      await inspectVoiceNote(reservation.storageKey, reservation.mimeType, reservation.fileSize);
    } catch (error) {
      if (error instanceof UnsafeFileError || error instanceof ConflictError) {
        await queueStorageDeletion([reservation.storageKey]);
        await prisma.uploadReservation.deleteMany({ where: { id: reservation.id, consumedAt: null } });
        throw new AppError({
          statusCode: 422,
          code: 'VOICE_NOTE_REJECTED',
          message: error.message,
          clientMessage: 'The voice note failed security verification. Record it again and retry.',
        });
      }
      throw error;
    }
  }

  const created = await runSerializableTransaction(async (transaction) => {
    const access = await requireProjectAccess(projectId, user.id, transaction);
    assertProjectContentMutable(access);
    const asset = await transaction.asset.findFirst({
      where: { id: assetId, projectId },
      select: {
        id: true,
        mimeType: true,
        previewMimeType: true,
        durationSeconds: true,
        processingStatus: true,
      },
    });
    if (!asset) throw new NotFoundError('Asset not found.');
    if (asset.processingStatus !== AssetProcessingStatus.CLEAN) {
      throw new ConflictError('Feedback can be added after the safe review preview is ready.');
    }
    assertAnchorMatchesAsset(input.anchorType, asset, input.timestamp ?? null);
    await requireCommentCapacity(transaction, projectId, access.ownerId);

    if (reservation) {
      const active = await transaction.uploadReservation.findFirst({
        where: {
          id: reservation.id,
          storageKey: reservation.storageKey,
          projectId,
          userId: user.id,
          kind: UploadKind.VOICE_NOTE,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!active) throw new ConflictError('This voice-note upload was already used or expired.');
      await requireStorageCapacity(transaction, access.ownerId, reservation.fileSize);
    }

    const comment = await transaction.comment.create({
      data: {
        assetId,
        authorId: user.id,
        text: input.text,
        anchorType: input.anchorType,
        xPos: input.xPos ?? null,
        yPos: input.yPos ?? null,
        pageNumber: input.pageNumber ?? null,
        lineStart: input.lineStart ?? null,
        lineEnd: input.lineEnd ?? null,
        columnStart: input.columnStart ?? null,
        columnEnd: input.columnEnd ?? null,
        audioKey: reservation?.storageKey ?? null,
        audioMimeType: reservation?.mimeType ?? null,
        audioFileSize: reservation?.fileSize ?? null,
        timestamp: input.timestamp ?? null,
        isBlocking: access.isOwner ? false : (input.isBlocking ?? true),
      },
      select: commentDatabaseSelect,
    });

    if (reservation) {
      await consumeUploadReservation(transaction, reservation.id);
      await addStorageUsage(transaction, access.ownerId, reservation.fileSize);
    }

    await recordActivity({
      projectId,
      userId: user.id,
      action: ActivityAction.COMMENT_ADDED,
      message: 'Feedback added.',
      metadata: {
        assetId,
        commentId: comment.id,
        anchorType: comment.anchorType,
        hasVoiceNote: Boolean(comment.audioKey),
        isBlocking: comment.isBlocking,
      },
    }, transaction);
    await notifyProjectParticipants(projectId, user.id, {
      type: NotificationType.COMMENT_ADDED,
      title: 'New feedback',
      body: `${user.name ?? 'A collaborator'} added feedback to a project file.`,
      href: `/project/${projectId}?asset=${assetId}&comment=${comment.id}`,
      traceparent: response.locals.traceparent,
    }, transaction);
    await transaction.project.update({ where: { id: projectId }, data: { updatedAt: new Date() }, select: { id: true } });
    return serializeComment(comment);
  });

  emitWorkspaceRefresh(request, projectId, 'comment-added');
  disableResponseCaching(response);
  response.status(201).json(created);
});

router.get('/:commentId/audio', requireAuth, secureUrlLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId, commentId } = commentParamsSchema.parse(request.params);
  await requireProjectAccess(projectId, user.id);
  const comment = await findNestedComment(projectId, assetId, commentId);
  if (!comment.audioKey || !storageKeyBelongsToProject(comment.audioKey, projectId, 'voice-notes')) {
    throw new NotFoundError('Voice note not found.');
  }

  disableResponseCaching(response);
  response.status(200).json({
    url: `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/comments/${encodeURIComponent(commentId)}/audio/stream`,
    mimeType: comment.audioMimeType,
    expiresInSeconds: 300,
  });
});

router.get('/:commentId/audio/stream', requireAuth, secureUrlLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId, commentId } = commentParamsSchema.parse(request.params);
  await requireProjectAccess(projectId, user.id);
  const comment = await findNestedComment(projectId, assetId, commentId);
  if (!comment.audioKey || !storageKeyBelongsToProject(comment.audioKey, projectId, 'voice-notes')) {
    throw new NotFoundError('Voice note not found.');
  }

  await streamPrivateObject(response, {
    storageKey: comment.audioKey,
    rangeHeader: request.headers.range,
    fallbackMimeType: comment.audioMimeType,
  });
});

router.put('/:commentId', requireAuth, commentLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId, commentId } = commentParamsSchema.parse(request.params);
  const input = updateCommentSchema.parse(request.body);

  const result = await runSerializableTransaction(async (transaction) => {
    const access = await requireProjectAccess(projectId, user.id, transaction);
    assertProjectContentMutable(access);
    const comment = await transaction.comment.findFirst({
      where: { id: commentId, assetId, isDeleted: false, asset: { projectId } },
      select: commentDatabaseSelect,
    });
    if (!comment) throw new NotFoundError('Comment not found.');
    if (comment.authorId !== user.id) throw new AuthorizationError('You can only edit your own feedback.');
    if (!input.text && !comment.audioKey) {
      throw new AppError({ statusCode: 400, code: 'EMPTY_COMMENT', message: 'A comment must contain text or a voice note.' });
    }
    if (input.text === comment.text) return { comment: serializeComment(comment), changed: false };

    await transaction.commentRevision.create({
      data: {
        commentId: comment.id,
        editorId: user.id,
        previousText: comment.text,
        newText: input.text,
      },
      select: { id: true },
    });
    const updated = await transaction.comment.update({
      where: { id: comment.id },
      data: {
        text: input.text,
        editedAt: new Date(),
        ...(comment.isResolved ? { isResolved: false } : {}),
      },
      select: commentDatabaseSelect,
    });
    await recordActivity({
      projectId,
      userId: user.id,
      action: ActivityAction.COMMENT_EDITED,
      message: comment.isResolved ? 'Feedback edited and reopened.' : 'Feedback edited.',
      metadata: { assetId, commentId, reopened: comment.isResolved },
    }, transaction);
    await transaction.project.update({ where: { id: projectId }, data: { updatedAt: new Date() }, select: { id: true } });
    return { comment: serializeComment(updated), changed: true };
  });

  if (result.changed) emitWorkspaceRefresh(request, projectId, 'comment-updated');
  disableResponseCaching(response);
  response.status(200).json(result.comment);
});

router.patch('/:commentId/resolve', requireAuth, commentLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId, commentId } = commentParamsSchema.parse(request.params);
  const input = resolveCommentSchema.parse(request.body);

  const changed = await runSerializableTransaction(async (transaction) => {
    const access = await requireProjectAccess(projectId, user.id, transaction);
    assertProjectContentMutable(access);
    if (!access.isOwner) throw new AuthorizationError('Only the Designer can resolve feedback.');

    const comment = await transaction.comment.findFirst({
      where: { id: commentId, assetId, isDeleted: false, asset: { projectId } },
      select: { id: true, isResolved: true },
    });
    if (!comment) throw new NotFoundError('Comment not found.');
    if (comment.isResolved === input.isResolved) return false;

    const updated = await transaction.comment.updateMany({
      where: { id: comment.id, isResolved: comment.isResolved, isDeleted: false },
      data: { isResolved: input.isResolved },
    });
    if (updated.count !== 1) throw new ConflictError('The feedback changed in another session. Refresh and try again.');
    await recordActivity({
      projectId,
      userId: user.id,
      action: input.isResolved ? ActivityAction.COMMENT_RESOLVED : ActivityAction.COMMENT_REOPENED,
      message: input.isResolved ? 'Feedback resolved.' : 'Feedback reopened.',
      metadata: { assetId, commentId },
    }, transaction);
    await notifyProjectParticipants(projectId, user.id, {
      type: NotificationType.COMMENT_RESOLVED,
      title: input.isResolved ? 'Feedback resolved' : 'Feedback reopened',
      body: input.isResolved ? 'The Designer marked feedback as resolved.' : 'The Designer reopened feedback.',
      href: `/project/${projectId}?asset=${assetId}&comment=${commentId}`,
      traceparent: response.locals.traceparent,
    }, transaction);
    await transaction.project.update({ where: { id: projectId }, data: { updatedAt: new Date() }, select: { id: true } });
    return true;
  });

  if (changed) emitWorkspaceRefresh(request, projectId, 'comment-resolution-changed');
  disableResponseCaching(response);
  response.status(200).json({
    message: changed ? 'Feedback status updated.' : 'Feedback status was unchanged.',
    isResolved: input.isResolved,
  });
});

router.delete('/:commentId', requireAuth, commentLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId, commentId } = commentParamsSchema.parse(request.params);

  await runSerializableTransaction(async (transaction) => {
    const access = await requireProjectAccess(projectId, user.id, transaction);
    assertProjectContentMutable(access);
    const comment = await transaction.comment.findFirst({
      where: { id: commentId, assetId, isDeleted: false, asset: { projectId } },
      select: { id: true, authorId: true, audioKey: true, audioFileSize: true },
    });
    if (!comment) throw new NotFoundError('Comment not found.');
    if (comment.authorId !== user.id) {
      throw new AuthorizationError('Feedback can only be deleted by its author. The Designer can resolve Client feedback instead.');
    }

    if (comment.audioKey) await queueStorageDeletion([comment.audioKey], transaction);
    if (comment.audioFileSize) await removeStorageUsage(transaction, access.ownerId, comment.audioFileSize);
    const deleted = await transaction.comment.updateMany({
      where: { id: comment.id, isDeleted: false },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        audioKey: null,
        audioMimeType: null,
        audioFileSize: null,
      },
    });
    if (deleted.count !== 1) throw new ConflictError('The feedback changed in another session. Refresh and try again.');
    await recordActivity({
      projectId,
      userId: user.id,
      action: ActivityAction.COMMENT_DELETED,
      message: 'Feedback removed by its author. The audit record was preserved.',
      metadata: { assetId, commentId },
    }, transaction);
    await transaction.project.update({ where: { id: projectId }, data: { updatedAt: new Date() }, select: { id: true } });
  });

  emitWorkspaceRefresh(request, projectId, 'comment-deleted');
  disableResponseCaching(response);
  response.status(202).json({ message: 'Feedback removed. Its audit history was preserved.' });
});

export default router;
