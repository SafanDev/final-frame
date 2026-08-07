import { requestSecureAssetUrl } from "@/lib/api/assets";
import { requestCommentAudioUrl } from "@/lib/api/comments";
import type { SecureAssetPurpose } from "@/lib/api/types";

const EXPIRY_SAFETY_WINDOW_MS = 30_000;

interface CachedUrl {
  url: string;
  expiresAt: number;
}

const assetCache = new Map<string, CachedUrl>();
const audioCache = new Map<string, CachedUrl>();
const inFlightAssetRequests = new Map<string, Promise<string>>();
const inFlightAudioRequests = new Map<string, Promise<string>>();
const assetInvalidationVersions = new Map<string, number>();
const audioInvalidationVersions = new Map<string, number>();
let cacheGeneration = 0;

function assetKey(assetId: string, purpose: SecureAssetPurpose): string {
  return `${assetId}:${purpose}`;
}

function audioKey(projectId: string, assetId: string, commentId: string): string {
  return `${projectId}:${assetId}:${commentId}`;
}

function isUsable(entry: CachedUrl | undefined): entry is CachedUrl {
  return Boolean(entry && entry.expiresAt - EXPIRY_SAFETY_WINDOW_MS > Date.now());
}

function invalidationVersion(versions: Map<string, number>, key: string): number {
  return versions.get(key) ?? 0;
}

function invalidateKey<T>(
  cache: Map<string, T>,
  inFlight: Map<string, Promise<string>>,
  versions: Map<string, number>,
  key: string,
): void {
  cache.delete(key);
  inFlight.delete(key);
  versions.set(key, invalidationVersion(versions, key) + 1);
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException("The request was aborted.", "AbortError");
}

function invalidatedRequestError(): Error {
  return new DOMException("The secure URL request was invalidated.", "AbortError");
}

function awaitForConsumer<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", handleAbort);
    });
  });
}

export async function getCachedAssetUrl(
  assetId: string,
  purpose: SecureAssetPurpose = "preview",
  options: { signal?: AbortSignal; forceRefresh?: boolean } = {},
): Promise<string> {
  const key = assetKey(assetId, purpose);
  const cached = assetCache.get(key);
  if (!options.forceRefresh && isUsable(cached)) return cached.url;

  const existing = inFlightAssetRequests.get(key);
  if (existing) return awaitForConsumer(existing, options.signal);

  // Shared requests deliberately do not inherit a component's AbortSignal. A
  // consumer may leave the screen without cancelling the same secure-URL fetch
  // for every other viewer waiting on it. Each consumer can still abandon its
  // own wait through awaitForConsumer().
  const requestGeneration = cacheGeneration;
  const requestVersion = invalidationVersion(assetInvalidationVersions, key);
  const request = requestSecureAssetUrl(assetId, purpose)
    .then((response) => {
      if (cacheGeneration !== requestGeneration
        || invalidationVersion(assetInvalidationVersions, key) !== requestVersion) {
        throw invalidatedRequestError();
      }
      assetCache.set(key, {
        url: response.url,
        expiresAt: Date.now() + response.expiresInSeconds * 1_000,
      });
      return response.url;
    })
    .finally(() => {
      if (inFlightAssetRequests.get(key) === request) {
        inFlightAssetRequests.delete(key);
      }
    });

  inFlightAssetRequests.set(key, request);
  return awaitForConsumer(request, options.signal);
}


export function peekCachedAssetUrl(
  assetId: string,
  purpose: SecureAssetPurpose = "preview",
): string {
  const cached = assetCache.get(assetKey(assetId, purpose));
  return isUsable(cached) ? cached.url : "";
}

export function prefetchAssetUrl(
  assetId: string,
  purpose: SecureAssetPurpose = "preview",
): void {
  if (!assetId || peekCachedAssetUrl(assetId, purpose)) return;
  void getCachedAssetUrl(assetId, purpose).catch(() => undefined);
}

export function invalidateAssetUrl(
  assetId: string,
  purpose?: SecureAssetPurpose,
): void {
  if (purpose) {
    const key = assetKey(assetId, purpose);
    invalidateKey(assetCache, inFlightAssetRequests, assetInvalidationVersions, key);
    return;
  }

  for (const key of [assetKey(assetId, "preview"), assetKey(assetId, "download")]) {
    invalidateKey(assetCache, inFlightAssetRequests, assetInvalidationVersions, key);
  }
}

export async function getCachedCommentAudioUrl(
  projectId: string,
  assetId: string,
  commentId: string,
  options: { signal?: AbortSignal; forceRefresh?: boolean } = {},
): Promise<string> {
  const key = audioKey(projectId, assetId, commentId);
  const cached = audioCache.get(key);
  if (!options.forceRefresh && isUsable(cached)) return cached.url;

  const existing = inFlightAudioRequests.get(key);
  if (existing) return awaitForConsumer(existing, options.signal);

  const requestGeneration = cacheGeneration;
  const requestVersion = invalidationVersion(audioInvalidationVersions, key);
  const request = requestCommentAudioUrl(projectId, assetId, commentId)
    .then((response) => {
      if (cacheGeneration !== requestGeneration
        || invalidationVersion(audioInvalidationVersions, key) !== requestVersion) {
        throw invalidatedRequestError();
      }
      audioCache.set(key, {
        url: response.url,
        expiresAt: Date.now() + response.expiresInSeconds * 1_000,
      });
      return response.url;
    })
    .finally(() => {
      if (inFlightAudioRequests.get(key) === request) {
        inFlightAudioRequests.delete(key);
      }
    });

  inFlightAudioRequests.set(key, request);
  return awaitForConsumer(request, options.signal);
}

export function invalidateCommentAudioUrl(
  projectId: string,
  assetId: string,
  commentId: string,
): void {
  const key = audioKey(projectId, assetId, commentId);
  invalidateKey(audioCache, inFlightAudioRequests, audioInvalidationVersions, key);
}

export function clearSignedUrlCaches(): void {
  cacheGeneration += 1;
  assetCache.clear();
  audioCache.clear();
  inFlightAssetRequests.clear();
  inFlightAudioRequests.clear();
  assetInvalidationVersions.clear();
  audioInvalidationVersions.clear();
}
