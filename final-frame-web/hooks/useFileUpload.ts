"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import { uploadAssetFile, type UploadProgress, type UploadStage } from "@/lib/api/uploads";
import { normalizeAssetFileName, validateAssetFile } from "@/lib/assets/file-policy";
import type { AssetMutationResponse } from "@/lib/api/types";

interface UploadAttempt {
  projectId: string;
  file: File;
  stackFileName?: string;
  expectedVersion: number;
}

interface UploadState {
  fileName: string | null;
  stage: UploadStage | null;
  progress: UploadProgress;
  error: string | null;
  requestId: string | null;
  retryable: boolean;
}

const idleProgress: UploadProgress = { loadedBytes: 0, totalBytes: 0, percentage: 0 };

export function useFileUpload() {
  const activeController = useRef<AbortController | null>(null);
  const lastAttempt = useRef<UploadAttempt | null>(null);
  const [state, setState] = useState<UploadState>({
    fileName: null,
    stage: null,
    progress: idleProgress,
    error: null,
    requestId: null,
    retryable: false,
  });

  useEffect(() => () => activeController.current?.abort(), []);

  const cancelUpload = useCallback(() => {
    activeController.current?.abort(new DOMException("The upload was cancelled.", "AbortError"));
  }, []);

  const resetUpload = useCallback(() => {
    if (activeController.current) return;
    lastAttempt.current = null;
    setState({ fileName: null, stage: null, progress: idleProgress, error: null, requestId: null, retryable: false });
  }, []);

  const uploadAsset = useCallback(async (
    projectId: string,
    file: File,
    expectedVersion: number,
    stackFileName?: string,
  ): Promise<AssetMutationResponse> => {
    const validation = validateAssetFile(file);
    if (!validation.valid) {
      lastAttempt.current = null;
      setState({
        fileName: file.name,
        stage: null,
        progress: { loadedBytes: 0, totalBytes: file.size, percentage: 0 },
        error: validation.message,
        requestId: null,
        retryable: false,
      });
      throw new ApiError({
        message: validation.message ?? "The selected file is invalid.",
        kind: "contract",
        code: "ASSET_FILE_INVALID",
        retryable: false,
      });
    }

    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const normalizedStackName = stackFileName ? normalizeAssetFileName(stackFileName) : undefined;
    lastAttempt.current = { projectId, file, stackFileName: normalizedStackName, expectedVersion };
    setState({
      fileName: file.name,
      stage: "reserving",
      progress: { loadedBytes: 0, totalBytes: file.size, percentage: 0 },
      error: null,
      requestId: null,
      retryable: false,
    });

    try {
      const asset = await uploadAssetFile({
        projectId,
        file,
        stackFileName: normalizedStackName,
        expectedVersion,
        signal: controller.signal,
        onStageChange: (stage) => setState((previous) => ({ ...previous, stage })),
        onProgress: (progress) => setState((previous) => ({ ...previous, progress })),
      });
      setState((previous) => ({ ...previous, stage: null, progress: { ...previous.progress, percentage: 100 }, retryable: false }));
      return asset;
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      if (normalized.kind === "aborted") {
        setState({ fileName: null, stage: null, progress: idleProgress, error: null, requestId: null, retryable: false });
      } else {
        setState((previous) => ({
          ...previous,
          stage: null,
          error: getUserFacingErrorMessage(caught, "The file could not be uploaded."),
          requestId: normalized.requestId,
          retryable: normalized.retryable,
        }));
      }
      throw caught;
    } finally {
      if (activeController.current === controller) activeController.current = null;
    }
  }, []);

  const retryUpload = useCallback(async (): Promise<AssetMutationResponse | null> => {
    const attempt = lastAttempt.current;
    if (!attempt || !state.retryable) return null;
    return uploadAsset(attempt.projectId, attempt.file, attempt.expectedVersion, attempt.stackFileName);
  }, [state.retryable, uploadAsset]);

  return {
    uploadAsset,
    retryUpload,
    cancelUpload,
    resetUpload,
    fileName: state.fileName,
    stage: state.stage,
    progress: state.progress,
    error: state.error,
    requestId: state.requestId,
    isUploading: state.stage !== null,
    canRetry: Boolean(lastAttempt.current && state.error && state.retryable),
  };
}
