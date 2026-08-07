import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { normalizeFileName, openStorageObject } from '../config/storage.js';
import { AppError } from '../errors/app-error.js';
import { InvalidHttpRangeError, normalizeSingleByteRange } from '../services/http-range.js';

interface StreamPrivateObjectOptions {
  storageKey: string;
  rangeHeader?: string | undefined;
  downloadFileName?: string;
  fallbackMimeType?: string | null;
}

export async function streamPrivateObject(
  response: Response,
  options: StreamPrivateObjectOptions,
): Promise<void> {
  let range: string | undefined;
  try {
    range = normalizeSingleByteRange(options.rangeHeader);
  } catch (error) {
    if (error instanceof InvalidHttpRangeError) {
      throw new AppError({ statusCode: 416, code: 'INVALID_RANGE', message: error.message });
    }
    throw error;
  }
  const object = await openStorageObject(options.storageKey, range ? { range } : {});

  response.status(object.contentRange ? 206 : 200);
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', object.contentType || options.fallbackMimeType || 'application/octet-stream');
  if (object.contentLength !== null) response.setHeader('Content-Length', String(object.contentLength));
  if (object.contentRange) response.setHeader('Content-Range', object.contentRange);
  if (object.etag) response.setHeader('ETag', object.etag);
  if (object.lastModified) response.setHeader('Last-Modified', object.lastModified.toUTCString());
  response.setHeader(
    'Content-Disposition',
    options.downloadFileName
      ? `attachment; filename*=UTF-8''${encodeURIComponent(normalizeFileName(options.downloadFileName))}`
      : 'inline',
  );

  try {
    await pipeline(object.body, response);
  } catch (error) {
    if (!response.destroyed) response.destroy(error instanceof Error ? error : new Error('Media stream failed.'));
  }
}
