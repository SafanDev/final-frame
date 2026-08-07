import { getAssetUploadMimeType } from "@/lib/assets/file-policy";
import { ApiError, normalizeApiError } from "./errors";
import {
  abortMultipartAssetUpload,
  completeAssetUpload,
  refreshMultipartAssetUpload,
  startAssetUpload,
  startVoiceNoteUpload,
} from "./assets";
import type { AssetMutationResponse, UploadReservation } from "./types";

export type UploadStage = "reserving" | "transferring" | "completing";

export interface UploadProgress {
  loadedBytes: number;
  totalBytes: number;
  percentage: number;
}

export interface UploadBinaryOptions {
  reservation: UploadReservation;
  data: Blob;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadAssetOptions {
  projectId: string;
  file: File;
  stackFileName?: string;
  expectedVersion: number;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
  onStageChange?: (stage: UploadStage) => void;
}

function assertBrowserUploadSupport(): void {
  if (typeof XMLHttpRequest === "undefined") {
    throw new ApiError({
      message: "File uploads are only available in a browser.",
      kind: "network",
      code: "UPLOAD_BROWSER_REQUIRED",
      retryable: false,
    });
  }
}

function isSuccessfulStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function uploadBlobToUrl({
  url,
  headers,
  data,
  signal,
  onProgress,
}: {
  url: string;
  headers: Readonly<Record<string, string>>;
  data: Blob;
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}): Promise<string | null> {
  assertBrowserUploadSupport();

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      callback();
    };

    const abort = () => {
      request.abort();
      finish(() => reject(normalizeApiError(
        signal?.reason ?? new DOMException("The upload was cancelled.", "AbortError"),
      )));
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    signal?.addEventListener("abort", abort, { once: true });
    request.open("PUT", url, true);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(event.loaded, event.total);
    });

    request.addEventListener("load", () => {
      if (isSuccessfulStatus(request.status)) {
        onProgress?.(data.size, data.size);
        finish(() => resolve(request.getResponseHeader("ETag")));
        return;
      }
      finish(() => reject(new ApiError({
        message: request.status === 403
          ? "The secure upload authorization expired or did not match the file."
          : "The file could not be transferred to secure storage.",
        kind: "http",
        status: request.status || null,
        code: request.status === 403 ? "UPLOAD_AUTHORIZATION_REJECTED" : "UPLOAD_TRANSFER_FAILED",
        retryable: request.status >= 500 || request.status === 0 || request.status === 403,
      })));
    });

    request.addEventListener("error", () => finish(() => reject(new ApiError({
      message: "The secure storage transfer failed. Check the connection and try again.",
      kind: "network",
      code: "UPLOAD_NETWORK_ERROR",
      retryable: true,
    }))));
    request.addEventListener("timeout", () => finish(() => reject(new ApiError({
      message: "The file upload took too long. Please try again.",
      kind: "timeout",
      code: "UPLOAD_TIMEOUT",
      retryable: true,
    }))));
    request.addEventListener("abort", () => finish(() => reject(new ApiError({
      message: "The upload was cancelled.",
      kind: "aborted",
      code: "UPLOAD_ABORTED",
      retryable: false,
    }))));

    request.timeout = 10 * 60 * 1_000;
    request.send(data);
  });
}

export async function uploadBinaryToReservation({
  reservation,
  data,
  signal,
  onProgress,
}: UploadBinaryOptions): Promise<void> {
  if (reservation.uploadMode !== "single" || !reservation.presignedData) {
    throw new ApiError({
      message: "The upload authorization is not a single-part transfer.",
      kind: "contract",
      code: "UPLOAD_MODE_MISMATCH",
      retryable: false,
    });
  }
  await uploadBlobToUrl({
    url: reservation.presignedData,
    headers: reservation.uploadHeaders,
    data,
    signal,
    onProgress: (loadedBytes, totalBytes) => onProgress?.({
      loadedBytes,
      totalBytes,
      percentage: Math.min(100, Math.round((loadedBytes / totalBytes) * 100)),
    }),
  });
}

async function uploadMultipartReservation({
  projectId,
  reservation,
  data,
  signal,
  onProgress,
}: UploadBinaryOptions & { projectId: string }): Promise<void> {
  if (reservation.uploadMode !== "multipart" || !reservation.multipart) {
    throw new ApiError({
      message: "The upload authorization does not include a multipart plan.",
      kind: "contract",
      code: "MULTIPART_PLAN_MISSING",
      retryable: false,
    });
  }

  let plan = reservation.multipart;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      plan = (await refreshMultipartAssetUpload(projectId, reservation.storageKey, signal)).multipart;
    }

    const completedBytes = plan.uploadedParts.reduce((total, part) => total + part.fileSize, 0);
    const active = new Map<number, number>();
    const report = () => {
      const loadedBytes = Math.min(data.size, completedBytes + [...active.values()].reduce((a, b) => a + b, 0));
      onProgress?.({
        loadedBytes,
        totalBytes: data.size,
        percentage: Math.min(100, Math.round((loadedBytes / data.size) * 100)),
      });
    };
    report();

    const queue = [...plan.parts];
    let failure: unknown;
    const worker = async () => {
      while (queue.length > 0 && !failure) {
        const part = queue.shift();
        if (!part) return;
        const offset = (part.partNumber - 1) * plan.partSize;
        const blob = data.slice(offset, Math.min(data.size, offset + plan.partSize));
        active.set(part.partNumber, 0);
        try {
          await uploadBlobToUrl({
            url: part.url,
            headers: part.uploadHeaders,
            data: blob,
            signal,
            onProgress: (loaded) => {
              active.set(part.partNumber, loaded);
              report();
            },
          });
          active.set(part.partNumber, blob.size);
          report();
        } catch (error) {
          failure = error;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
    if (!failure) {
      onProgress?.({ loadedBytes: data.size, totalBytes: data.size, percentage: 100 });
      return;
    }
    lastError = failure;
    const normalized = normalizeApiError(failure);
    if (!normalized.retryable || signal?.aborted) throw normalized;
  }
  throw normalizeApiError(lastError);
}

export async function uploadAssetFile({
  projectId,
  file,
  stackFileName,
  expectedVersion,
  signal,
  onProgress,
  onStageChange,
}: UploadAssetOptions): Promise<AssetMutationResponse> {
  const mimeType = getAssetUploadMimeType(file);
  if (!mimeType) {
    throw new ApiError({
      message: "This file type is not supported for secure review.",
      kind: "contract",
      code: "ASSET_FILE_TYPE_UNSUPPORTED",
      retryable: false,
    });
  }
  const originalFileName = stackFileName?.trim() || file.name;

  onStageChange?.("reserving");
  const reservation = await startAssetUpload(
    projectId,
    {
      fileName: originalFileName,
      fileType: mimeType,
      fileSize: file.size,
      expectedVersion,
    },
    signal,
  );

  onStageChange?.("transferring");
  try {
    if (reservation.uploadMode === 'multipart') {
      await uploadMultipartReservation({ projectId, reservation, data: file, signal, onProgress });
    } else {
      await uploadBinaryToReservation({ reservation, data: file, signal, onProgress });
    }
  } catch (error) {
    if (reservation.uploadMode === 'multipart' && signal?.aborted) {
      await abortMultipartAssetUpload(projectId, reservation.storageKey).catch(() => undefined);
    }
    throw error;
  }

  onStageChange?.("completing");
  return completeAssetUpload(
    projectId,
    {
      storageKey: reservation.storageKey,
      originalFileName,
      fileType: reservation.fileType,
      fileSize: reservation.fileSize,
      expectedVersion,
    },
    signal,
  );
}

function normalizeAudioMimeType(value: string): "audio/webm" | "audio/ogg" | "audio/mpeg" | "audio/wav" | null {
  const base = value.split(";", 1)[0]?.trim().toLowerCase();
  if (base === "audio/webm" || base === "audio/ogg" || base === "audio/mpeg" || base === "audio/wav") return base;
  return null;
}

function audioExtension(mimeType: string): string {
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
  return "webm";
}

export async function uploadVoiceNote(
  projectId: string,
  audio: Blob,
  options: {
    fileName?: string;
    signal?: AbortSignal;
    onProgress?: (progress: UploadProgress) => void;
  } = {},
): Promise<string> {
  const fileType = normalizeAudioMimeType(audio.type);
  if (!fileType) {
    throw new ApiError({
      message: "This browser recorded an unsupported voice-note format.",
      kind: "contract",
      code: "VOICE_NOTE_FORMAT_UNSUPPORTED",
      retryable: false,
    });
  }
  const reservation = await startVoiceNoteUpload(
    projectId,
    {
      fileName: options.fileName || `voice-note-${Date.now()}.${audioExtension(fileType)}`,
      fileType,
      fileSize: audio.size,
    },
    options.signal,
  );

  await uploadBinaryToReservation({
    reservation,
    data: audio,
    signal: options.signal,
    onProgress: options.onProgress,
  });

  return reservation.storageKey;
}
