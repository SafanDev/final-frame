import type { NextFunction, Request, Response } from 'express';
import { decodeSessionCookieHeader, type AuthenticatedUser } from '../auth/session.js';
import { AuthenticationError } from '../errors/app-error.js';

/**
 * Request type used by protected handlers.
 *
 * The user remains optional at the Express boundary because middleware order is
 * a runtime concern. Protected handlers should call getAuthenticatedUser()
 * instead of using a non-null assertion.
 */
export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Decodes the NextAuth session cookie and attaches a validated user identity to
 * the request. Authentication failures are passed to the shared error handler
 * so every API endpoint returns the same response contract.
 */
export const requireAuth = async (
  request: AuthRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    request.user = await decodeSessionCookieHeader(request.headers.cookie);
    next();
  } catch (error) {
    next(error instanceof AuthenticationError ? error : new AuthenticationError());
  }
};

/**
 * Provides a strongly typed identity inside protected route handlers.
 */
export const getAuthenticatedUser = (request: AuthRequest): AuthenticatedUser => {
  if (!request.user) throw new AuthenticationError();
  return request.user;
};
