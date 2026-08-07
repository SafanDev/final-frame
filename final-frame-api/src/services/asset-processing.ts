import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { prisma } from '../config/prisma.js';
import {
  createPreviewStorageKey,
  downloadStorageObjectToFile,
  uploadStorageFile,
} from '../config/storage.js';
import { env } from '../config/env.js';
import { ActivityAction, AssetProcessingStatus, ProjectDeletionStatus } from '../generated/prisma/enums.js';
import { recordActivity } from './activity.js';
import { UnsafeFileError } from '../errors/unsafe-file-error.js';
import { assertFileIsMalwareFree, assertFileSignature } from './file-inspection.js';
import { assertPdfPageLimit, assertVisualMediaLimits } from './media-safety.js';
import { addStorageUsage, removeStorageUsage, requireStorageCapacity } from './quotas.js';
import { queueStorageDeletion } from './storage-cleanup.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const PROCESSING_LOCK_TIMEOUT_MS = env.ASSET_PROCESSING_STALE_MS;

interface ClaimedAsset {
  id: string;
  projectId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  ownerId: string;
}

interface PreviewResult {
  path: string;
  extension: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
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
    const details = error && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr).slice(-2_000)
      : '';
    throw new Error(`${command} failed${details ? `: ${details}` : '.'}`, { cause: error });
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function assertSourceMediaLimits(path: string, mimeType: string): Promise<void> {
  if (mimeType === 'application/pdf') {
    let output: string;
    try {
      output = await runCommand('pdfinfo', [path]);
    } catch (error) {
      throw new UnsafeFileError('The PDF could not be inspected safely.', { cause: error });
    }
    assertPdfPageLimit(output, env.ASSET_PDF_MAX_PAGES);
    return;
  }

  if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) return;

  let output: string;
  try {
    output = await runCommand('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      path,
    ]);
  } catch (error) {
    throw new UnsafeFileError('The media file could not be decoded safely.', { cause: error });
  }

  assertVisualMediaLimits({
    probeJson: output,
    mimeType,
    imageMaximumPixels: env.ASSET_IMAGE_MAX_PIXELS,
    videoMaximumPixels: env.ASSET_VIDEO_MAX_PIXELS,
    videoMaximumDurationSeconds: env.ASSET_VIDEO_MAX_DURATION_SECONDS,
  });
}

async function mediaMetadata(path: string): Promise<Pick<PreviewResult, 'width' | 'height' | 'durationSeconds'>> {
  try {
    const output = await runCommand('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      path,
    ]);
    const parsed = JSON.parse(output) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const visual = parsed.streams?.find((stream) => stream.codec_type === 'video');
    const duration = Number(parsed.format?.duration);
    return {
      ...(Number.isInteger(visual?.width) && (visual?.width ?? 0) > 0 ? { width: visual!.width } : {}),
      ...(Number.isInteger(visual?.height) && (visual?.height ?? 0) > 0 ? { height: visual!.height } : {}),
      ...(Number.isFinite(duration) && duration >= 0 ? { durationSeconds: duration } : {}),
    };
  } catch {
    return {};
  }
}

async function buildPreview(sourcePath: string, mimeType: string, workdir: string): Promise<PreviewResult> {
  if (mimeType.startsWith('image/')) {
    const output = join(workdir, 'preview.webp');
    await runCommand('ffmpeg', [
      '-y', '-v', 'error', '-i', sourcePath,
      '-map_metadata', '-1',
      '-vf', 'scale=2000:-2:force_original_aspect_ratio=decrease',
      '-c:v', 'libwebp', '-quality', '82', '-compression_level', '4', '-loop', '0',
      output,
    ]);
    return { path: output, extension: 'webp', mimeType: 'image/webp', ...await mediaMetadata(output) };
  }

  if (mimeType.startsWith('video/')) {
    const output = join(workdir, 'preview.mp4');
    await runCommand('ffmpeg', [
      '-y', '-v', 'error', '-i', sourcePath,
      '-map_metadata', '-1',
      '-vf', 'scale=1280:-2:force_original_aspect_ratio=decrease',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      output,
    ]);
    return { path: output, extension: 'mp4', mimeType: 'video/mp4', ...await mediaMetadata(output) };
  }

  if (mimeType === 'application/pdf') {
    const output = join(workdir, 'preview.pdf');
    await runCommand('gs', [
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
    return { path: output, extension: 'pdf', mimeType: 'application/pdf' };
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
    return { path: output, extension: 'txt', mimeType: 'text/plain' };
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

export async function processOneAsset(): Promise<boolean> {
  const asset = await claimAsset();
  if (!asset) return false;
  const workdir = await mkdtemp(join(tmpdir(), `finalframe-${asset.id}-`));
  const sourcePath = join(workdir, `source-${basename(asset.fileName).replace(/[^A-Za-z0-9._-]/g, '_')}`);
  let previewKey: string | null = null;

  try {
    await downloadStorageObjectToFile(asset.storageKey, sourcePath);
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.size !== asset.fileSize) {
      throw new UnsafeFileError('The stored file size no longer matches the verified upload.');
    }
    await assertFileSignature(sourcePath, asset.mimeType);
    await assertFileIsMalwareFree(sourcePath);
    await assertSourceMediaLimits(sourcePath, asset.mimeType);
    const sha256 = await sha256File(sourcePath);
    const preview = await buildPreview(sourcePath, asset.mimeType, workdir);
    const previewStat = await stat(preview.path);
    if (!previewStat.isFile() || previewStat.size <= 0 || previewStat.size > env.ASSET_PREVIEW_MAX_BYTES) {
      throw new Error('Generated preview exceeded the configured review size limit.');
    }

    previewKey = createPreviewStorageKey(asset.projectId, asset.id, preview.extension);
    const uploaded = await uploadStorageFile(previewKey, preview.path, preview.mimeType);

    const committed = await prisma.$transaction(async (transaction) => {
      const current = await transaction.asset.findFirst({
        where: {
          id: asset.id,
          processingStatus: AssetProcessingStatus.PROCESSING,
          project: { deletionStatus: ProjectDeletionStatus.ACTIVE },
        },
        select: { id: true },
      });
      if (!current) return false;
      await requireStorageCapacity(transaction, asset.ownerId, uploaded.fileSize);
      const changed = await transaction.asset.updateMany({
        where: { id: asset.id, processingStatus: AssetProcessingStatus.PROCESSING },
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
      await addStorageUsage(transaction, asset.ownerId, uploaded.fileSize);
      return true;
    });

    if (!committed) await queueStorageDeletion([previewKey]);
    return true;
  } catch (error) {
    if (previewKey) await queueStorageDeletion([previewKey]);
    const unsafe = error instanceof UnsafeFileError;
    const message = unsafe
      ? error.message
      : 'Preview processing failed. The Designer can retry after the processing service is restored.';
    await rejectAsset(asset, message, unsafe);
    logger.warn('Asset processing failed', { assetId: asset.id, projectId: asset.projectId, unsafe, error });
    return true;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

export async function processAssetBatch(limit = env.ASSET_PROCESSING_BATCH_SIZE): Promise<number> {
  let processed = 0;
  while (processed < limit && await processOneAsset()) processed += 1;
  return processed;
}
