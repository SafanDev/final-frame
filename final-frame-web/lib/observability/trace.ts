function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  let result = Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  if (/^0+$/u.test(result)) {
    values[values.length - 1] = 1;
    result = Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return result;
}

export function createBrowserTraceparent(): string {
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}

export function isValidTraceparent(value: string): boolean {
  return /^00-(?!0{32})[a-f0-9]{32}-(?!0{16})[a-f0-9]{16}-(?:00|01)$/u.test(value);
}
