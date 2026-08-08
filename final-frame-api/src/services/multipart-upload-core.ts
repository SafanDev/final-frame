export interface MultipartPartPlan {
  partNumber: number;
  offset: number;
  fileSize: number;
}

export interface UploadedPartLike {
  partNumber: number;
  etag: string;
  fileSize: number;
}

export function createMultipartPartPlan(fileSize: number, partSize: number): MultipartPartPlan[] {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) throw new RangeError('File size must be a positive safe integer.');
  if (!Number.isSafeInteger(partSize) || partSize < 5 * 1024 * 1024) throw new RangeError('Multipart part size must be at least 5 MiB.');
  const count = Math.ceil(fileSize / partSize);
  if (count > 10_000) throw new RangeError('Multipart upload would exceed 10,000 parts.');
  return Array.from({ length: count }, (_, index) => {
    const offset = index * partSize;
    return {
      partNumber: index + 1,
      offset,
      fileSize: Math.min(partSize, fileSize - offset),
    };
  });
}

export function validateCompleteMultipartParts(
  uploaded: readonly UploadedPartLike[],
  fileSize: number,
  partSize: number,
): UploadedPartLike[] {
  const plan = createMultipartPartPlan(fileSize, partSize);
  const byNumber = new Map<number, UploadedPartLike>();
  for (const part of uploaded) {
    if (!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > plan.length) {
      throw new RangeError('Multipart upload contains an unexpected part number.');
    }
    if (!part.etag || part.etag.length > 256) throw new RangeError('Multipart upload contains an invalid ETag.');
    if (byNumber.has(part.partNumber)) throw new RangeError('Multipart upload contains duplicate parts.');
    byNumber.set(part.partNumber, part);
  }
  if (byNumber.size !== plan.length) throw new RangeError('Multipart upload is incomplete.');
  return plan.map((expected) => {
    const actual = byNumber.get(expected.partNumber);
    if (!actual || actual.fileSize !== expected.fileSize) {
      throw new RangeError(`Multipart part ${expected.partNumber} has an unexpected size.`);
    }
    return actual;
  });
}
