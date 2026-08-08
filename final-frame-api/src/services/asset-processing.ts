import { execFile } from 'node:child_process';
import { mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { prisma } from '../config/prisma.js';
import {
  createPreviewStorageKey,
  downloadStorageObjectToFileWithSha256,
  uploadStorageFile,
} from '../config/storage.js';
import { env } from '../config/env.js';
import { ActivityAction, AssetProcessingStatus, ProjectDeletionStatus } from '../generated/prisma/enums.js';
import { recordActivity } from './activity.js';
import { UnsafeFileError } from '../errors/unsafe-file-error.js';
import { assertFileIsMalwareFree, assertFileSignature } from './file-inspection.js';
import { assertPdfPageLimit, assertVisualMediaLimits } from './media-safety.js';
import { consumeStorageCapacity, removeStorageUsage } from './quotas.js';
import { queueStorageDeletion } from './storage-cleanup.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const PROCESSING_LOCK_TIMEOUT_MS = env.ASSET_PROCESSING_STALE_MS;

class AssetProcessingDependencyError extends Error {
  constructor(
    readonly tool: string,
    cause: unknown,
  ) {
    super(`Required media-processing tool is unavailable: ${tool}.`, { cause });
    this.name = 'AssetProcessingDependencyError';
  }
}

const processingCommands = {
  ffmpeg: env.ASSET_FFMPEG_PATH ?? 'ffmpeg',
  ffprobe: env.ASSET_FFPROBE_PATH ?? 'ffprobe',
  pdfinfo: env.ASSET_PDFINFO_PATH ?? 'pdfinfo',
  ghostscript: env.ASSET_GHOSTSCRIPT_PATH ?? (process.platform === 'win32' ? 'gswin64c' : 'gs'),
} as const;

function durationMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function videoMaxRateKbps(fileSize: number, durationSeconds?: number): number | null {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const sourceTotalKbps = (fileSize * 8) / durationSeconds / 1_000;
  const budget = Math.round(sourceTotalKbps * 1.25 - 96);
  return Math.max(180, Math.min(6_000, budget));
}

interface ClaimedAsset {
  id: string;
  projectId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  ownerId: string;
}

export type AssetProcessingSettledHandler = (projectId: string) => void | Promise<void>;

interface PreviewResult {
  path: string;
  extension: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  strategy: 'image-reencode' | 'video-transcode' | 'pdf-sanitize' | 'text-sanitize';
}

async function runCommand(command: string, arguments_: string[]): Promise<string> {
  try {
    const result = await execFileAsync(command, arguments_, {
      timeout: env.ASSET_PROCESSING_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return result.stdout;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    if (code === 'ENOENT') throw new AssetProcessingDependencyError(command, error);

    const details = error && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr).slice(-2_000)
      : '';
    throw new Error(`${command} failed${details ? `: ${details}` : '.'}`, { cause: error });
  }
}

type SourceMediaMetadata = Pick<PreviewResult, 'width' | 'height' | 'durationSeconds'>;

async function assertSourceMediaLimits(path: string, mimeType: string): Promise<SourceMediaMetadata> {
  if (mimeType === 'application/pdf') {
    let output: string;
    try {
      output = await runCommand(processingCommands.pdfinfo, [path]);
    } catch (error) {
      if (error instanceof AssetProcessingDependencyError) throw error;
      throw new UnsafeFileError('The PDF could not be inspected safely.', { cause: error });
    }
    assertPdfPageLimit(output, env.ASSET_PDF_MAX_PAGES);
    return {};
  }

  if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) return {};

  let output: string;
  try {
    output = await runCommand(processingCommands.ffprobe, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      path,
    ]);
  } catch (error) {
    if (error instanceof AssetProcessingDependencyError) throw error;
    throw new UnsafeFileError('The media file could not be decoded safely.', { cause: error });
  }

  const visualMetadata = assertVisualMediaLimits({
    probeJson: output,
    mimeType,
    imageMaximumPixels: env.ASSET_IMAGE_MAX_PIXELS,
    videoMaximumPixels: env.ASSET_VIDEO_MAX_PIXELS,
    videoMaximumDurationSeconds: env.ASSET_VIDEO_MAX_DURATION_SECONDS,
  });
  return visualMetadata;
}

async function buildPreview(
  sourcePath: string,
  mimeType: string,
  workdir: string,
  sourceMetadata: SourceMediaMetadata,
  sourceFileSize: number,
): Promise<PreviewResult> {
  if (mimeType.startsWith('image/')) {
    const output = join(workdir, 'preview.webp');
    await runCommand(processingCommands.ffmpeg, [
      '-y', '-v', 'error', '-i', sourcePath,
      '-map_metadata', '-1',
      '-vf', "scale='min(2000,iw)':-2:force_original_aspect_ratio=decrease",
      '-c:v', 'libwebp', '-quality', '82', '-compression_level', '0', '-loop', '0',
      output,
    ]);
    return { path: output, extension: 'webp', mimeType: 'image/webp', strategy: 'image-reencode', ...sourceMetadata };
  }

  if (mimeType.startsWith('video/')) {
    const output = join(workdir, 'preview.mp4');
    const maxRateKbps = videoMaxRateKbps(sourceFileSize, sourceMetadata.durationSeconds);
    const rateArguments = maxRateKbps
      ? ['-maxrate', `${maxRateKbps}k`, '-bufsize', `${maxRateKbps * 2}k`]
      : [];
    await runCommand(processingCommands.ffmpeg, [
      '-y', '-v', 'error', '-i', sourcePath,
      '-map_metadata', '-1', '-map_chapters', '-1',
      '-vf', "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
      '-c:v', 'libx264', '-preset', 'superfast', '-crf', '26', ...rateArguments, '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      output,
    ]);
    return { path: output, extension: 'mp4', mimeType: 'video/mp4', strategy: 'video-transcode', ...sourceMetadata };
  }

  if (mimeType === 'application/pdf') {
    const output = join(workdir, 'preview.pdf');
    await runCommand(processingCommands.ghostscript, [
      '-dSAFER',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.6',
      '-dPDFSETTINGS=/ebook',
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      '-dNOPAUSE', '-dQUIET', '-dBATCH',
      `-sOutputFile=${output}`,
      sourcePath,
    ]);
    return { path: output, extension: 'pdf', mimeType: 'application/pdf', strategy: 'pdf-sanitize' };
  }

  if (['application/javascript', 'application/json', 'application/typescript', 'application/xml'].includes(mimeType) || mimeType.startsWith('text/')) {
    const handle = await open(sourcePath, 'r');
    const buffer = Buffer.allocUnsafe(env.ASSET_PREVIEW_MAX_TEXT_BYTES + 1);
    let bytesRead = 0;
    try {
      ({ bytesRead } = await handle.read(buffer, 0, buffer.length, 0));
    } finally {
      await handle.close();
    }
    const limited = buffer.subarray(0, Math.min(bytesRead, env.ASSET_PREVIEW_MAX_TEXT_BYTES));
    let text = new TextDecoder('utf-8', { fatal: false }).decode(limited)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    if (mimeType === 'application/json' && bytesRead <= env.ASSET_PREVIEW_MAX_TEXT_BYTES) {
      try { text = `${JSON.stringify(JSON.parse(text), null, 2)}\n`; } catch { /* Signature validation already rejects binary content. */ }
    }
    if (bytesRead > env.ASSET_PREVIEW_MAX_TEXT_BYTES) text += '\n\n[Preview truncated by FinalFrame]\n';
    const output = join(workdir, 'preview.txt');
    await writeFile(output, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return { path: output, extension: 'txt', mimeType: 'text/plain', strategy: 'text-sanitize' };
  }

  throw new UnsafeFileError('This file type cannot be converted into a safe review preview.');
}

async function claimAsset(): Promise<ClaimedAsset | null> {
  const staleBefore = new Date(Date.now() - PROCESSING_LOCK_TIMEOUT_MS);
  return prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT asset."id"
      FROM "Asset" AS asset
      INNER JOIN "Project" AS project ON project."id" = asset."projectId"
      WHERE project."deletionStatus" = 'ACTIVE'
        AND (
          asset."processingStatus" = 'PENDING'
          OR (asset."processingStatus" = 'PROCESSING' AND asset."processingStartedAt" < ${staleBefore})
        )
      ORDER BY asset."createdAt" ASC, asset."id" ASC
      FOR UPDATE OF asset SKIP LOCKED
      LIMIT 1
    `;
    const candidate = rows[0];
    if (!candidate) return null;

    const asset = await transaction.asset.findUnique({
      where: { id: candidate.id },
      select: {
        id: true,
        projectId: true,
        storageKey: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        project: { select: { ownerId: true, deletionStatus: true } },
      },
    });
    if (!asset || asset.project.deletionStatus !== ProjectDeletionStatus.ACTIVE) return null;

    await transaction.asset.update({
      where: { id: asset.id },
      data: {
        processingStatus: AssetProcessingStatus.PROCESSING,
        processingStartedAt: new Date(),
        processingError: null,
      },
      select: { id: true },
    });
    return {
      id: asset.id,
      projectId: asset.projectId,
      storageKey: asset.storageKey,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      ownerId: asset.project.ownerId,
    };
  });
}

async function rejectAsset(asset: ClaimedAsset, message: string, removeOriginal: boolean): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const changed = await transaction.asset.updateMany({
      where: { id: asset.id, processingStatus: AssetProcessingStatus.PROCESSING },
      data: {
        processingStatus: AssetProcessingStatus.REJECTED,
        processingStartedAt: null,
        processingError: message.slice(0, 500),
        ...(removeOriginal ? { originalRetiredAt: new Date() } : {}),
      },
    });
    if (changed.count !== 1) return;
    if (removeOriginal) {
      await queueStorageDeletion([asset.storageKey], transaction);
      await removeStorageUsage(transaction, asset.ownerId, asset.fileSize);
    }
    await recordActivity({
      projectId: asset.projectId,
      userId: asset.ownerId,
      action: ActivityAction.ASSET_PROCESSING_FAILED,
      message: 'Uploaded file could not be prepared for safe review.',
      metadata: { assetId: asset.id, fileName: asset.fileName, reason: message.slice(0, 200) },
    }, transaction);
  });
}

export async function processOneAsset(onSettled?: AssetProcessingSettledHandler): Promise<boolean> {
  const asset = await claimAsset();
  if (!asset) return false;
  const workdir = await mkdtemp(join(tmpdir(), `finalframe-${asset.id}-`));
  const sourcePath = join(workdir, `source-${basename(asset.fileName).replace(/[^A-Za-z0-9._-]/g, '_')}`);
  let previewKey: string | null = null;

  const processingStartedAt = performance.now();
  const timings: Record<string, number> = {};

  try {
    let stageStartedAt = performance.now();
    const sha256 = await downloadStorageObjectToFileWithSha256(asset.storageKey, sourcePath);
    timings.download = durationMs(stageStartedAt);

    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.size !== asset.fileSize) {
      throw new UnsafeFileError('The stored file size no longer matches the verified upload.');
    }

    stageStartedAt = performance.now();
    await assertFileSignature(sourcePath, asset.mimeType);
    timings.signature = durationMs(stageStartedAt);

    stageStartedAt = performance.now();
    const malwareStartedAt = performance.now();
    const mediaInspectionStartedAt = performance.now();
    const [malwareResult, mediaInspectionResult] = await Promise.allSettled([
      assertFileIsMalwareFree(sourcePath).finally(() => {
        timings.malwareScan = durationMs(malwareStartedAt);
      }),
      assertSourceMediaLimits(sourcePath, asset.mimeType).finally(() => {
        timings.mediaInspection = durationMs(mediaInspectionStartedAt);
      }),
    ]);
    timings.safetyGate = durationMs(stageStartedAt);
    if (malwareResult.status === 'rejected') throw malwareResult.reason;
    if (mediaInspectionResult.status === 'rejected') throw mediaInspectionResult.reason;
    const sourceMetadata = mediaInspectionResult.value;

    stageStartedAt = performance.now();
    const preview = await buildPreview(sourcePath, asset.mimeType, workdir, sourceMetadata, asset.fileSize);
    timings.previewBuild = durationMs(stageStartedAt);
    const previewStat = await stat(preview.path);
    if (!previewStat.isFile() || previewStat.size <= 0 || previewStat.size > env.ASSET_PREVIEW_MAX_BYTES) {
      throw new Error('Generated preview exceeded the configured review size limit.');
    }

    previewKey = createPreviewStorageKey(asset.projectId, asset.id, preview.extension);
    stageStartedAt = performance.now();
    const uploaded = await uploadStorageFile(previewKey, preview.path, preview.mimeType);
    timings.previewUpload = durationMs(stageStartedAt);

    stageStartedAt = performance.now();
    const committed = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.asset.updateMany({
        where: {
          id: asset.id,
          processingStatus: AssetProcessingStatus.PROCESSING,
          project: { deletionStatus: ProjectDeletionStatus.ACTIVE },
        },
        data: {
          previewKey: uploaded.key,
          previewMimeType: uploaded.mimeType,
          previewFileSize: uploaded.fileSize,
          sha256,
          width: preview.width ?? null,
          height: preview.height ?? null,
          durationSeconds: preview.durationSeconds ?? null,
          processingStatus: AssetProcessingStatus.CLEAN,
          processingStartedAt: null,
          processingError: null,
        },
      });
      if (changed.count !== 1) return false;
      await consumeStorageCapacity(transaction, asset.ownerId, uploaded.fileSize);
      return true;
    });

    timings.commit = durationMs(stageStartedAt);
    if (!committed) await queueStorageDeletion([previewKey]);
    logger.info('Asset preview prepared', {
      assetId: asset.id,
      projectId: asset.projectId,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      previewFileSize: uploaded.fileSize,
      previewStrategy: preview.strategy,
      durationMs: durationMs(processingStartedAt),
      timings,
    });
    return true;
  } catch (error) {
    if (previewKey) await queueStorageDeletion([previewKey]);
    const unsafe = error instanceof UnsafeFileError;
    const dependency = error instanceof AssetProcessingDependencyError ? error.tool : null;
    const message = unsafe
      ? error.message
      : dependency
        ? 'Preview processing is temporarily unavailable. The file can be retried after the processing tool is installed.'
        : 'Preview processing failed. The Designer can retry after the processing service is restored.';
    await rejectAsset(asset, message, unsafe);
    logger.warn('Asset processing failed', {
      assetId: asset.id,
      projectId: asset.projectId,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      unsafe,
      dependency,
      durationMs: durationMs(processingStartedAt),
      timings,
      error,
    });
    return true;
  } finally {
    try {
      await rm(workdir, { recursive: true, force: true });
    } finally {
      if (onSettled) {
        try {
          await onSettled(asset.projectId);
        } catch (error) {
          logger.warn('Asset processing completion could not be announced', {
            assetId: asset.id,
            projectId: asset.projectId,
            error,
          });
        }
      }
    }
  }
}

export async function processAssetBatch(
  limit = env.ASSET_PROCESSING_BATCH_SIZE,
  onSettled?: AssetProcessingSettledHandler,
): Promise<number> {
  let processed = 0;
  while (processed < limit && await processOneAsset(onSettled)) processed += 1;
  return processed;
}
