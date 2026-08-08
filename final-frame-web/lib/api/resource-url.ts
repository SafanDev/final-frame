import { clientEnv } from '@/lib/env/client';
import { isApiResourceReference } from './resource-url-core';

export { isApiResourceReference } from './resource-url-core';

export function resolveApiResourceUrl(value: string): string {
  if (/^https?:\/\//iu.test(value)) return value;
  if (!isApiResourceReference(value) || !value.startsWith('/')) {
    throw new TypeError('API resource URL must be absolute or root-relative.');
  }
  return `${clientEnv.NEXT_PUBLIC_API_URL}${value}`;
}
