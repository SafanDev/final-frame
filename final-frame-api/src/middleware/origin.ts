import type { RequestHandler } from 'express';
import { frontendOrigin } from '../config/env.js';
import { AuthorizationError } from '../errors/app-error.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-authenticated mutations need an origin boundary in addition to CORS.
 * Browsers enforce CORS only for script access; this middleware also rejects
 * cross-site form submissions while still allowing trusted server-to-server
 * calls that do not carry browser fetch metadata.
 */
export const verifyMutationOrigin: RequestHandler = (request, _response, next) => {
    if (safeMethods.has(request.method)) {
        next();
        return;
    }

    const origin = request.get('origin');
    if (origin) {
        if (origin !== frontendOrigin) {
            next(new AuthorizationError('The request origin is not allowed.'));
            return;
        }

        next();
        return;
    }

    const fetchSite = request.get('sec-fetch-site');
    if (fetchSite === 'cross-site') {
        next(new AuthorizationError('Cross-site requests are not allowed.'));
        return;
    }

    // Missing Origin and Sec-Fetch-Site is expected for trusted internal clients,
    // deployment probes and the server-side NextAuth Credentials callback.
    next();
};
