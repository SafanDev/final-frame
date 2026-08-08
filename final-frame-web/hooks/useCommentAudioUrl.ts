"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { getCachedCommentAudioUrl } from "@/lib/storage/signed-url-cache";

interface CommentAudioState {
  url: string;
  isLoading: boolean;
  error: string | null;
  requestId: string | null;
  load: () => Promise<string | null>;
  refresh: () => Promise<string | null>;
}

export function useCommentAudioUrl(
  projectId: string,
  assetId: string,
  commentId: string,
  enabled: boolean,
  initialUrl = "",
): CommentAudioState {
  const sequenceRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const [url, setUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const request = useCallback(async (forceRefresh: boolean): Promise<string | null> => {
    if (!enabled) return null;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++sequenceRef.current;
    setIsLoading(true);
    setError(null);
    setRequestId(null);

    try {
      const nextUrl = await getCachedCommentAudioUrl(projectId, assetId, commentId, {
        signal: controller.signal,
        forceRefresh,
      });
      if (sequence === sequenceRef.current) setUrl(nextUrl);
      return nextUrl;
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      if (!controller.signal.aborted && sequence === sequenceRef.current) {
        setError(getUserFacingErrorMessage(caught, "The voice note could not be loaded."));
        setRequestId(normalized.requestId);
      }
      return null;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (sequence === sequenceRef.current) setIsLoading(false);
    }
  }, [assetId, commentId, enabled, projectId]);

  useEffect(() => {
    sequenceRef.current += 1;
    controllerRef.current?.abort();
    setUrl(initialUrl);
    setError(null);
    setRequestId(null);
    setIsLoading(false);
    return () => controllerRef.current?.abort();
  }, [assetId, commentId, initialUrl, projectId]);

  return {
    url,
    isLoading,
    error,
    requestId,
    load: useCallback(() => request(false), [request]),
    refresh: useCallback(() => request(true), [request]),
  };
}
