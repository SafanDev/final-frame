export function isApiResourceReference(value: string): boolean {
  return value.startsWith('/') || /^https?:\/\//iu.test(value);
}
