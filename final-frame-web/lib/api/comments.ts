import { apiClient } from "./client";
import { resolveApiResourceUrl } from './resource-url';
import { withCursorQuery } from "./pagination";
import { apiRoutes } from "./routes";
import {
  commentAudioUrlResponseSchema,
  commentSchema,
  createPageSchema,
  messageResponseSchema,
  resolveCommentResponseSchema,
} from "./schemas";
import type {
  CommentAudioUrlResponse,
  CreateCommentInput,
  CursorPageQuery,
  MessageResponse,
  Page,
  ProjectComment,
  ResolveCommentResponse,
} from "./types";

const commentPageSchema = createPageSchema(commentSchema);

export async function listComments(
  projectId: string,
  assetId: string,
  query: CursorPageQuery = {},
  signal?: AbortSignal,
): Promise<Page<ProjectComment>> {
  const response = await apiClient.request(
    withCursorQuery(apiRoutes.comments.list(projectId, assetId), query),
    {
      schema: commentPageSchema,
      signal,
    },
  );
  return response.data;
}

export async function createComment(
  projectId: string,
  assetId: string,
  input: CreateCommentInput,
  signal?: AbortSignal,
): Promise<ProjectComment> {
  const response = await apiClient.request(
    apiRoutes.comments.create(projectId, assetId),
    {
      method: "POST",
      body: input,
      schema: commentSchema,
      signal,
    },
  );
  return response.data;
}

export async function updateComment(
  projectId: string,
  assetId: string,
  commentId: string,
  text: string,
  signal?: AbortSignal,
): Promise<ProjectComment> {
  const response = await apiClient.request(
    apiRoutes.comments.update(projectId, assetId, commentId),
    {
      method: "PUT",
      body: { text },
      schema: commentSchema,
      signal,
    },
  );
  return response.data;
}

export async function setCommentResolved(
  projectId: string,
  assetId: string,
  commentId: string,
  isResolved: boolean,
  signal?: AbortSignal,
): Promise<ResolveCommentResponse> {
  const response = await apiClient.request(
    apiRoutes.comments.resolve(projectId, assetId, commentId),
    {
      method: "PATCH",
      body: { isResolved },
      schema: resolveCommentResponseSchema,
      signal,
    },
  );
  return response.data;
}

export async function deleteComment(
  projectId: string,
  assetId: string,
  commentId: string,
  signal?: AbortSignal,
): Promise<MessageResponse> {
  const response = await apiClient.request(
    apiRoutes.comments.delete(projectId, assetId, commentId),
    {
      method: "DELETE",
      schema: messageResponseSchema,
      signal,
    },
  );
  return response.data;
}

export async function requestCommentAudioUrl(
  projectId: string,
  assetId: string,
  commentId: string,
  signal?: AbortSignal,
): Promise<CommentAudioUrlResponse> {
  const response = await apiClient.request(
    apiRoutes.comments.audio(projectId, assetId, commentId),
    {
      schema: commentAudioUrlResponseSchema,
      signal,
    },
  );
  return { ...response.data, url: resolveApiResourceUrl(response.data.url) };
}
