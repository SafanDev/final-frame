export class InvalidHttpRangeError extends RangeError {
  constructor(message = 'The requested byte range is invalid.') {
    super(message);
    this.name = 'InvalidHttpRangeError';
  }
}

/**
 * Validates a single HTTP byte range without interpreting object length.
 * S3-compatible storage performs the final satisfiability check.
 */
export function normalizeSingleByteRange(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length > 128 || trimmed.includes(',')) {
    throw new InvalidHttpRangeError('Only one byte range can be requested at a time.');
  }

  const match = /^bytes=(\d*)-(\d*)$/iu.exec(trimmed);
  if (!match || (!match[1] && !match[2])) throw new InvalidHttpRangeError();
  if (match[1] && match[2] && Number(match[1]) > Number(match[2])) {
    throw new InvalidHttpRangeError();
  }

  return `bytes=${match[1]}-${match[2]}`;
}
