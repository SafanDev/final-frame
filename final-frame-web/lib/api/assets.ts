import { apiClient } from "./client";
import { resolveApiResourceUrl } from './resource-url';
import { withCursorQuery } from "./pagination";
import { apiRoutes } from "./routes";
import {
  aiSummaryResponseSchema,
  assetDownloadResponseSchema,
  assetMutationResponseSchema,
  assetRenameResponseSchema,
  assetSchema,
  createPageSchema,
  deleteAssetResponseSchema,
  messageResponseSchema,
  multipartRefreshResponseSchema,
  secureAssetUrlResponseSchema,
  uploadReservationSchema,
} from "./schemas";
import type {
  AiSummaryResponse,
  AssetDownloadResponse,
  AssetMutationResponse,
  AssetRenameResponse,
  CompleteAssetUploadInput,
  CursorPageQuery,
  DeleteAssetResponse,
  DeleteAssetScope,
  MessageResponse,
  MultipartRefreshResponse,
  Page,
  ProjectAsset,
  SecureAssetPurpose,
  SecureAssetUrlResponse,
  StartUploadInput,
  StartVoiceNoteUploadInput,
  UploadReservation,
} from "./types";

const assetPageSchema = createPageSchema(assetSchema);

export async function listAssets(
  projectId: string,
  query: CursorPageQuery = {},
  signal?: AbortSignal,
): Promise<Page<ProjectAsset>> {
  const response = await apiClient.request(
    withCursorQuery(apiRoutes.assets.list(projectId), query),
    { schema: assetPageSchema, signal },
  );
  return response.data;
}

export async function startAssetUpload(
  projectId: string,
  input: StartUploadInput,
  signal?: AbortSignal,
): Promise<UploadReservation> {
  const response = await apiClient.request(apiRoutes.assets.uploadStart(projectId), {
    method: "POST",
    body: input,
    schema: uploadReservationSchema,
    signal,
  });
  return response.data;
}

export async function completeAssetUpload(
  projectId: string,
  input: CompleteAssetUploadInput,
  signal?: AbortSignal,
): Promise<AssetMutationResponse> {
  const response = await apiClient.request(apiRoutes.assets.uploadComplete(projectId), {
    method: "POST",
    body: input,
    schema: assetMutationResponseSchema,
    signal,
  });
  return response.data;
}

export async function refreshMultipartAssetUpload(
  projectId: string,
  storageKey: string,
  signal?: AbortSignal,
): Promise<MultipartRefreshResponse> {
  const response = await apiClient.request(apiRoutes.assets.multipartRefresh(projectId), {
    method: 'POST',
    body: { storageKey },
    schema: multipartRefreshResponseSchema,
    signal,
  });
  return response.data;
}

export async function abortMultipartAssetUpload(
  projectId: string,
  storageKey: string,
  signal?: AbortSignal,
): Promise<MessageResponse> {
  const response = await apiClient.request(apiRoutes.assets.multipartAbort(projectId), {
    method: 'DELETE',
    body: { storageKey },
    schema: messageResponseSchema,
    signal,
  });
  return response.data;
}

export async function startVoiceNoteUpload(
  projectId: string,
  input: StartVoiceNoteUploadInput,
  signal?: AbortSignal,
): Promise<UploadReservation> {
  const response = await apiClient.request(apiRoutes.assets.voiceUpload(projectId), {
    method: "POST",
    body: input,
    schema: uploadReservationSchema,
    signal,
  });
  return response.data;
}

export async function renameAssetStack(
  projectId: string,
  assetId: string,
  fileName: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<AssetRenameResponse> {
  const response = await apiClient.request(apiRoutes.assets.update(projectId, assetId), {
    method: "PUT",
    body: { fileName, expectedVersion },
    schema: assetRenameResponseSchema,
    signal,
  });
  return response.data;
}

export async function retryAssetProcessing(
  projectId: string,
  assetId: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<MessageResponse> {
  const response = await apiClient.request(apiRoutes.assets.retryProcessing(projectId, assetId), {
    method: "POST",
    body: { expectedVersion },
    schema: messageResponseSchema,
    signal,
  });
  return response.data;
}

export async function deleteAsset(
  projectId: string,
  assetId: string,
  scope: DeleteAssetScope,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<DeleteAssetResponse> {
  const response = await apiClient.request(apiRoutes.assets.delete(projectId, assetId), {
    method: "DELETE",
    body: { scope, expectedVersion },
    schema: deleteAssetResponseSchema,
    signal,
  });
  return response.data;
}

export async function generateAssetSummary(
  projectId: string,
  assetId: string,
  signal?: AbortSignal,
): Promise<AiSummaryResponse> {
  const response = await apiClient.request(apiRoutes.assets.summary(projectId, assetId), {
    method: "POST",
    schema: aiSummaryResponseSchema,
    signal,
    timeoutMs: 35_000,
  });
  return response.data;
}

export async function requestAssetDownload(
  projectId: string,
  assetId: string,
  signal?: AbortSignal,
): Promise<AssetDownloadResponse> {
  const response = await apiClient.request(apiRoutes.assets.download(projectId, assetId), {
    schema: assetDownloadResponseSchema,
    signal,
  });
  return { ...response.data, downloadUrl: resolveApiResourceUrl(response.data.downloadUrl) };
}

export async function requestSecureAssetUrl(
  assetId: string,
  purpose: SecureAssetPurpose = "preview",
  signal?: AbortSignal,
): Promise<SecureAssetUrlResponse> {
  const response = await apiClient.request(apiRoutes.media.secureUrl, {
    method: "POST",
    body: { assetId, purpose },
    schema: secureAssetUrlResponseSchema,
    signal,
  });
  return { ...response.data, url: resolveApiResourceUrl(response.data.url) };
}
