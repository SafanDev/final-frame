import type { z } from "zod";
import { clientEnv } from "@/lib/env/client";
import { createLinkedAbortSignal, sleep } from "@/lib/utils/abort";
import {
  ApiContractError,
  ApiError,
  createHttpApiError,
  normalizeApiError,
} from "./errors";
import type { PageInfo } from "./types";
import { createBrowserTraceparent } from '@/lib/observability/trace';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_COUNT = 1;
const SESSION_EXPIRED_EVENT = "finalframe:session-expired";

export interface ApiResponse<T> {
  data: T;
  status: number;
  requestId: string | null;
  pagination: PageInfo | null;
  headers: Headers;
}

export interface ApiRequestOptions<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: HeadersInit;
  cache?: RequestCache;
  retryCount?: number;
}

export interface ApiClientOptions {
  baseUrl: string;
  credentials?: RequestCredentials;
  defaultTimeoutMs?: number;
  onUnauthorized?: (error: ApiError) => void;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `ff-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readPagination(headers: Headers): PageInfo | null {
  const hasMoreHeader = headers.get("X-Has-More");
  const nextCursor = headers.get("X-Next-Cursor");
  if (hasMoreHeader === null && nextCursor === null) return null;

  return {
    hasMore: hasMoreHeader === "true",
    nextCursor: nextCursor || null,
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    try {
      return await response.json();
    } catch (error) {
      throw new ApiContractError(
        "The server returned invalid JSON.",
        response.headers.get("X-Request-Id"),
        error,
      );
    }
  }

  const text = await response.text();
  return text || undefined;
}

function isSafeMethod(method: string): boolean {
  return method === "GET";
}

function retryDelay(attempt: number): number {
  return Math.min(250 * 2 ** attempt + Math.random() * 150, 1_500);
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly credentials: RequestCredentials;
  private readonly defaultTimeoutMs: number;
  private readonly onUnauthorized?: (error: ApiError) => void;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.credentials = options.credentials ?? "include";
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onUnauthorized = options.onUnauthorized;
  }

  async request<T>(path: string, options: ApiRequestOptions<T>): Promise<ApiResponse<T>> {
    const method = options.method ?? "GET";
    const retryCount = isSafeMethod(method)
      ? options.retryCount ?? DEFAULT_RETRY_COUNT
      : 0;

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      if (attempt > 0) {
        await sleep(retryDelay(attempt - 1), options.signal);
      }

      try {
        return await this.execute(path, { ...options, method });
      } catch (error) {
        const normalized = normalizeApiError(error);
        lastError = normalized;

        if (!normalized.retryable || attempt >= retryCount || options.signal?.aborted) {
          throw normalized;
        }
      }
    }

    throw lastError ?? new ApiError({
      message: "The request could not be completed.",
      kind: "network",
      code: "REQUEST_FAILED",
      retryable: true,
    });
  }

  private async execute<T>(
    path: string,
    options: ApiRequestOptions<T> & { method: NonNullable<ApiRequestOptions<T>["method"]> },
  ): Promise<ApiResponse<T>> {
    const linked = createLinkedAbortSignal(
      options.signal,
      options.timeoutMs ?? this.defaultTimeoutMs,
    );
    const requestId = createRequestId();
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    headers.set("X-Request-Id", requestId);
    headers.set('traceparent', createBrowserTraceparent());

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (
        options.body instanceof FormData ||
        options.body instanceof Blob ||
        options.body instanceof URLSearchParams ||
        typeof options.body === "string"
      ) {
        body = options.body;
      } else {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(options.body);
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers,
        body,
        credentials: this.credentials,
        cache: options.cache ?? "no-store",
        signal: linked.signal,
      });

      const responseRequestId = response.headers.get("X-Request-Id") || requestId;
      const payload = await parseResponseBody(response);

      if (!response.ok) {
        const apiError = createHttpApiError({
          status: response.status,
          statusText: response.statusText,
          payload,
          requestId: responseRequestId,
        });

        if (response.status === 401) this.onUnauthorized?.(apiError);
        throw apiError;
      }

      const parsed = options.schema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiContractError(
          "The API response does not match the FinalFrame frontend contract.",
          responseRequestId,
          parsed.error,
        );
      }

      return {
        data: parsed.data,
        status: response.status,
        requestId: responseRequestId,
        pagination: readPagination(response.headers),
        headers: response.headers,
      };
    } catch (error) {
      if (linked.signal.aborted && linked.signal.reason instanceof DOMException) {
        throw normalizeApiError(linked.signal.reason);
      }
      throw normalizeApiError(error);
    } finally {
      linked.dispose();
    }
  }
}

function notifySessionExpired(error: ApiError): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: error }));
}

export const apiClient = new ApiClient({
  baseUrl: clientEnv.NEXT_PUBLIC_API_URL,
  credentials: "include",
  onUnauthorized: notifySessionExpired,
});

export const sessionExpiredEventName = SESSION_EXPIRED_EVENT;
