import { apiClient } from "./client";
import { withCursorQuery } from "./pagination";
import { apiRoutes } from "./routes";
import { downloadApiArtifact } from "./download";
import {
  activityLogSchema,
  createPageSchema,
  inviteResponseSchema,
  joinInviteResponseSchema,
  memberApproverResponseSchema,
  messageResponseSchema,
  projectListItemSchema,
  projectMutationResponseSchema,
  projectPageSchema,
  workspaceProjectSchema,
} from "./schemas";
import type {
  ActivityLog,
  CreateInviteInput,
  CreateProjectInput,
  CursorPageQuery,
  InviteResponse,
  JoinInviteResponse,
  MemberApproverResponse,
  MessageResponse,
  Page,
  ProjectListItem,
  ProjectMutationResponse,
  ProjectPage,
  TransitionProjectInput,
  UpdateProjectInput,
  WorkspaceProject,
} from "./types";

const activityPageSchema = createPageSchema(activityLogSchema);

export async function listProjects(
  query: CursorPageQuery = {},
  signal?: AbortSignal,
): Promise<ProjectPage> {
  const response = await apiClient.request(
    withCursorQuery(apiRoutes.projects.list, query),
    { schema: projectPageSchema, signal },
  );
  return response.data;
}

export async function createProject(
  input: CreateProjectInput,
  signal?: AbortSignal,
): Promise<ProjectListItem> {
  const response = await apiClient.request(apiRoutes.projects.create, {
    method: "POST",
    body: input,
    schema: projectListItemSchema,
    signal,
  });
  return response.data;
}

export async function loadWorkspace(projectId: string, signal?: AbortSignal): Promise<WorkspaceProject> {
  const response = await apiClient.request(apiRoutes.projects.workspace(projectId), {
    schema: workspaceProjectSchema,
    signal,
  });
  return response.data;
}

export async function loadProjectActivity(
  projectId: string,
  query: CursorPageQuery = {},
  signal?: AbortSignal,
): Promise<Page<ActivityLog>> {
  const response = await apiClient.request(withCursorQuery(apiRoutes.projects.activity(projectId), query), {
    schema: activityPageSchema,
    signal,
  });
  return response.data;
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
  signal?: AbortSignal,
): Promise<ProjectListItem> {
  const response = await apiClient.request(apiRoutes.projects.update(projectId), {
    method: "PUT",
    body: input,
    schema: projectListItemSchema,
    signal,
  });
  return response.data;
}

export async function transitionProjectReview(
  projectId: string,
  input: TransitionProjectInput,
  signal?: AbortSignal,
): Promise<ProjectMutationResponse> {
  const response = await apiClient.request(apiRoutes.projects.review(projectId), {
    method: "POST",
    body: input,
    schema: projectMutationResponseSchema,
    signal,
  });
  return response.data;
}

export async function selectFinalAsset(
  projectId: string,
  assetId: string | null,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<ProjectMutationResponse> {
  const response = await apiClient.request(apiRoutes.projects.finalAsset(projectId), {
    method: "PATCH",
    body: { assetId, expectedVersion },
    schema: projectMutationResponseSchema,
    signal,
  });
  return response.data;
}

export async function deleteProject(
  projectId: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<MessageResponse> {
  const response = await apiClient.request(apiRoutes.projects.delete(projectId), {
    method: "DELETE",
    body: { expectedVersion },
    schema: messageResponseSchema,
    signal,
  });
  return response.data;
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<MessageResponse> {
  const response = await apiClient.request(apiRoutes.projects.member(projectId, userId), {
    method: "DELETE",
    body: { expectedVersion },
    schema: messageResponseSchema,
    signal,
  });
  return response.data;
}

export async function setProjectMemberApprover(
  projectId: string,
  userId: string,
  isApprover: boolean,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<MemberApproverResponse> {
  const response = await apiClient.request(apiRoutes.projects.memberApprover(projectId, userId), {
    method: "PATCH",
    body: { isApprover, expectedVersion },
    schema: memberApproverResponseSchema,
    signal,
  });
  return response.data;
}

export async function createProjectInvite(
  projectId: string,
  input: CreateInviteInput,
  signal?: AbortSignal,
): Promise<InviteResponse> {
  const response = await apiClient.request(apiRoutes.projects.invitations(projectId), {
    method: "POST",
    body: input,
    schema: inviteResponseSchema,
    signal,
  });
  return response.data;
}

export async function revokeProjectInvite(
  projectId: string,
  invitationId: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<MessageResponse> {
  const response = await apiClient.request(apiRoutes.projects.invitation(projectId, invitationId), {
    method: "DELETE",
    body: { expectedVersion },
    schema: messageResponseSchema,
    signal,
  });
  return response.data;
}

export async function joinProjectInvite(token: string, signal?: AbortSignal): Promise<JoinInviteResponse> {
  const response = await apiClient.request(apiRoutes.projects.joinInvite, {
    method: "POST",
    body: { token },
    schema: joinInviteResponseSchema,
    signal,
  });
  return response.data;
}

export function downloadProjectAudit(projectId: string, signal?: AbortSignal): Promise<void> {
  return downloadApiArtifact(apiRoutes.projects.auditExport(projectId), { fallbackFileName: "project-audit.ndjson", signal, accept: "application/x-ndjson" });
}

export function downloadApprovalCertificate(
  projectId: string,
  approvalEventId: string,
  signal?: AbortSignal,
): Promise<void> {
  return downloadApiArtifact(apiRoutes.projects.approvalCertificate(projectId, approvalEventId), {
    fallbackFileName: "approval-certificate.json",
    signal,
    accept: "application/json",
  });
}
