"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getUserFacingErrorMessage } from "@/lib/api/errors";
import { getCachedAssetUrl, peekCachedAssetUrl } from "@/lib/storage/signed-url-cache";
import type { SecureAssetPurpose } from "@/lib/api/types";

interface SecureAssetUrlState {
  url: string;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<string | null>;
}

export function useSecureAssetUrl(
  assetId: string | null | undefined,
  purpose: SecureAssetPurpose = "preview",
): SecureAssetUrlState {
  const synchronousCachedUrl = assetId ? peekCachedAssetUrl(assetId, purpose) : "";
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const automaticRetryRef = useRef<string | null>(null);
  const [url, setUrl] = useState(synchronousCachedUrl);
  const [isLoading, setIsLoading] = useState(Boolean(assetId && !synchronousCachedUrl));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false): Promise<string | null> => {
    controllerRef.current?.abort();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!assetId) {
      setUrl("");
      setError(null);
      setIsLoading(false);
      return null;
    }

    const requestedAssetId = assetId;
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);

    async function requestSecureUrl(
      refreshRequested: boolean,
      allowAutomaticRetry: boolean,
    ): Promise<string | null> {
      try {
        const nextUrl = await getCachedAssetUrl(requestedAssetId, purpose, {
          signal: controller.signal,
          forceRefresh: refreshRequested,
        });

        if (sequence === requestSequence.current) {
          setUrl(nextUrl);
          automaticRetryRef.current = null;
        }
        return nextUrl;
      } catch (caught) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return null;

        const message = getUserFacingErrorMessage(caught, "The secure preview could not be loaded.");
        if (allowAutomaticRetry && automaticRetryRef.current !== requestedAssetId && navigator.onLine) {
          automaticRetryRef.current = requestedAssetId;
          await new Promise<void>((resolve) => {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              resolve();
            }, 650);
          });

          if (controller.signal.aborted || sequence !== requestSequence.current) return null;
          return requestSecureUrl(true, false);
        }

        setError(message);
        return null;
      }
    }

    try {
      return await requestSecureUrl(forceRefresh, true);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [assetId, purpose]);

  useEffect(() => {
    requestSequence.current += 1;
    controllerRef.current?.abort();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    automaticRetryRef.current = null;
    const cached = assetId ? peekCachedAssetUrl(assetId, purpose) : "";
    setUrl(cached);
    setError(null);
    if (assetId && !cached) void load(false);
    else setIsLoading(false);

    return () => {
      controllerRef.current?.abort();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [assetId, load, purpose]);

  const refresh = useCallback(() => load(true), [load]);
  return { url, isLoading, error, refresh };
}
