import { describe, expect, it } from "vitest";
import {
  ApiError,
  createHttpApiError,
  getUserFacingErrorMessage,
  normalizeApiError,
  parseApiErrorPayload,
} from "@/lib/api/errors";

describe("API error normalization", () => {
  it("parses valid backend error payloads", () => {
    expect(parseApiErrorPayload({
      error: "Invalid title",
      code: "VALIDATION_ERROR",
      requestId: "request-123",
      fields: [{ path: "title", message: "Required" }],
    })).toEqual({
      error: "Invalid title",
      code: "VALIDATION_ERROR",
      requestId: "request-123",
      fields: [{ path: "title", message: "Required" }],
    });
    expect(parseApiErrorPayload({ nope: true })).toBeNull();
  });

  it("creates retryable HTTP errors only for transient statuses", () => {
    const unavailable = createHttpApiError({
      status: 503,
      statusText: "Unavailable",
      payload: { error: "Try later", code: "SERVICE_UNAVAILABLE" },
      requestId: "header-id",
    });
    expect(unavailable.retryable).toBe(true);
    expect(unavailable.requestId).toBe("header-id");

    const forbidden = createHttpApiError({
      status: 403,
      statusText: "Forbidden",
      payload: null,
      requestId: null,
    });
    expect(forbidden.retryable).toBe(false);
  });

  it("normalizes abort, timeout and unknown errors", () => {
    expect(normalizeApiError(new DOMException("cancel", "AbortError")).code).toBe("REQUEST_ABORTED");
    expect(normalizeApiError(new DOMException("slow", "TimeoutError")).kind).toBe("timeout");
    expect(normalizeApiError(new TypeError("offline")).kind).toBe("network");
  });

  it("keeps existing ApiError instances", () => {
    const error = new ApiError({ message: "No", kind: "http", code: "FORBIDDEN", status: 403 });
    expect(normalizeApiError(error)).toBe(error);
  });

  it("returns safe user-facing messages", () => {
    expect(getUserFacingErrorMessage(new ApiError({
      message: "raw backend detail",
      kind: "http",
      code: "DOWNLOAD_LOCKED",
      status: 403,
    }))).toMatch(/not unlocked/i);
    expect(getUserFacingErrorMessage(new ApiError({
      message: "internal detail",
      kind: "http",
      code: "HTTP_500",
      status: 500,
    }))).toMatch(/temporarily unavailable/i);
  });
});
