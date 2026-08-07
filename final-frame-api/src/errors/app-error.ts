export interface AppErrorOptions {
  statusCode: number;
  code: string;
  message: string;
  clientMessage?: string;
  expose?: boolean;
  cause?: unknown;
  details?: Readonly<Record<string, unknown>>;
}

/**
 * A controlled application error. Only errors marked as exposed may send their
 * detailed message to clients in production.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly clientMessage: string;
  readonly expose: boolean;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.clientMessage = options.clientMessage ?? options.message;
    this.expose = options.expose ?? options.statusCode < 500;
    this.details = options.details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication is required.') {
    super({
      statusCode: 401,
      code: 'AUTHENTICATION_REQUIRED',
      message,
      clientMessage: message,
    });
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super({
      statusCode: 403,
      code: 'FORBIDDEN',
      message,
      clientMessage: message,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super({
      statusCode: 404,
      code: 'NOT_FOUND',
      message,
      clientMessage: message,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super({
      statusCode: 409,
      code: 'CONFLICT',
      message,
      clientMessage: message,
    });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({
      statusCode: 503,
      code: 'EXTERNAL_SERVICE_UNAVAILABLE',
      message,
      clientMessage: 'A required external service is temporarily unavailable.',
      expose: false,
      cause,
    });
  }
}

export const assertCondition: (
  condition: unknown,
  error: AppError,
) => asserts condition = (condition, error) => {
  if (!condition) throw error;
};
