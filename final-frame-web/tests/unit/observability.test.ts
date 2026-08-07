import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testEnvironment = vi.hoisted(() => ({
  NEXT_PUBLIC_TELEMETRY_ENABLED: true,
  NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE: 1,
  NEXT_PUBLIC_RELEASE_VERSION: "test-release",
}));

vi.mock("@/lib/env/client", () => ({
  clientEnv: testEnvironment,
}));

import {
  reportClientError,
  reportWebVital,
  sanitizeTelemetryMessage,
} from "@/lib/observability/client";

function setSendBeacon(implementation: (url: string | URL, data?: BodyInit | null) => boolean): ReturnType<typeof vi.fn> {
  const mock = vi.fn(implementation);
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    writable: true,
    value: mock,
  });
  return mock;
}

function installFetchMock(): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function readPostedEvent(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("telemetry sanitization", () => {
  beforeEach(() => {
    testEnvironment.NEXT_PUBLIC_TELEMETRY_ENABLED = true;
    testEnvironment.NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE = 1;
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("removes email addresses, tokens and URL query strings", () => {
    const result = sanitizeTelemetryMessage(
      "Failed for person@example.com at https://app.example.com/invite/abc?token=secret Bearer abc.def.ghi ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789TOKEN",
    );
    expect(result).not.toContain("person@example.com");
    expect(result).not.toContain("?token=secret");
    expect(result).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(result).toContain("[email]");
    expect(result).toContain("Bearer [redacted]");
  });

  it("normalizes whitespace, malformed URLs and message length", () => {
    const result = sanitizeTelemetryMessage(`line one\n\thttps://% ${"x".repeat(700)}`);

    expect(result).not.toContain("\n");
    expect(result).toContain("[url]");
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it("sends web vitals through the fetch fallback with privacy-safe fields", () => {
    setSendBeacon(() => false);
    const fetchMock = installFetchMock();
    window.history.replaceState({}, "", "/project/demo?invite=secret");

    reportWebVital({
      id: "metric-".repeat(50),
      name: "LCP",
      value: 1_250,
      delta: 125,
      rating: "good",
      navigationType: "navigate-".repeat(20),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const event = readPostedEvent(fetchMock);
    expect(event.type).toBe("web-vital");
    expect(event.route).toBe("/project/demo");
    expect(event.release).toBe("test-release");
    expect(String(event.metricId)).toHaveLength(200);
    expect(String(event.navigationType)).toHaveLength(80);
  });

  it("uses sendBeacon when the browser accepts the event", () => {
    const beacon = setSendBeacon(() => true);
    const fetchMock = installFetchMock();

    reportClientError(new Error("Preview failed"), {
      source: "react-boundary",
      digest: "digest-value",
      fatal: true,
    });

    expect(beacon).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes strings, objects and circular unknown errors", () => {
    setSendBeacon(() => false);
    const fetchMock = installFetchMock();

    reportClientError("String failure", { source: "manual" });
    reportClientError({ reason: "Object failure" }, { source: "window-error" });

    const circular: { self?: unknown } = {};
    circular.self = circular;
    reportClientError(circular, { source: "unhandled-rejection" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readPostedEvent(fetchMock, 0).message).toBe("String failure");
    expect(readPostedEvent(fetchMock, 1).message).toBe('{"reason":"Object failure"}');
    expect(readPostedEvent(fetchMock, 2).message).toBe("Unknown client error");
  });

  it("drops empty errors, disabled telemetry and duplicate events", () => {
    setSendBeacon(() => false);
    const fetchMock = installFetchMock();

    reportClientError("   ", { source: "manual" });
    testEnvironment.NEXT_PUBLIC_TELEMETRY_ENABLED = false;
    reportClientError("Disabled event", { source: "manual" });

    testEnvironment.NEXT_PUBLIC_TELEMETRY_ENABLED = true;
    reportClientError("Duplicate event 4901", { source: "manual" });
    reportClientError("Duplicate event 4901", { source: "manual" });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("honours web-vital sampling", () => {
    setSendBeacon(() => false);
    const fetchMock = installFetchMock();
    const random = vi.spyOn(Math, "random");

    testEnvironment.NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE = 0;
    reportWebVital({ id: "sample-zero", name: "CLS", value: 0.01, delta: 0.01 });

    testEnvironment.NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE = 0.5;
    random.mockReturnValueOnce(0.9);
    reportWebVital({ id: "sample-rejected", name: "CLS", value: 0.02, delta: 0.01 });

    random.mockReturnValueOnce(0.1);
    reportWebVital({ id: "sample-accepted", name: "CLS", value: 0.03, delta: 0.01 });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("expires old duplicate fingerprints and never throws when delivery fails", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
    setSendBeacon(() => false);
    const fetchMock = installFetchMock();

    reportClientError("Old fingerprint 8842", { source: "manual" });
    vi.setSystemTime(new Date("2026-07-22T12:00:31.000Z"));
    reportClientError("Fresh fingerprint 8843", { source: "manual" });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    setSendBeacon(() => {
      throw new Error("Beacon unavailable");
    });
    expect(() => reportClientError("Delivery failure 8844", { source: "manual" })).not.toThrow();
  });
});
