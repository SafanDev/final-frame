export function exceedsByteLimit(
  usedBytes: bigint,
  reservedBytes: bigint,
  additionalBytes: bigint,
  limitBytes: bigint,
): boolean {
  if (usedBytes < 0n || reservedBytes < 0n || additionalBytes < 0n || limitBytes < 0n) {
    throw new RangeError('Quota byte values must be non-negative.');
  }
  return usedBytes + reservedBytes + additionalBytes > limitBytes;
}

export function hasReachedCountLimit(current: number, limit: number): boolean {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(limit) || current < 0 || limit < 0) {
    throw new RangeError('Quota counts must be non-negative safe integers.');
  }
  return current >= limit;
}
