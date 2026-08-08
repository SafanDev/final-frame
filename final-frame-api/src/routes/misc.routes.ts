import { createHash } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AppError, ConflictError, NotFoundError } from '../errors/app-error.js';
import { AssetProcessingStatus, ProjectDeletionStatus } from '../generated/prisma/enums.js';
import { getAuthenticatedUser, requireAuth, type AuthRequest } from '../middleware/auth.js';
import { secureUrlLimiter } from '../middleware/rate-limit.js';
import { currentDocumentTrust, verifySignedDocument } from '../services/document-integrity.js';
import { assertCanDownloadOriginal } from '../services/project-access.js';
import { disableResponseCaching } from '../utils/http.js';
import { streamPrivateObject } from '../utils/private-media.js';

const router = Router();

const PREVIEW_CACHE_CONTROL = 'private, max-age=30, must-revalidate';

function previewEntityTag(previewKey: string): string {
  const digest = createHash('sha256').update(previewKey).digest('base64url').slice(0, 32);
  return `"ff-${digest}"`;
}

function requestAcceptsEntityTag(value: string | string[] | undefined, entityTag: string): boolean {
  if (!value) return false;
  const raw = Array.isArray(value) ? value.join(',') : value;
  return raw.split(',').some((candidate) => {
    const normalized = candidate.trim();
    return normalized === '*' || normalized === entityTag || normalized === `W/${entityTag}`;
  });
}

function setPrivatePreviewCacheHeaders(response: Response, entityTag: string): void {
  response.setHeader('Cache-Control', PREVIEW_CACHE_CONTROL);
  response.setHeader('ETag', entityTag);
  response.vary('Cookie');
  response.vary('Authorization');
}

async function loadAccessibleMediaAsset(assetId: string, userId: string) {
  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      project: {
        deletionStatus: ProjectDeletionStatus.ACTIVE,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    },
    select: {
      id: true,
      projectId: true,
      storageKey: true,
      previewKey: true,
      fileName: true,
      mimeType: true,
      previewMimeType: true,
      processingStatus: true,
      processingError: true,
      project: {
        select: {
          ownerId: true,
          status: true,
          deletionStatus: true,
          isArchived: true,
          isDownloadUnlocked: true,
          members: {
            where: { userId },
            take: 1,
            select: { isApprover: true },
          },
        },
      },
    },
  });
  if (!asset) throw new NotFoundError('Asset not found.');
  const membership = asset.project.members[0];
  return {
    ...asset,
    access: {
      id: asset.projectId,
      ownerId: asset.project.ownerId,
      status: asset.project.status,
      deletionStatus: asset.project.deletionStatus,
      isArchived: asset.project.isArchived,
      isDownloadUnlocked: asset.project.isDownloadUnlocked,
      isOwner: asset.project.ownerId === userId,
      isApprover: membership?.isApprover ?? false,
    },
  };
}

const secureUrlSchema = z.object({
  assetId: z.string().cuid('Invalid asset ID.'),
  purpose: z.enum(['preview', 'download']).optional().default('preview'),
}).strict();

const mediaAssetSchema = z.object({
  assetId: z.string().cuid('Invalid asset ID.'),
  purpose: z.enum(['preview', 'download']),
}).strict();


const signedDocumentSchema = z.object({
  schema: z.string().trim().min(1).max(120),
  keyId: z.string().trim().min(1).max(80),
  algorithm: z.literal('Ed25519'),
  publicKey: z.object({
    kty: z.literal('OKP'),
    crv: z.literal('Ed25519'),
    x: z.string().trim().min(40).max(100),
  }).strict(),
  payload: z.unknown(),
  digest: z.string().regex(/^[a-f0-9]{64}$/i),
  signature: z.string().regex(/^[A-Za-z0-9_-]{80,120}$/),
}).strict();


router.get(
  '/certificates/trust',
  secureUrlLimiter,
  (_request, response): void => {
    disableResponseCaching(response);
    response.status(200).json(currentDocumentTrust());
  },
);

router.post(
  '/certificates/verify',
  secureUrlLimiter,
  (request, response): void => {
    const document = signedDocumentSchema.parse(request.body);
    disableResponseCaching(response);
    response.status(200).json({
      valid: verifySignedDocument(document),
      schema: document.schema,
      keyId: document.keyId,
      digest: document.digest,
    });
  },
);

/**
 * Compatibility endpoint used by the web signed-URL cache. Preview requests can
 * only resolve the generated review derivative; the original object is never
 * returned unless the caller explicitly requests a permitted download.
 */
router.post(
  '/secure-url',
  requireAuth,
  secureUrlLimiter,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const input = secureUrlSchema.parse(request.body);

    const asset = await loadAccessibleMediaAsset(input.assetId, user.id);

    if (input.purpose === 'download') {
      assertCanDownloadOriginal(asset.access);
      if (asset.processingStatus !== AssetProcessingStatus.CLEAN) {
        throw new ConflictError('The original cannot be downloaded until security verification is complete.');
      }
    } else {
      if (asset.processingStatus === AssetProcessingStatus.REJECTED) {
        throw new AppError({
          statusCode: 422,
          code: 'ASSET_REJECTED',
          message: asset.processingError ?? 'This file failed security verification.',
          clientMessage: 'This file could not be prepared for safe review.',
        });
      }
      if (asset.processingStatus !== AssetProcessingStatus.CLEAN || !asset.previewKey) {
        throw new AppError({
          statusCode: 409,
          code: 'ASSET_PROCESSING',
          message: 'The review derivative is not ready.',
          clientMessage: 'The secure preview is still being prepared.',
        });
      }
    }

    disableResponseCaching(response);
    response.status(200).json({
      url: `/api/media/assets/${encodeURIComponent(asset.id)}/${input.purpose}`,
      purpose: input.purpose,
      expiresInSeconds: env.R2_VIEW_URL_TTL_SECONDS,
    });
  },
);

router.get(
  '/media/assets/:assetId/:purpose',
  requireAuth,
  secureUrlLimiter,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const input = mediaAssetSchema.parse(request.params);
    const asset = await loadAccessibleMediaAsset(input.assetId, user.id);

    if (input.purpose === 'download') {
      assertCanDownloadOriginal(asset.access);
      if (asset.processingStatus !== AssetProcessingStatus.CLEAN) {
        throw new ConflictError('The original cannot be downloaded until security verification is complete.');
      }
      await streamPrivateObject(response, {
        storageKey: asset.storageKey,
        rangeHeader: request.headers.range,
        downloadFileName: asset.fileName,
        fallbackMimeType: asset.mimeType,
      });
      return;
    }

    if (asset.processingStatus === AssetProcessingStatus.REJECTED) {
      throw new AppError({
        statusCode: 422,
        code: 'ASSET_REJECTED',
        message: asset.processingError ?? 'This file failed security verification.',
        clientMessage: 'This file could not be prepared for safe review.',
      });
    }
    if (asset.processingStatus !== AssetProcessingStatus.CLEAN || !asset.previewKey) {
      throw new AppError({
        statusCode: 409,
        code: 'ASSET_PROCESSING',
        message: 'The review derivative is not ready.',
        clientMessage: 'The secure preview is still being prepared.',
      });
    }

    const entityTag = previewEntityTag(asset.previewKey);
    setPrivatePreviewCacheHeaders(response, entityTag);
    if (!request.headers.range && requestAcceptsEntityTag(request.headers['if-none-match'], entityTag)) {
      response.status(304).end();
      return;
    }

    await streamPrivateObject(response, {
      storageKey: asset.previewKey,
      rangeHeader: request.headers.range,
      fallbackMimeType: asset.previewMimeType,
      cacheControl: PREVIEW_CACHE_CONTROL,
      entityTag,
    });
  },
);

export default router;
