import { apiErrorPayloadSchema } from "./schemas";
import type { ApiErrorPayload, ApiFieldError } from "./types";

export type ApiErrorKind =
  | "http"
  | "network"
  | "timeout"
  | "aborted"
  | "contract";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string;
  readonly requestId: string | null;
  readonly fields: readonly ApiFieldError[];
  readonly retryable: boolean;

  constructor(options: {
    message: string;
    kind: ApiErrorKind;
    status?: number | null;
    code: string;
    requestId?: string | null;
    fields?: readonly ApiFieldError[];
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "ApiError";
    this.kind = options.kind;
    this.status = options.status ?? null;
    this.code = options.code;
    this.requestId = options.requestId ?? null;
    this.fields = options.fields ?? [];
    this.retryable = options.retryable ?? false;
  }
}

export class ApiContractError extends ApiError {
  constructor(message: string, requestId: string | null, cause?: unknown) {
    super({
      message,
      kind: "contract",
      status: null,
      code: "FRONTEND_API_CONTRACT_MISMATCH",
      requestId,
      retryable: false,
      cause,
    });
    this.name = "ApiContractError";
  }
}

const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

export function parseApiErrorPayload(value: unknown): ApiErrorPayload | null {
  const parsed = apiErrorPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createHttpApiError(options: {
  status: number;
  statusText: string;
  payload: unknown;
  requestId: string | null;
}): ApiError {
  const parsed = parseApiErrorPayload(options.payload);
  return new ApiError({
    message:
      parsed?.error ||
      (typeof options.payload === "string" && options.payload.trim() ? options.payload.trim() : "") ||
      options.statusText ||
      "The server could not complete the request.",
    kind: "http",
    status: options.status,
    code: parsed?.code || `HTTP_${options.status}`,
    requestId: parsed?.requestId || options.requestId,
    fields: parsed?.fields,
    retryable: retryableStatuses.has(options.status),
  });
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError({
      message: "The request was cancelled.",
      kind: "aborted",
      code: "REQUEST_ABORTED",
      retryable: false,
      cause: error,
    });
  }

  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new ApiError({
      message: "The request took too long. Please try again.",
      kind: "timeout",
      code: "REQUEST_TIMEOUT",
      retryable: true,
      cause: error,
    });
  }

  return new ApiError({
    message: "FinalFrame could not reach the server. Check your connection and try again.",
    kind: "network",
    code: "NETWORK_ERROR",
    retryable: true,
    cause: error,
  });
}

const userMessageByCode: Readonly<Record<string, string>> = {
  INVALID_CREDENTIALS: "The email address or password is incorrect.",
  ACCOUNT_ALREADY_EXISTS: "An account already exists for this email address.",
  AUTHENTICATION_REQUIRED: "Your session has expired. Sign in again to continue.",
  AUTHORIZATION_FAILED: "You do not have permission to perform this action.",
  FORBIDDEN: "You do not have permission to perform this action.",
  PROJECT_LOCKED: "This project is locked and cannot be changed.",
  INVITE_EXPIRED: "This invitation is invalid or has expired.",
  VALIDATION_ERROR: "Some information is invalid. Review the highlighted fields.",
  TRANSACTION_CONFLICT: "The project changed in another session. Refresh and try again.",
  CONFLICT: "This change conflicts with the current project state. Refresh and try again.",
  NO_PROJECT_CHANGES: "No project changes were detected.",
  PAYLOAD_TOO_LARGE: "The submitted data is too large.",
  UPLOAD_AUTHORIZATION_REJECTED: "The secure upload authorization expired. Try the upload again.",
  UPLOAD_TRANSFER_FAILED: "The file could not be transferred to secure storage.",
  UPLOAD_NETWORK_ERROR: "The storage transfer was interrupted. Check the connection and retry.",
  UPLOAD_TIMEOUT: "The upload took too long. Retry when the connection is stable.",
  DOWNLOAD_LOCKED: "The project owner has not unlocked original-file downloads.",
  EMPTY_COMMENT: "Add written feedback or attach a voice note before posting.",
  NO_FEEDBACK_TO_SUMMARIZE: "Add written feedback before generating a summary.",
  AI_NOT_CONFIGURED: "AI summaries are temporarily unavailable.",
  AI_RATE_LIMITED: "The AI service is busy. Wait a moment and try again.",
  AI_TIMEOUT: "The AI summary took too long. Please try again.",
  RATE_LIMITED: "Too many requests were made. Wait a moment and try again.",
  RATE_LIMIT_EXCEEDED: "Too many requests were made. Wait a moment and try again.",
};

export function getUserFacingErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const normalized = normalizeApiError(error);

  if (userMessageByCode[normalized.code]) {
    return userMessageByCode[normalized.code];
  }

  if (normalized.kind === "timeout") {
    return "The request took too long. Please try again.";
  }

  if (normalized.kind === "network") {
    return "FinalFrame cannot reach the server. Check your connection and try again.";
  }

  switch (normalized.status) {
    case 400:
      return normalized.message || "The submitted information is invalid.";
    case 401:
      return "Your session has expired. Sign in again to continue.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested item could not be found.";
    case 409:
      return normalized.message || "This change conflicts with a newer update.";
    case 410:
      return "This link is no longer available.";
    case 413:
      return "The submitted data is too large.";
    case 423:
      return "This project is locked and cannot be changed.";
    case 429:
      return "Too many requests were made. Wait a moment and try again.";
    default:
      return normalized.status && normalized.status >= 500
        ? "FinalFrame is temporarily unavailable. Please try again."
        : normalized.message || fallback;
  }
}
