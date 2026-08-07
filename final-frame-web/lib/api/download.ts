import { clientEnv } from "@/lib/env/client";
import { createLinkedAbortSignal } from "@/lib/utils/abort";
import { sessionExpiredEventName } from "./client";
import { createHttpApiError } from "./errors";
import { safeDownloadName } from "./download-name";
import { createBrowserTraceparent } from '@/lib/observability/trace';

interface DownloadApiArtifactOptions {
  fallbackFileName: string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  accept?: string;
  timeoutMs?: number;
}

function requestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ff-download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function responseFileName(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/iu)?.[1];
  const quotedName = disposition.match(/filename="([^"]+)"/iu)?.[1];
  let candidate = quotedName || fallback;
  if (encodedName) {
    try {
      candidate = decodeURIComponent(encodedName);
    } catch {
      candidate = fallback;
    }
  }
  return safeDownloadName(candidate, fallback);
}

async function errorPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function downloadApiArtifact(
  route: string,
  options: DownloadApiArtifactOptions,
): Promise<void> {
  const linked = createLinkedAbortSignal(options.signal, options.timeoutMs ?? 120_000);
  const headers = new Headers({
    Accept: options.accept ?? "application/octet-stream",
    "X-Request-Id": requestId(),
    traceparent: createBrowserTraceparent(),
  });
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(`${clientEnv.NEXT_PUBLIC_API_URL}${route}`, {
      method: options.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers,
      body,
      signal: linked.signal,
    });

    if (!response.ok) {
      const error = createHttpApiError({
        status: response.status,
        statusText: response.statusText,
        payload: await errorPayload(response),
        requestId: response.headers.get("X-Request-Id"),
      });
      if (response.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(sessionExpiredEventName, { detail: error }));
      }
      throw error;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    let anchor: HTMLAnchorElement | null = null;
    try {
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = responseFileName(response, options.fallbackFileName);
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
    } finally {
      anchor?.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
  } finally {
    linked.dispose();
  }
}
