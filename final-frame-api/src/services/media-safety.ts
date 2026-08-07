import { UnsafeFileError } from '../errors/unsafe-file-error.ts';

interface VisualProbe {
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  format?: { duration?: string };
}

export function assertPdfPageLimit(output: string, maximumPages: number): number {
  const pages = Number(/^Pages:\s+(\d+)$/im.exec(output)?.[1]);
  if (!Number.isInteger(pages) || pages < 1) {
    throw new UnsafeFileError('The PDF does not contain a valid page count.');
  }
  if (pages > maximumPages) {
    throw new UnsafeFileError(`PDF files may contain at most ${maximumPages} pages.`);
  }
  return pages;
}

export function assertVisualMediaLimits(input: {
  probeJson: string;
  mimeType: string;
  imageMaximumPixels: number;
  videoMaximumPixels: number;
  videoMaximumDurationSeconds: number;
}): { width: number; height: number; durationSeconds?: number } {
  let parsed: VisualProbe;
  try {
    parsed = JSON.parse(input.probeJson) as VisualProbe;
  } catch (error) {
    throw new UnsafeFileError('The media metadata is invalid.', { cause: error });
  }

  const visual = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const width = visual?.width;
  const height = visual?.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width ?? 0) <= 0 || (height ?? 0) <= 0) {
    throw new UnsafeFileError('The media file does not contain valid visual dimensions.');
  }

  const safeWidth = width as number;
  const safeHeight = height as number;
  const pixels = safeWidth * safeHeight;
  const isVideo = input.mimeType.startsWith('video/');
  const maximumPixels = isVideo ? input.videoMaximumPixels : input.imageMaximumPixels;
  if (!Number.isSafeInteger(pixels) || pixels > maximumPixels) {
    throw new UnsafeFileError(`The media dimensions exceed the ${maximumPixels.toLocaleString('en-US')}-pixel safety limit.`);
  }

  if (!isVideo) return { width: safeWidth, height: safeHeight };

  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new UnsafeFileError('The video duration could not be verified.');
  }
  if (duration > input.videoMaximumDurationSeconds) {
    throw new UnsafeFileError(`Videos may be at most ${input.videoMaximumDurationSeconds} seconds long.`);
  }
  return { width: safeWidth, height: safeHeight, durationSeconds: duration };
}
