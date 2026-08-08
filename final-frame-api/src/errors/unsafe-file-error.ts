/** A file that is structurally unsafe or violates bounded review limits. */
export class UnsafeFileError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'UnsafeFileError';
  }
}
