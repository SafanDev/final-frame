"use client";

import { clientEnv } from "@/lib/env/client";
import type {
  ClientErrorTelemetryEvent,
  ClientTelemetryEvent,
  WebVitalTelemetryEvent,
} from "./schemas";
import { createBrowserTraceparent } from './trace';

const TELEMETRY_ROUTE = "/api/telemetry";
const MAX_MESSAGE_LENGTH = 500;
const duplicateWindowMs = 30_000;
const recentFingerprints = new Map<string, number>();

interface WebVitalMetricLike {
  id: string;
  name: WebVitalTelemetryEvent["name"];
  value: number;
  delta: number;
  rating?: WebVitalTelemetryEvent["rating"];
  navigationType?: string;
}

interface ClientErrorOptions {
  source: ClientErrorTelemetryEvent["source"];
  digest?: string;
  fatal?: boolean;
}

function routePath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function sanitizeUrl(value: string): string {
  return value.replace(
    /https?:\/\/[^\s)]+/gi,
    (match) => {
      try {
        const url = new URL(match);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "[url]";
      }
    },
  );
}

export function sanitizeTelemetryMessage(value: string): string {
  return sanitizeUrl(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown client error";
  }
}

function shouldSampleWebVital(): boolean {
  const rate = clientEnv.NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE;
  return rate >= 1 || (rate > 0 && Math.random() < rate);
}

function isDuplicate(event: ClientTelemetryEvent): boolean {
  const fingerprint =
    event.type === "client-error"
      ? `${event.type}:${event.source}:${event.route}:${event.message}:${event.digest ?? ""}`
      : `${event.type}:${event.metricId}:${event.name}`;
  const now = Date.now();
  const previous = recentFingerprints.get(fingerprint);
  recentFingerprints.set(fingerprint, now);

  for (const [key, timestamp] of recentFingerprints) {
    if (now - timestamp > duplicateWindowMs) recentFingerprints.delete(key);
  }

  return previous !== undefined && now - previous < duplicateWindowMs;
}

function sendTelemetry(event: ClientTelemetryEvent): void {
  if (!clientEnv.NEXT_PUBLIC_TELEMETRY_ENABLED || isDuplicate(event)) return;

  const body = JSON.stringify(event);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const accepted = navigator.sendBeacon(
        TELEMETRY_ROUTE,
        new Blob([body], { type: "application/json" }),
      );
      if (accepted) return;
    }

    void fetch(TELEMETRY_ROUTE, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json", traceparent: createBrowserTraceparent() },
      body,
    }).catch(() => undefined);
  } catch {
    // Observability must never interrupt the application or error recovery UI.
  }
}

export function reportWebVital(metric: WebVitalMetricLike): void {
  if (!shouldSampleWebVital()) return;
  sendTelemetry({
    type: "web-vital",
    eventId: crypto.randomUUID(),
    metricId: metric.id.slice(0, 200),
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigationType: metric.navigationType?.slice(0, 80),
    route: routePath(),
    release: clientEnv.NEXT_PUBLIC_RELEASE_VERSION,
    timestamp: new Date().toISOString(),
  });
}

export function reportClientError(error: unknown, options: ClientErrorOptions): void {
  const message = sanitizeTelemetryMessage(messageFromUnknown(error));
  if (!message) return;

  sendTelemetry({
    type: "client-error",
    eventId: crypto.randomUUID(),
    message,
    source: options.source,
    digest: options.digest?.slice(0, 200),
    fatal: options.fatal ?? false,
    route: routePath(),
    release: clientEnv.NEXT_PUBLIC_RELEASE_VERSION,
    timestamp: new Date().toISOString(),
  });
}
