const header = (headers, name) => headers.get(name) || '';

export const validatePublicSecurityHeaders = (headers, { https }) => {
  const failures = [];
  if (header(headers, 'x-content-type-options').toLowerCase() !== 'nosniff') failures.push('X-Content-Type-Options must be nosniff.');
  if (header(headers, 'x-frame-options').toUpperCase() !== 'DENY') failures.push('X-Frame-Options must be DENY.');
  if (header(headers, 'referrer-policy').toLowerCase() !== 'strict-origin-when-cross-origin') failures.push('Referrer-Policy must be strict-origin-when-cross-origin.');
  if (!header(headers, 'permissions-policy')) failures.push('Permissions-Policy is missing.');
  const csp = header(headers, 'content-security-policy');
  if (!csp.includes("script-src 'self'") || !csp.includes("'strict-dynamic'") || !/nonce-[A-Za-z0-9+/=]+/u.test(csp)) {
    failures.push('Production CSP must contain a request nonce and strict-dynamic script policy.');
  }
  if (csp.includes("script-src 'self' 'unsafe-inline'") || csp.includes("'unsafe-eval'")) failures.push('Production script CSP must not permit unsafe-inline or unsafe-eval.');
  if (https && !/^max-age=\d+/iu.test(header(headers, 'strict-transport-security'))) failures.push('HTTPS deployment is missing HSTS.');
  return failures;
};

export const validateSecurityBaseUrl = (value) => {
  let url;
  try { url = new URL(value); } catch { throw new Error('DEPLOYED_BASE_URL must be a valid URL.'); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('Remote deployed-security verification requires HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw new Error('DEPLOYED_BASE_URL must not contain credentials, query parameters, or fragments.');
  return url.toString().replace(/\/$/u, '');
};
