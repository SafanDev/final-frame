import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../errors/app-error.js';
import { env } from '../config/env.js';
import { logger, sanitizePathForLog } from '../utils/logger.js';

interface ErrorResponseBody {
  error: string;
  code: string;
  requestId?: string;
  fields?: readonly {
    path: string;
    message: string;
  }[];
}

const getRequestId = (response: Response): string | undefined =>
  typeof response.locals.requestId === 'string' ? response.locals.requestId : undefined;
const getTraceId = (response: Response): string | undefined =>
  typeof response.locals.traceId === 'string' ? response.locals.traceId : undefined;

const sendError = (
  response: Response,
  statusCode: number,
  body: ErrorResponseBody,
): void => {
  response.setHeader('Cache-Control', 'no-store');
  response.status(statusCode).json(body);
};

const isMalformedJsonError = (error: unknown): boolean =>
  error instanceof SyntaxError &&
  typeof error === 'object' &&
  error !== null &&
  'type' in error &&
  error.type === 'entity.parse.failed';

const isPayloadTooLargeError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'type' in error &&
  error.type === 'entity.too.large';

const prismaErrorResponse = (
  error: Prisma.PrismaClientKnownRequestError,
): { statusCode: number; code: string; message: string } => {
  switch (error.code) {
    case 'P2002':
      return {
        statusCode: 409,
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        message: 'A record with that value already exists.',
      };
    case 'P2003':
      return {
        statusCode: 409,
        code: 'RELATION_CONSTRAINT_VIOLATION',
        message: 'The operation conflicts with a related record.',
      };
    case 'P2025':
      return {
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
      };
    case 'P2034':
      return {
        statusCode: 409,
        code: 'TRANSACTION_CONFLICT',
        message: 'The operation conflicted with another request. Please retry.',
      };
    default:
      return {
        statusCode: 500,
        code: 'DATABASE_ERROR',
        message: 'A database operation failed.',
      };
  }
};

/**
 * Central API error boundary. It preserves useful operational detail in logs
 * while exposing only stable, frontend-safe messages to clients.
 */
export const errorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const requestId = getRequestId(response);
  const traceId = getTraceId(response);
  const path = sanitizePathForLog(request.originalUrl || request.path);
  const baseLog = {
    requestId,
    traceId,
    method: request.method,
    path,
  };

  if (error instanceof z.ZodError) {
    const fields = error.issues.slice(0, 20).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    logger.warn('Request validation failed', {
      ...baseLog,
      fields,
    });

    sendError(response, 400, {
      error: fields[0]?.message ?? 'Request validation failed.',
      code: 'VALIDATION_ERROR',
      ...(requestId ? { requestId } : {}),
      fields,
    });
    return;
  }

  if (isMalformedJsonError(error)) {
    logger.warn('Malformed JSON request body', baseLog);
    sendError(response, 400, {
      error: 'The request body contains invalid JSON.',
      code: 'INVALID_JSON',
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  if (isPayloadTooLargeError(error)) {
    logger.warn('Request body exceeded the configured size limit', baseLog);
    sendError(response, 413, {
      error: 'The request body is too large.',
      code: 'PAYLOAD_TOO_LARGE',
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = prismaErrorResponse(error);
    const log = mapped.statusCode >= 500 ? logger.error : logger.warn;

    log('Prisma request failed', {
      ...baseLog,
      prismaCode: error.code,
    });

    sendError(response, mapped.statusCode, {
      error:
        mapped.statusCode >= 500 && env.NODE_ENV === 'production'
          ? 'An internal server error occurred.'
          : mapped.message,
      code: mapped.code,
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  if (error instanceof AppError) {
    const log = error.statusCode >= 500 ? logger.error : logger.warn;
    log(error.message, {
      ...baseLog,
      errorCode: error.code,
      statusCode: error.statusCode,
      details: error.details,
      ...(error.statusCode >= 500 ? { error } : {}),
    });

    const clientMessage =
      error.expose || env.NODE_ENV !== 'production'
        ? error.clientMessage
        : 'An internal server error occurred.';

    sendError(response, error.statusCode, {
      error: clientMessage,
      code: error.code,
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  logger.error('Unhandled request error', {
    ...baseLog,
    error,
  });

  sendError(response, 500, {
    error:
      env.NODE_ENV === 'production'
        ? 'An internal server error occurred.'
        : error instanceof Error
          ? error.message
          : 'An unknown error occurred.',
    code: 'INTERNAL_SERVER_ERROR',
    ...(requestId ? { requestId } : {}),
  });
};

/** Handles API paths that reached the end of the router stack. */
export const apiNotFoundHandler: RequestHandler = (_request, response) => {
  const requestId = getRequestId(response);

  sendError(response, 404, {
    error: 'API endpoint not found.',
    code: 'API_ENDPOINT_NOT_FOUND',
    ...(requestId ? { requestId } : {}),
  });
};
