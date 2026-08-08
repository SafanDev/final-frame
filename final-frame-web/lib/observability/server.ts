import { serverEnv } from "@/lib/env/server";
import type { ClientTelemetryEvent } from "./schemas";

interface ServerErrorInput {
  error: unknown;
  path: string;
  method: string;
  routePath: string;
  routeType: string;
  runtime: string;
}

interface TelemetryEnvelope {
  service: "final-frame-web";
  environment: typeof serverEnv.DEPLOYMENT_ENVIRONMENT;
  release: string;
  receivedAt: string;
  event: ClientTelemetryEvent | Record<string, unknown>;
}

function normalizeServerError(error: unknown): Error & { digest?: string } {
  if (error instanceof Error) return error;

  const normalized = new Error(
    typeof error === "string" && error.trim()
      ? error.trim().slice(0, 500)
      : "Unknown server error",
  ) as Error & { digest?: string };

  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string"
  ) {
    normalized.digest = error.digest.slice(0, 100);
  }

  return normalized;
}

function sanitizePath(path: string): string {
  try {
    return new URL(path, "https://finalframe.invalid").pathname.slice(0, 500);
  } catch {
    return "/unknown";
  }
}

function sanitizeServerMessage(message: string): string {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500);
}

async function createErrorDigest(
  error: Error,
  routePath: string,
): Promise<string> {
  const input = new TextEncoder().encode(
    `${error.name}:${error.message}:${routePath}`,
  );
  const hash = await globalThis.crypto.subtle.digest("SHA-256", input);

  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 24);
}

async function forwardEnvelope(envelope: TelemetryEnvelope): Promise<void> {
  if (!serverEnv.OBSERVABILITY_ENDPOINT) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "FinalFrame-Web-Observability/1.0",
  };
  if (serverEnv.OBSERVABILITY_TOKEN) {
    headers.Authorization = `Bearer ${serverEnv.OBSERVABILITY_TOKEN}`;
  }

  try {
    const response = await fetch(serverEnv.OBSERVABILITY_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(envelope),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok && serverEnv.OBSERVABILITY_LOG_TO_STDOUT) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "Observability provider rejected telemetry",
          status: response.status,
          release: serverEnv.RELEASE_VERSION,
        }),
      );
    }
  } catch (error) {
    if (serverEnv.OBSERVABILITY_LOG_TO_STDOUT) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "Observability provider could not be reached",
          error: error instanceof Error ? error.name : "UnknownError",
          release: serverEnv.RELEASE_VERSION,
        }),
      );
    }
  }
}

export async function recordClientTelemetry(event: ClientTelemetryEvent): Promise<void> {
  const envelope: TelemetryEnvelope = {
    service: "final-frame-web",
    environment: serverEnv.DEPLOYMENT_ENVIRONMENT,
    release: serverEnv.RELEASE_VERSION,
    receivedAt: new Date().toISOString(),
    event,
  };

  if (serverEnv.OBSERVABILITY_LOG_TO_STDOUT) {
    console.info(JSON.stringify({ level: "info", message: "client-telemetry", ...envelope }));
  }
  await forwardEnvelope(envelope);
}

export async function recordServerError(input: ServerErrorInput): Promise<void> {
  const error = normalizeServerError(input.error);
  const digest = error.digest || await createErrorDigest(error, input.routePath);

  const envelope: TelemetryEnvelope = {
    service: "final-frame-web",
    environment: serverEnv.DEPLOYMENT_ENVIRONMENT,
    release: serverEnv.RELEASE_VERSION,
    receivedAt: new Date().toISOString(),
    event: {
      type: "server-error",
      digest,
      name: error.name.slice(0, 100),
      message: sanitizeServerMessage(error.message || "Unknown server error"),
      path: sanitizePath(input.path),
      method: input.method.slice(0, 12),
      routePath: input.routePath.slice(0, 500),
      routeType: input.routeType.slice(0, 80),
      runtime: input.runtime.slice(0, 40),
    },
  };

  if (serverEnv.OBSERVABILITY_LOG_TO_STDOUT) {
    console.error(JSON.stringify({ level: "error", message: "server-error", ...envelope }));
  }
  await forwardEnvelope(envelope);
}
