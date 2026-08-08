import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open as openFile, stat } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from './env.js';
import { AppError, ConflictError, ExternalServiceError } from '../errors/app-error.js';

const assetMimeTypes = new Set([
  'application/javascript',
  'application/json',
  'application/pdf',
  'application/typescript',
  'application/xml',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/css',
  'text/csv',
  'text/javascript',
  'text/markdown',
  'text/plain',
  'text/typescript',
  'text/x-c',
  'text/x-c++src',
  'text/x-csharp',
  'text/x-go',
  'text/x-java-source',
  'text/x-php',
  'text/x-python',
  'text/x-ruby',
  'text/x-rust',
  'text/x-shellscript',
  'text/x-sql',
  'text/yaml',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const voiceMimeTypes = new Set([
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);

const activeContentMimeTypes = new Set([
  'application/xhtml+xml',
  'image/svg+xml',
  'text/html',
]);

export type StorageObjectKind = 'assets' | 'voice-notes' | 'previews';

export type UploadPolicyKind = 'asset' | 'voice';

export interface UploadPolicy {
  mimeType: string;
  fileSize: number;
}

export interface VerifiedStorageObject {
  key: string;
  mimeType: string;
  fileSize: number;
}

export interface StorageReadResult {
  body: NodeJS.ReadableStream;
  contentLength: number | null;
  contentType: string;
  contentRange: string | null;
  etag: string | null;
  lastModified: Date | null;
}

export interface UploadedMultipartPart {
  partNumber: number;
  etag: string;
  fileSize: number;
}

const storageEndpoint = env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const SERVER_MULTIPART_PART_BYTES = 5 * 1024 * 1024;
const SERVER_MULTIPART_CONCURRENCY = 4;

export const r2 = new S3Client({
  region: env.R2_REGION,
  endpoint: storageEndpoint,
  forcePathStyle: env.R2_FORCE_PATH_STYLE,
  maxAttempts: 3,
  // Recent AWS SDK releases add CRC32 to supported uploads by default. A
  // presigner cannot calculate a browser-selected file's checksum, so require
  // checksums only for operations where the service mandates them.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const normalizeMimeType = (value: string): string =>
  value.split(';', 1)[0]?.trim().toLowerCase() ?? '';

export const normalizeFileName = (fileName: string): string => {
  const trimmed = fileName.trim();
  const sanitized = trimmed
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/]/g, '_')
    .replace(/[^A-Za-z0-9._() -]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 180)
    .trim();

  return sanitized || 'file';
};

export const validateUploadPolicy = (
  mimeType: string,
  fileSize: number,
  maximumBytes = env.MAX_ASSET_UPLOAD_BYTES,
  kind: UploadPolicyKind = 'asset',
): UploadPolicy => {
  const normalizedMimeType = normalizeMimeType(mimeType);

  if (!normalizedMimeType || activeContentMimeTypes.has(normalizedMimeType)) {
    throw new AppError({ statusCode: 400, code: 'FILE_TYPE_NOT_ALLOWED', message: 'This file type is not allowed.' });
  }

  const allowedMimeTypes = kind === 'voice' ? voiceMimeTypes : assetMimeTypes;
  if (!allowedMimeTypes.has(normalizedMimeType)) {
    throw new AppError({ statusCode: 400, code: 'FILE_TYPE_NOT_SUPPORTED', message: 'This file type is not supported.' });
  }

  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > maximumBytes) {
    throw new AppError({ statusCode: 400, code: 'INVALID_FILE_SIZE', message: `File size must be between 1 and ${maximumBytes} bytes.` });
  }

  return { mimeType: normalizedMimeType, fileSize };
};

export const createStorageKey = (
  projectId: string,
  originalFileName: string,
  kind: StorageObjectKind,
): string => {
  const safeName = normalizeFileName(originalFileName);
  return `projects/${projectId}/${kind}/${randomUUID()}-${safeName}`;
};


export const createPreviewStorageKey = (
  projectId: string,
  assetId: string,
  extension: string,
): string => {
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  return `projects/${projectId}/previews/${assetId}-${randomUUID()}.${safeExtension}`;
};

export const storageKeyBelongsToProject = (
  storageKey: string,
  projectId: string,
  kind?: StorageObjectKind,
): boolean => {
  const base = `projects/${projectId}/`;
  if (!storageKey.startsWith(base) || storageKey.includes('..')) return false;
  return kind ? storageKey.startsWith(`${base}${kind}/`) : true;
};

export const generatePresignedUpload = async (
  storageKey: string,
  mimeType: string,
  fileSize: number,
  maximumBytes = env.MAX_ASSET_UPLOAD_BYTES,
  kind: UploadPolicyKind = 'asset',
): Promise<{
  url: string;
  key: string;
  mimeType: string;
  fileSize: number;
  requiredHeaders: Readonly<Record<string, string>>;
}> => {
  const policy = validateUploadPolicy(mimeType, fileSize, maximumBytes, kind);

  if (!storageKey || Buffer.byteLength(storageKey, 'utf8') > 1_024 || storageKey.includes('..')) {
    throw new AppError({ statusCode: 400, code: 'INVALID_STORAGE_KEY', message: 'Invalid storage key.' });
  }

  try {
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: storageKey,
      ContentType: policy.mimeType,
      ContentLength: policy.fileSize,
      // The signed conditional header makes the upload URL single-write. Even
      // while the URL remains valid, it cannot overwrite an object that has
      // already been committed and verified.
      IfNoneMatch: '*',
    });

    const url = await getSignedUrl(r2, command, {
      expiresIn: env.R2_UPLOAD_URL_TTL_SECONDS,
    });

    return {
      url,
      key: storageKey,
      mimeType: policy.mimeType,
      fileSize: policy.fileSize,
      requiredHeaders: {
        'Content-Type': policy.mimeType,
        'If-None-Match': '*',
      },
    };
  } catch (error) {
    throw new ExternalServiceError('Unable to create an R2 upload URL.', error);
  }
};

export const createMultipartUpload = async (
  storageKey: string,
  mimeType: string,
): Promise<string> => {
  try {
    const response = await r2.send(new CreateMultipartUploadCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: extractStorageKey(storageKey),
      ContentType: normalizeMimeType(mimeType),
    }));
    if (!response.UploadId) throw new Error('Storage did not return a multipart upload identifier.');
    return response.UploadId;
  } catch (error) {
    throw new ExternalServiceError('Unable to initiate the multipart upload.', error);
  }
};

export const generatePresignedMultipartPart = async (
  storageKey: string,
  uploadId: string,
  partNumber: number,
): Promise<string> => {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    throw new AppError({ statusCode: 400, code: 'INVALID_MULTIPART_PART', message: 'Invalid multipart part number.' });
  }
  try {
    return await getSignedUrl(r2, new UploadPartCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: extractStorageKey(storageKey),
      UploadId: uploadId,
      PartNumber: partNumber,
    }), { expiresIn: env.R2_UPLOAD_URL_TTL_SECONDS });
  } catch (error) {
    throw new ExternalServiceError('Unable to authorize a multipart upload part.', error);
  }
};

export const listMultipartUploadParts = async (
  storageKey: string,
  uploadId: string,
): Promise<UploadedMultipartPart[]> => {
  const parts: UploadedMultipartPart[] = [];
  let marker: string | undefined;
  try {
    do {
      const response = await r2.send(new ListPartsCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: extractStorageKey(storageKey),
        UploadId: uploadId,
        ...(marker ? { PartNumberMarker: marker } : {}),
      }));
      for (const part of response.Parts ?? []) {
        if (!part.PartNumber || !part.ETag || part.Size === undefined) continue;
        parts.push({ partNumber: part.PartNumber, etag: part.ETag, fileSize: part.Size });
      }
      marker = response.IsTruncated ? response.NextPartNumberMarker : undefined;
    } while (marker);
    return parts.sort((left, right) => left.partNumber - right.partNumber);
  } catch (error) {
    throw new ExternalServiceError('Unable to inspect the multipart upload.', error);
  }
};

export const completeMultipartUpload = async (
  storageKey: string,
  uploadId: string,
  parts: readonly Pick<UploadedMultipartPart, 'partNumber' | 'etag'>[],
): Promise<void> => {
  if (parts.length === 0 || parts.length > 10_000) {
    throw new AppError({ statusCode: 400, code: 'INVALID_MULTIPART_PARTS', message: 'Multipart completion requires uploaded parts.' });
  }
  try {
    await r2.send(new CompleteMultipartUploadCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: extractStorageKey(storageKey),
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((left, right) => left.partNumber - right.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }));
  } catch (error) {
    throw new ExternalServiceError('Unable to complete the multipart upload.', error);
  }
};

export const abortMultipartUpload = async (
  storageKey: string,
  uploadId: string,
): Promise<void> => {
  try {
    await r2.send(new AbortMultipartUploadCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: extractStorageKey(storageKey),
      UploadId: uploadId,
    }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const name = error instanceof Error ? error.name : '';
    if (status === 404 || name === 'NoSuchUpload') return;
    throw new ExternalServiceError('Unable to abort the multipart upload.', error);
  }
};

export const verifyUploadedObject = async (
  storageKey: string,
  expectedMimeType: string,
  expectedFileSize: number,
): Promise<VerifiedStorageObject> => {
  try {
    const response = await r2.send(
      new HeadObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: storageKey,
      }),
    );

    const actualMimeType = normalizeMimeType(response.ContentType ?? '');
    const actualFileSize = response.ContentLength;

    if (actualMimeType !== normalizeMimeType(expectedMimeType)) {
      throw new ConflictError('Uploaded object type does not match the upload authorization.');
    }

    if (actualFileSize !== expectedFileSize) {
      throw new ConflictError('Uploaded object size does not match the upload authorization.');
    }

    return {
      key: storageKey,
      mimeType: actualMimeType,
      fileSize: actualFileSize,
    };
  } catch (error) {
    if (error instanceof ConflictError) throw error;
    throw new ExternalServiceError('Unable to verify the uploaded R2 object.', error);
  }
};

const trustedStorageHosts = new Set<string>([
  `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  new URL(storageEndpoint).host,
]);

if (env.R2_PUBLIC_URL) {
  trustedStorageHosts.add(new URL(env.R2_PUBLIC_URL).host);
}

export const extractStorageKey = (fileReference: string): string => {
  if (!fileReference) throw new Error('Storage reference is missing.');
  if (!/^https?:\/\//i.test(fileReference)) return fileReference.replace(/^\/+/, '');

  const parsed = new URL(fileReference);
  if (!trustedStorageHosts.has(parsed.host)) {
    throw new Error('Storage URL host is not trusted.');
  }

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (pathParts[0] === env.R2_BUCKET_NAME) pathParts.shift();

  const key = pathParts.join('/');
  if (!key) throw new Error('Storage URL does not contain an object key.');
  return key;
};

export const getSecureUrl = async (
  fileReference: string,
  options: { downloadFileName?: string } = {},
): Promise<string> => {
  const key = extractStorageKey(fileReference);

  try {
    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: options.downloadFileName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(normalizeFileName(options.downloadFileName))}`
        : 'inline',
    });

    return await getSignedUrl(r2, command, {
      expiresIn: env.R2_VIEW_URL_TTL_SECONDS,
    });
  } catch (error) {
    throw new ExternalServiceError('Unable to create an R2 viewing URL.', error);
  }
};

/**
 * Opens a private object for authenticated, same-origin streaming.
 *
 * Callers must perform authorization before invoking this helper. The browser
 * never receives the underlying object key or a reusable storage capability;
 * every media request is therefore revalidated by the API.
 */
export const openStorageObject = async (
  fileReference: string,
  options: { range?: string } = {},
): Promise<StorageReadResult> => {
  const key = extractStorageKey(fileReference);

  try {
    const object = await r2.send(new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ...(options.range ? { Range: options.range } : {}),
    }));

    if (!object.Body || typeof (object.Body as { pipe?: unknown }).pipe !== 'function') {
      throw new Error('Storage response did not include a readable stream.');
    }

    return {
      body: object.Body as NodeJS.ReadableStream,
      contentLength: object.ContentLength ?? null,
      contentType: normalizeMimeType(object.ContentType ?? '') || 'application/octet-stream',
      contentRange: object.ContentRange ?? null,
      etag: object.ETag ?? null,
      lastModified: object.LastModified ?? null,
    };
  } catch (error) {
    throw new ExternalServiceError('Unable to stream the private storage object.', error);
  }
};

export const deleteStorageObject = async (fileReference: string): Promise<void> => {
  const key = extractStorageKey(fileReference);

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      }),
    );
  } catch (error) {
    throw new ExternalServiceError('Unable to delete an R2 object.', error);
  }
};

export const deleteStorageObjects = async (fileReferences: readonly string[]): Promise<void> => {
  const keys = [...new Set(fileReferences.filter(Boolean).map(extractStorageKey))];

  try {
    for (let offset = 0; offset < keys.length; offset += 1_000) {
      const batch = keys.slice(offset, offset + 1_000);
      const response = await r2.send(
        new DeleteObjectsCommand({
          Bucket: env.R2_BUCKET_NAME,
          Delete: {
            Quiet: false,
            Objects: batch.map((Key) => ({ Key })),
          },
        }),
      );

      if (response.Errors && response.Errors.length > 0) {
        const failedKeys = response.Errors.map((entry) => entry.Key ?? 'unknown').slice(0, 20);
        throw new Error(`R2 reported partial deletion failures: ${failedKeys.join(', ')}`);
      }
    }
  } catch (error) {
    throw new ExternalServiceError('Unable to delete one or more R2 objects.', error);
  }
};



export const downloadStorageObjectToFile = async (
  storageKey: string,
  destinationPath: string,
): Promise<void> => {
  try {
    const response = await r2.send(new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: extractStorageKey(storageKey),
    }));
    if (!response.Body || typeof (response.Body as { pipe?: unknown }).pipe !== 'function') {
      throw new Error('Storage response did not include a readable stream.');
    }
    await pipeline(
      response.Body as NodeJS.ReadableStream,
      createWriteStream(destinationPath, { flags: 'wx', mode: 0o600 }),
    );
  } catch (error) {
    throw new ExternalServiceError('Unable to read the private storage object.', error);
  }
};

export const downloadStorageObjectToFileWithSha256 = async (
  storageKey: string,
  destinationPath: string,
): Promise<string> => {
  try {
    const response = await r2.send(new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: extractStorageKey(storageKey),
    }));
    if (!response.Body || typeof (response.Body as { pipe?: unknown }).pipe !== 'function') {
      throw new Error('Storage response did not include a readable stream.');
    }

    const hash = createHash('sha256');
    const hashingStream = new Transform({
      transform(chunk, _encoding, callback) {
        const payload = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(payload);
        callback(null, payload);
      },
    });

    await pipeline(
      response.Body as NodeJS.ReadableStream,
      hashingStream,
      createWriteStream(destinationPath, { flags: 'wx', mode: 0o600 }),
    );
    return hash.digest('hex');
  } catch (error) {
    throw new ExternalServiceError('Unable to read the private storage object.', error);
  }
};

export const uploadStorageFile = async (
  storageKey: string,
  sourcePath: string,
  mimeType: string,
): Promise<{ key: string; fileSize: number; mimeType: string }> => {
  const file = await stat(sourcePath);
  if (!file.isFile() || file.size <= 0) throw new Error('Generated preview is empty.');
  const normalizedMimeType = normalizeMimeType(mimeType);
  const key = extractStorageKey(storageKey);

  try {
    if (file.size <= SERVER_MULTIPART_PART_BYTES) {
      await r2.send(new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: createReadStream(sourcePath),
        ContentType: normalizedMimeType,
        ContentLength: file.size,
        IfNoneMatch: '*',
      }));
      return { key: storageKey, fileSize: file.size, mimeType: normalizedMimeType };
    }

    const initiated = await r2.send(new CreateMultipartUploadCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ContentType: normalizedMimeType,
    }));
    if (!initiated.UploadId) throw new Error('Storage did not return a multipart upload identifier.');
    const uploadId = initiated.UploadId;
    const partCount = Math.ceil(file.size / SERVER_MULTIPART_PART_BYTES);
    const completedParts = new Array<{ PartNumber: number; ETag: string }>(partCount);
    const handle = await openFile(sourcePath, 'r');
    let nextPart = 0;

    try {
      const uploadWorker = async (): Promise<void> => {
        while (true) {
          const index = nextPart++;
          if (index >= partCount) return;
          const partNumber = index + 1;
          const offset = index * SERVER_MULTIPART_PART_BYTES;
          const length = Math.min(SERVER_MULTIPART_PART_BYTES, file.size - offset);
          const payload = Buffer.allocUnsafe(length);
          let filled = 0;
          while (filled < length) {
            const result = await handle.read(payload, filled, length - filled, offset + filled);
            if (result.bytesRead <= 0) throw new Error('Generated preview changed while it was being uploaded.');
            filled += result.bytesRead;
          }

          const uploaded = await r2.send(new UploadPartCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: payload,
            ContentLength: length,
          }));
          if (!uploaded.ETag) throw new Error(`Storage did not return an ETag for preview part ${partNumber}.`);
          completedParts[index] = { PartNumber: partNumber, ETag: uploaded.ETag };
        }
      };

      await Promise.all(Array.from(
        { length: Math.min(SERVER_MULTIPART_CONCURRENCY, partCount) },
        () => uploadWorker(),
      ));
      await r2.send(new CompleteMultipartUploadCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: completedParts },
      }));
    } catch (error) {
      await r2.send(new AbortMultipartUploadCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
      })).catch(() => undefined);
      throw error;
    } finally {
      await handle.close();
    }

    return { key: storageKey, fileSize: file.size, mimeType: normalizedMimeType };
  } catch (error) {
    throw new ExternalServiceError('Unable to store the generated review preview.', error);
  }
};


export interface ListedStorageObject {
  key: string;
  fileSize: number;
  lastModified: Date | null;
}

export const listStorageObjects = async (
  prefix: string,
  maximumObjects: number,
): Promise<{ objects: ListedStorageObject[]; truncated: boolean }> => {
  const objects: ListedStorageObject[] = [];
  let continuationToken: string | undefined;

  try {
    do {
      const response = await r2.send(new ListObjectsV2Command({
        Bucket: env.R2_BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: Math.min(1_000, maximumObjects - objects.length),
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }));

      for (const object of response.Contents ?? []) {
        if (!object.Key || object.Size === undefined) continue;
        objects.push({
          key: object.Key,
          fileSize: object.Size,
          lastModified: object.LastModified ?? null,
        });
        if (objects.length >= maximumObjects) {
          return { objects, truncated: Boolean(response.IsTruncated) || objects.length >= maximumObjects };
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return { objects, truncated: false };
  } catch (error) {
    throw new ExternalServiceError('Unable to list private storage objects.', error);
  }
};

/** Releases keep-alive sockets held by the AWS SDK during process shutdown. */
export const destroyStorageClient = (): void => {
  r2.destroy();
};
