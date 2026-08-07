import type { Response } from 'express';

/**
 * Sensitive API responses must never be stored by browsers, shared proxies or
 * service workers. response.vary() appends values instead of overwriting CORS
 * and compression headers that earlier middleware already added.
 */
export const disableResponseCaching = (response: Response): void => {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
  response.vary('Cookie');
  response.vary('Authorization');
};
