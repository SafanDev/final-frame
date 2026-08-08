declare class Buffer extends Uint8Array {
  static from(value: string | ArrayBuffer | ArrayBufferView, encoding?: string): Buffer;
  static concat(values: readonly Uint8Array[]): Buffer;
  toString(encoding?: string): string;
}

declare const process: {
  uptime(): number;
  memoryUsage(): { rss: number; heapUsed: number; external: number };
};

declare const performance: { now(): number };

declare module 'node:assert/strict' {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    match(value: string, regexp: RegExp, message?: string): void;
    throws(callback: () => unknown, validator?: ((error: unknown) => boolean) | RegExp | (new (...arguments_: never[]) => Error), message?: string): void;
    doesNotThrow(callback: () => unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}

declare module 'node:test' {
  type TestCallback = () => void | Promise<void>;
  interface TestFunction {
    (name: string, callback: TestCallback): void;
  }
  const test: TestFunction;
  export const describe: TestFunction;
  export const it: TestFunction;
  export default test;
}

declare module 'node:crypto' {
  export interface KeyObject {
    export(options: { format: 'jwk' }): unknown;
  }

  interface Hash {
    update(value: string | Uint8Array, encoding?: string): Hash;
    digest(): Buffer;
    digest(encoding: 'hex'): string;
  }

  export function createHash(algorithm: string): Hash;
  export function createPrivateKey(options: { key: Uint8Array; format: 'der'; type: 'pkcs8' }): KeyObject;
  export function createPublicKey(key: KeyObject | { key: unknown; format: 'jwk' }): KeyObject;
  export function sign(algorithm: null, data: Uint8Array, key: KeyObject): Buffer;
  export function verify(algorithm: null, data: Uint8Array, key: KeyObject, signature: Uint8Array): boolean;
}
