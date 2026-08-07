import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import {
  ActivityAction,
  AssetProcessingStatus,
  ProjectDeletionStatus,
  UploadKind,
} from '../generated/prisma/enums.js';
import { env } from '../config/env.js';
import {
  normalizeFileName,
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
import { aiLimiter, uploadLimiter } from '../middleware/rate-limit.js';
import { generateFeedbackSummary } from '../services/ai-summary.js';
import { getAssetsStorageFootprint } from '../services/asset-storage-footprint.js';
import { recordActivity } from '../services/activity.js';
import {
  assertCanDownloadOriginal,
  assertDesignerAssetMutable,
  assertProjectContentMutable,
  requireProjectAccess,
} from '../services/project-access.js';
import {
  addStorageUsage,
  refundAiRequest,
  removeStorageUsage,
  requireStorageCapacity,
  requireUploadReservationCapacity,
  reserveAiRequest,
} from '../services/quotas.js';
import { emitWorkspaceRefresh } from '../services/realtime.js';
import { queueStorageDeletion } from '../services/storage-cleanup.js';
import { runSerializableTransaction } from '../services/transaction.js';
import {
  abortUploadReservation,
  abortUploadReservationById,
  assertReservationMetadata,
  buildMultipartUploadPlan,
  completeMultipartReservation,
  consumeUploadReservation,
  createUploadReservationRecord,
  requireActiveUploadReservation,
  signUploadReservation,
} from '../services/upload-reservations.js';
import { assetPublicSelect, loadAssetPage } from '../services/workspace-data.js';
import { cursorPageQuerySchema } from '../utils/pagination.js';
import { disableResponseCaching } from '../utils/http.js';
import commentRoutes from './comment.routes.js';

const router = Router({ mergeParams: true });
const cuid = z.string().cuid('Invalid identifier.');
const expectedVersion = z.number().int().positive();

const projectParamsSchema = z.object({ projectId: cuid }).strict();
const assetParamsSchema = z.object({ projectId: cuid, assetId: cuid }).strict();

const uploadStartSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(120),
  fileSize: z.number().int().positive().max(2_147_483_647),
  expectedVersion,
}).strict();

const uploadCompleteSchema = z.object({
  storageKey: z.string().trim().min(1).max(1_024),
  originalFileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(120),
  fileSize: z.number().int().positive().max(2_147_483_647),
  expectedVersion,
}).strict();

const audioUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255).optional().default('voice-note.webm'),
  fileType: z.enum(['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav']).optional().default('audio/webm'),
  fileSize: z.number().int().positive().max(env.MAX_AUDIO_UPLOAD_BYTES),
}).strict();

const multipartReservationSchema = z.object({
  storageKey: z.string().trim().min(1).max(1_024),
}).strict();

const renameAssetSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  expectedVersion,
}).strict();

const deleteAssetSchema = z.object({
  scope: z.enum(['version', 'stack']).optional().default('version'),
  expectedVersion,
}).strict();

const retryAssetSchema = z.object({ expectedVersion }).strict();

const normalizeStackName = (fileName: string): string =>
  normalizeFileName(fileName).normalize('NFKC').toLocaleLowerCase('en-US');

const assertVersion = (current: number, supplied: number): void => {
  if (current !== supplied) {
    throw new ConflictError('The project changed in another session. Refresh and try again.');
  }
};

async function incrementProjectVersion(
  transaction: Prisma.TransactionClient,
  projectId: string,
  currentVersion: number,
): Promise<number> {
  const result = await transaction.project.updateMany({
    where: {
      id: projectId,
      version: currentVersion,
      deletionStatus: ProjectDeletionStatus.ACTIVE,
    },
    data: { version: { increment: 1 }, updatedAt: new Date() },
  });
  if (result.count !== 1) {
    throw new ConflictError('The project changed in another session. Refresh and try again.');
  }
  return currentVersion + 1;
}

const projectMutationSelect = {
  id: true,
  ownerId: true,
  status: true,
  deletionStatus: true,
  isArchived: true,
  isDownloadUnlocked: true,
  version: true,
} as const;

const getNestedAsset = async (projectId: string, assetId: string) => {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, projectId },
    select: {
      ...assetPublicSelect,
      storageKey: true,
      previewKey: true,
      sha256: true,
    },
  });
  if (!asset) throw new NotFoundError('Asset not found.');
  return asset;
};

const startAssetUpload = async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId } = projectParamsSchema.parse(request.params);
  const input = uploadStartSchema.parse(request.body);

  const reservation = await runSerializableTransaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, ownerId: user.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
      select: projectMutationSelect,
    });
    if (!project) throw new NotFoundError('Project not found.');
    assertVersion(project.version, input.expectedVersion);
    assertDesignerAssetMutable({ ...project, isOwner: true, isApprover: false });
    await requireUploadReservationCapacity(transaction, project.ownerId, input.fileSize);
    return createUploadReservationRecord(transaction, {
      projectId,
      userId: user.id,
      kind: UploadKind.ASSET,
      originalFileName: input.fileName,
      mimeType: input.fileType,
      fileSize: input.fileSize,
    });
  });

  try {
    const signed = await signUploadReservation(reservation);
    disableResponseCaching(response);
    response.status(201).json({
      uploadMode: signed.uploadMode,
      ...(signed.uploadMode === 'single' ? {
        uploadUrl: signed.uploadUrl,
        presignedData: signed.uploadUrl,
      } : { multipart: signed.multipart }),
      uploadHeaders: signed.uploadHeaders,
      storageKey: reservation.storageKey,
      fileName: reservation.originalFileName,
      fileType: reservation.mimeType,
      fileSize: reservation.fileSize,
      expiresAt: reservation.expiresAt.toISOString(),
      expiresInSeconds: env.R2_UPLOAD_URL_TTL_SECONDS,
    });
  } catch (error) {
    await abortUploadReservationById(reservation.id).catch(() => undefined);
    throw error;
  }
};

const completeAssetUpload = async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId } = projectParamsSchema.parse(request.params);
  const input = uploadCompleteSchema.parse(request.body);

  const reservation = await requireActiveUploadReservation(
    input.storageKey,
    projectId,
    user.id,
    UploadKind.ASSET,
  );
  assertReservationMetadata(reservation, input.originalFileName, input.fileType, input.fileSize);

  try {
    if (reservation.multipartUploadId) await completeMultipartReservation(reservation);
    await verifyUploadedObject(reservation.storageKey, reservation.mimeType, reservation.fileSize);
  } catch (error) {
    if (error instanceof ConflictError) {
      await queueStorageDeletion([reservation.storageKey]);
      await prisma.uploadReservation.deleteMany({ where: { id: reservation.id, consumedAt: null } });
    }
    throw error;
  }

  const result = await runSerializableTransaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, ownerId: user.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
      select: projectMutationSelect,
    });
    if (!project) throw new NotFoundError('Project not found.');
    assertVersion(project.version, input.expectedVersion);
    assertDesignerAssetMutable({ ...project, isOwner: true, isApprover: false });

    const activeReservation = await transaction.uploadReservation.findFirst({
      where: {
        id: reservation.id,
        storageKey: reservation.storageKey,
        projectId,
        userId: user.id,
        kind: UploadKind.ASSET,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!activeReservation) {
      throw new ConflictError('This upload authorization was already used or expired.');
    }

    await requireStorageCapacity(transaction, project.ownerId, reservation.fileSize);
    const normalizedName = normalizeStackName(reservation.originalFileName);
    const previous = await transaction.asset.findFirst({
      where: { projectId, normalizedName },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { version: true, stackKey: true },
    });

    const created = await transaction.asset.create({
      data: {
        projectId,
        storageKey: reservation.storageKey,
        fileName: reservation.originalFileName,
        normalizedName,
        stackKey: previous?.stackKey ?? randomUUID(),
        mimeType: reservation.mimeType,
        fileSize: reservation.fileSize,
        version: (previous?.version ?? 0) + 1,
        processingStatus: AssetProcessingStatus.PENDING,
      },
      select: assetPublicSelect,
    });

    await consumeUploadReservation(transaction, reservation.id);
    await addStorageUsage(transaction, project.ownerId, reservation.fileSize);
    const projectVersion = await incrementProjectVersion(transaction, projectId, project.version);
    await recordActivity({
      projectId,
      userId: user.id,
      action: ActivityAction.ASSET_UPLOADED,
      message: `Uploaded version ${created.version} of ${created.fileName}.`,
      metadata: {
        assetId: created.id,
        fileName: created.fileName,
        version: created.version,
        mimeType: created.mimeType,
        fileSize: created.fileSize,
        processingStatus: created.processingStatus,
      },
    }, transaction);
    return { asset: created, projectVersion };
  });

  emitWorkspaceRefresh(request, projectId, 'asset-uploaded');
  disableResponseCaching(response);
  response.status(202).json({
    ...result.asset,
    projectVersion: result.projectVersion,
    message: 'Upload received. A safe review preview is being prepared.',
  });
};

router.post('/upload/start', requireAuth, uploadLimiter, startAssetUpload);
router.post('/upload/complete', requireAuth, uploadLimiter, completeAssetUpload);

router.post('/upload/multipart/refresh', requireAuth, uploadLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId } = projectParamsSchema.parse(request.params);
  const input = multipartReservationSchema.parse(request.body);
  const reservation = await requireActiveUploadReservation(input.storageKey, projectId, user.id, UploadKind.ASSET);
  if (!reservation.multipartUploadId) throw new ConflictError('This upload does not use multipart transfer.');
  const multipart = await buildMultipartUploadPlan(reservation);
  disableResponseCaching(response);
  response.status(200).json({ multipart });
});

router.delete('/upload/multipart', requireAuth, uploadLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId } = projectParamsSchema.parse(request.params);
  const input = multipartReservationSchema.parse(request.body);
  const reservation = await requireActiveUploadReservation(input.storageKey, projectId, user.id, UploadKind.ASSET);
  await abortUploadReservation(reservation);
  disableResponseCaching(response);
  response.status(202).json({ message: 'Multipart upload cancelled.' });
});


router.post(
  '/upload-audio',
  requireAuth,
  uploadLimiter,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId } = projectParamsSchema.parse(request.params);
    const input = audioUploadSchema.parse(request.body);

    const reservation = await runSerializableTransaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: {
          id: projectId,
          deletionStatus: ProjectDeletionStatus.ACTIVE,
          OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
        },
        select: {
          ...projectMutationSelect,
          members: { where: { userId: user.id }, select: { isApprover: true } },
        },
      });
      if (!project) throw new NotFoundError('Project not found.');
      assertProjectContentMutable({
        ...project,
        isOwner: project.ownerId === user.id,
        isApprover: project.members[0]?.isApprover ?? false,
      });
      await requireUploadReservationCapacity(transaction, project.ownerId, input.fileSize);
      return createUploadReservationRecord(transaction, {
        projectId,
        userId: user.id,
        kind: UploadKind.VOICE_NOTE,
        originalFileName: input.fileName,
        mimeType: input.fileType,
        fileSize: input.fileSize,
      });
    });

    try {
      const signed = await signUploadReservation(reservation);
      if (signed.uploadMode !== 'single') {
        await abortUploadReservationById(reservation.id).catch(() => undefined);
        throw new ConflictError('Voice notes must use a single-part upload.');
      }
      disableResponseCaching(response);
      response.status(201).json({
        uploadMode: signed.uploadMode,
        uploadUrl: signed.uploadUrl,
        presignedData: signed.uploadUrl,
        uploadHeaders: signed.uploadHeaders,
        storageKey: reservation.storageKey,
        fileType: reservation.mimeType,
        fileSize: reservation.fileSize,
        expiresAt: reservation.expiresAt.toISOString(),
        expiresInSeconds: env.R2_UPLOAD_URL_TTL_SECONDS,
      });
    } catch (error) {
      await abortUploadReservationById(reservation.id).catch(() => undefined);
      throw error;
    }
  },
);

router.get('/', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId } = projectParamsSchema.parse(request.params);
  const query = cursorPageQuerySchema.parse(request.query);
  await requireProjectAccess(projectId, user.id);
  const page = await loadAssetPage(projectId, query.cursor, query.limit, 25);
  disableResponseCaching(response);
  response.status(200).json(page);
});

router.get('/:assetId/preview', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId } = assetParamsSchema.parse(request.params);
  await requireProjectAccess(projectId, user.id);
  const asset = await getNestedAsset(projectId, assetId);
  if (asset.processingStatus !== AssetProcessingStatus.CLEAN || !asset.previewKey) {
    throw new AppError({
      statusCode: asset.processingStatus === AssetProcessingStatus.REJECTED ? 422 : 409,
      code: asset.processingStatus === AssetProcessingStatus.REJECTED ? 'ASSET_REJECTED' : 'ASSET_PROCESSING',
      message: asset.processingError ?? 'The review preview is not ready.',
      clientMessage: asset.processingStatus === AssetProcessingStatus.REJECTED
        ? 'This file could not be prepared for review.'
        : 'The review preview is still being prepared.',
    });
  }
  disableResponseCaching(response);
  response.status(200).json({
    previewUrl: `/api/media/assets/${encodeURIComponent(asset.id)}/preview`,
    url: `/api/media/assets/${encodeURIComponent(asset.id)}/preview`,
    mimeType: asset.previewMimeType,
    expiresInSeconds: env.R2_VIEW_URL_TTL_SECONDS,
  });
});

router.get('/:assetId/download', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId } = assetParamsSchema.parse(request.params);
  const project = await requireProjectAccess(projectId, user.id);
  assertCanDownloadOriginal(project);
  const asset = await getNestedAsset(projectId, assetId);
  if (asset.processingStatus !== AssetProcessingStatus.CLEAN) {
    throw new ConflictError('The original cannot be downloaded until file verification is complete.');
  }
  disableResponseCaching(response);
  response.status(200).json({
    downloadUrl: `/api/media/assets/${encodeURIComponent(asset.id)}/download`,
    expiresInSeconds: env.R2_VIEW_URL_TTL_SECONDS,
  });
});

router.post('/:assetId/summary', requireAuth, aiLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId } = assetParamsSchema.parse(request.params);
  const project = await requireProjectAccess(projectId, user.id);
  if (!project.isOwner) throw new AuthorizationError('Only the Designer can generate an AI feedback brief.');
  const asset = await getNestedAsset(projectId, assetId);
  if (asset.processingStatus !== AssetProcessingStatus.CLEAN) {
    throw new ConflictError('Wait for file verification before generating a feedback brief.');
  }

  const settings = await prisma.project.findUnique({
    where: { id: projectId },
    select: { aiEnabled: true },
  });
  if (!settings?.aiEnabled) {
    throw new AppError({
      statusCode: 403,
      code: 'AI_NOT_ENABLED',
      message: 'AI processing is not enabled for this project.',
      clientMessage: 'Enable AI processing in project settings before generating a brief.',
    });
  }

  const feedback: string[] = [];
  let totalCharacters = 0;
  let cursor: string | undefined;
  while (totalCharacters < env.OPENROUTER_MAX_INPUT_CHARS) {
    const comments = await prisma.comment.findMany({
      where: { assetId, isDeleted: false, text: { not: '' } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, text: true },
    });
    for (const comment of comments) {
      const normalized = comment.text.trim();
      if (!normalized) continue;
      const remaining = env.OPENROUTER_MAX_INPUT_CHARS - totalCharacters;
      feedback.push(normalized.slice(0, remaining));
      totalCharacters += Math.min(normalized.length, remaining) + 1;
      if (totalCharacters >= env.OPENROUTER_MAX_INPUT_CHARS) break;
    }
    if (comments.length < 100 || totalCharacters >= env.OPENROUTER_MAX_INPUT_CHARS) break;
    cursor = comments.at(-1)?.id;
    if (!cursor) break;
  }
  if (!feedback.length) {
    throw new AppError({
      statusCode: 400,
      code: 'NO_FEEDBACK_TO_SUMMARIZE',
      message: 'No written feedback exists for this asset.',
      clientMessage: 'Add written feedback before generating a brief.',
    });
  }

  let reserved = false;
  try {
    await runSerializableTransaction(async (transaction) => {
      await reserveAiRequest(transaction, project.ownerId);
    });
    reserved = true;
    const summary = await generateFeedbackSummary(
      feedback.join('\n'),
      typeof response.locals.traceparent === 'string' ? response.locals.traceparent : undefined,
    );
    disableResponseCaching(response);
    response.status(200).json({ summary });
  } catch (error) {
    if (reserved) {
      try {
        await runSerializableTransaction((transaction) => refundAiRequest(transaction, project.ownerId));
      } catch {
        // A reconciliation task can repair this exceptionally rare accounting failure.
      }
    }
    throw error;
  }
});

router.put('/:assetId', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId } = assetParamsSchema.parse(request.params);
  const input = renameAssetSchema.parse(request.body);
  const fileName = normalizeFileName(input.fileName);
  const normalizedName = normalizeStackName(fileName);

  const result = await runSerializableTransaction(async (transaction) => {
    const selected = await transaction.asset.findFirst({
      where: { id: assetId, projectId },
      select: {
        id: true,
        fileName: true,
        normalizedName: true,
        stackKey: true,
        project: { select: projectMutationSelect },
      },
    });
    if (!selected || selected.project.ownerId !== user.id) throw new NotFoundError('Asset not found.');
    assertVersion(selected.project.version, input.expectedVersion);
    assertDesignerAssetMutable({ ...selected.project, isOwner: true, isApprover: false });
    if (selected.fileName === fileName) {
      return { changed: false, fileName, versionsRenamed: 0, projectVersion: selected.project.version };
    }

    const collision = await transaction.asset.findFirst({
      where: { projectId, normalizedName, stackKey: { not: selected.stackKey } },
      select: { id: true },
    });
    if (collision) throw new ConflictError('Another file stack already uses that name.');

    const update = await transaction.asset.updateMany({
      where: { projectId, stackKey: selected.stackKey },
      data: { fileName, normalizedName },
    });
    const projectVersion = await incrementProjectVersion(transaction, projectId, selected.project.version);
    await recordActivity({
      projectId,
      userId: user.id,
      action: ActivityAction.ASSET_RENAMED,
      message: `Renamed file stack to ${fileName}.`,
      metadata: {
        previousFileName: selected.fileName,
        fileName,
        versionsRenamed: update.count,
      },
    }, transaction);
    return { changed: true, fileName, versionsRenamed: update.count, projectVersion };
  });

  if (result.changed) emitWorkspaceRefresh(request, projectId, 'asset-renamed');
  disableResponseCaching(response);
  response.status(200).json(result);
});

router.post('/:assetId/retry-processing', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId } = assetParamsSchema.parse(request.params);
  const input = retryAssetSchema.parse(request.body);

  const projectVersion = await runSerializableTransaction(async (transaction) => {
    const asset = await transaction.asset.findFirst({
      where: { id: assetId, projectId },
      select: {
        id: true,
        storageKey: true,
        processingStatus: true,
        originalRetiredAt: true,
        project: { select: projectMutationSelect },
      },
    });
    if (!asset || asset.project.ownerId !== user.id) throw new NotFoundError('Asset not found.');
    assertVersion(asset.project.version, input.expectedVersion);
    assertDesignerAssetMutable({ ...asset.project, isOwner: true, isApprover: false });
    if (asset.processingStatus !== AssetProcessingStatus.REJECTED) {
      throw new ConflictError('Only a failed processing job can be retried.');
    }
    const originalQueuedForDeletion = asset.originalRetiredAt
      || await transaction.storageDeletionTask.findUnique({
        where: { objectKey: asset.storageKey },
        select: { id: true },
      });
    if (originalQueuedForDeletion) {
      throw new ConflictError('This file failed security verification and must be uploaded again.');
    }
    const reset = await transaction.asset.updateMany({
      where: { id: asset.id, processingStatus: AssetProcessingStatus.REJECTED },
      data: { processingStatus: AssetProcessingStatus.PENDING, processingError: null, processingStartedAt: null },
    });
    if (reset.count !== 1) throw new ConflictError('The file processing state changed. Refresh and try again.');
    return incrementProjectVersion(transaction, projectId, asset.project.version);
  });

  emitWorkspaceRefresh(request, projectId, 'asset-processing-retried');
  disableResponseCaching(response);
  response.status(202).json({ message: 'File processing was queued again.', projectVersion });
});

router.delete('/:assetId', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const { projectId, assetId } = assetParamsSchema.parse(request.params);
  const input = deleteAssetSchema.parse({
    ...(request.query && typeof request.query === 'object' ? request.query : {}),
    ...(request.body && typeof request.body === 'object' ? request.body : {}),
  });

  const result = await runSerializableTransaction(async (transaction) => {
    const selected = await transaction.asset.findFirst({
      where: { id: assetId, projectId },
      select: {
        id: true,
        fileName: true,
        stackKey: true,
        version: true,
        project: { select: { ...projectMutationSelect, finalAssetId: true } },
      },
    });
    if (!selected || selected.project.ownerId !== user.id) throw new NotFoundError('Asset not found.');
    assertVersion(selected.project.version, input.expectedVersion);
    assertDesignerAssetMutable({ ...selected.project, isOwner: true, isApprover: false });

    const assets = await transaction.asset.findMany({
      where: input.scope === 'stack' ? { projectId, stackKey: selected.stackKey } : { id: selected.id },
      select: {
        id: true,
        storageKey: true,
        previewKey: true,
        fileSize: true,
        previewFileSize: true,
        originalRetiredAt: true,
        comments: {
          where: { audioKey: { not: null } },
          select: { audioKey: true, audioFileSize: true },
        },
      },
    });
    if (!assets.length) throw new NotFoundError('Asset not found.');

    const footprint = getAssetsStorageFootprint(assets);
    await queueStorageDeletion(footprint.objectKeys, transaction);

    const ids = assets.map((asset) => asset.id);
    if (selected.project.finalAssetId && ids.includes(selected.project.finalAssetId)) {
      await transaction.project.update({
        where: { id: projectId },
        data: { finalAssetId: null },
        select: { id: true },
      });
    }
    const deletion = await transaction.asset.deleteMany({ where: { id: { in: ids } } });
    await removeStorageUsage(transaction, selected.project.ownerId, footprint.accountedBytes);
    const projectVersion = await incrementProjectVersion(transaction, projectId, selected.project.version);
    await recordActivity({
      projectId,
      userId: user.id,
      action: ActivityAction.ASSET_DELETED,
      message: input.scope === 'stack'
        ? `Deleted file stack ${selected.fileName}.`
        : `Deleted version ${selected.version} of ${selected.fileName}.`,
      metadata: {
        fileName: selected.fileName,
        version: selected.version,
        scope: input.scope,
        versionsDeleted: deletion.count,
      },
    }, transaction);
    return { versionsDeleted: deletion.count, projectVersion };
  });

  emitWorkspaceRefresh(request, projectId, 'asset-deleted');
  disableResponseCaching(response);
  response.status(202).json({
    ...result,
    message: input.scope === 'stack'
      ? 'File stack deleted. Private storage cleanup is queued.'
      : 'File version deleted. Private storage cleanup is queued.',
  });
});

router.use('/:assetId/comments', commentRoutes);

export default router;
