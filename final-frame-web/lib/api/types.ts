import type { z } from "zod";
import type {
  activityActionSchema,
  authCapabilitiesSchema,
  activityLogSchema,
  aiSummaryResponseSchema,
  apiErrorPayloadSchema,
  apiFieldErrorSchema,
  approvalEventSchema,
  assetDownloadResponseSchema,
  assetMutationResponseSchema,
  assetProcessingStatusSchema,
  assetProcessingSnapshotSchema,
  assetProcessingSnapshotResponseSchema,
  assetRenameResponseSchema,
  assetSchema,
  basicUserSchema,
  commentAnchorTypeSchema,
  commentAudioUrlResponseSchema,
  commentSchema,
  deleteAssetResponseSchema,
  inviteResponseSchema,
  joinInviteResponseSchema,
  loginResponseSchema,
  memberApproverResponseSchema,
  messageResponseSchema,
  pageInfoSchema,
  pendingInvitationSchema,
  projectListItemSchema,
  projectMemberSchema,
  projectMutationResponseSchema,
  projectStatusSchema,
  publicUserSchema,
  registerResponseSchema,
  resolveCommentResponseSchema,
  secureAssetUrlResponseSchema,
  multipartRefreshResponseSchema,
  uploadReservationSchema,
  projectRoleSchema,
  workspaceProjectSchema,
} from "./schemas";

export type ProjectRole = z.infer<typeof projectRoleSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type AssetProcessingStatus = z.infer<typeof assetProcessingStatusSchema>;
export type CommentAnchorType = z.infer<typeof commentAnchorTypeSchema>;
export type ActivityAction = z.infer<typeof activityActionSchema>;
export type BasicUser = z.infer<typeof basicUserSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
export type ProjectListItem = z.infer<typeof projectListItemSchema>;
export type ProjectMutationResponse = z.infer<typeof projectMutationResponseSchema>;
export type ProjectMember = z.infer<typeof projectMemberSchema>;
export type ProjectComment = z.infer<typeof commentSchema>;
export type ProjectAsset = z.infer<typeof assetSchema>;
export type AssetProcessingSnapshot = z.infer<typeof assetProcessingSnapshotSchema>;
export type AssetProcessingSnapshotResponse = z.infer<typeof assetProcessingSnapshotResponseSchema>;
export type AssetMutationResponse = z.infer<typeof assetMutationResponseSchema>;
export type ActivityLog = z.infer<typeof activityLogSchema>;
export type ApprovalEvent = z.infer<typeof approvalEventSchema>;
export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;
export type WorkspaceProject = z.infer<typeof workspaceProjectSchema>;
export type ApiFieldError = z.infer<typeof apiFieldErrorSchema>;
export type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>;
export type AuthCapabilities = z.infer<typeof authCapabilitiesSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type InviteResponse = z.infer<typeof inviteResponseSchema>;
export type JoinInviteResponse = z.infer<typeof joinInviteResponseSchema>;
export type UploadReservation = z.infer<typeof uploadReservationSchema>;
export type MultipartRefreshResponse = z.infer<typeof multipartRefreshResponseSchema>;
export type AssetRenameResponse = z.infer<typeof assetRenameResponseSchema>;
export type DeleteAssetResponse = z.infer<typeof deleteAssetResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type MemberApproverResponse = z.infer<typeof memberApproverResponseSchema>;
export type ResolveCommentResponse = z.infer<typeof resolveCommentResponseSchema>;
export type AiSummaryResponse = z.infer<typeof aiSummaryResponseSchema>;
export type SecureAssetUrlResponse = z.infer<typeof secureAssetUrlResponseSchema>;
export type AssetDownloadResponse = z.infer<typeof assetDownloadResponseSchema>;
export type CommentAudioUrlResponse = z.infer<typeof commentAudioUrlResponseSchema>;

export interface Page<T> {
  items: T[];
  pageInfo: PageInfo;
}

export interface ProjectListStats {
  matching: number;
  total: number;
  owned: number;
  shared: number;
  draft: number;
  inReview: number;
  changesRequested: number;
  approved: number;
}

export interface ProjectPage extends Page<ProjectListItem> {
  stats: ProjectListStats;
}

export interface CursorPageQuery {
  cursor?: string;
  limit?: number;
  q?: string;
  status?: ProjectStatus;
  archived?: "true" | "false" | "all";
  scope?: "all" | "owned" | "shared";
  sort?: "updated_desc" | "created_desc" | "title_asc";
}

export interface CreateProjectInput {
  title: string;
  description?: string;
}

export interface UpdateProjectInput {
  title?: string;
  description?: string | null;
  isDownloadUnlocked?: boolean;
  isArchived?: boolean;
  aiEnabled?: boolean;
  expectedVersion: number;
}

export interface TransitionProjectInput {
  status: ProjectStatus;
  reason?: string;
  expectedVersion: number;
}

export interface CreateInviteInput {
  email: string;
  canApprove?: boolean;
  expectedVersion: number;
}

export interface StartUploadInput {
  fileName: string;
  fileType: string;
  fileSize: number;
  expectedVersion: number;
}

export interface StartVoiceNoteUploadInput {
  fileName?: string;
  fileType: "audio/webm" | "audio/ogg" | "audio/mpeg" | "audio/wav";
  fileSize: number;
}

export interface CompleteAssetUploadInput {
  storageKey: string;
  originalFileName: string;
  fileType: string;
  fileSize: number;
  expectedVersion: number;
}

export interface CreateCommentInput {
  text?: string;
  anchorType: CommentAnchorType;
  xPos?: number | null;
  yPos?: number | null;
  pageNumber?: number | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  columnStart?: number | null;
  columnEnd?: number | null;
  audioKey?: string | null;
  timestamp?: number | null;
  isBlocking?: boolean;
}

export type DeleteAssetScope = "version" | "stack";
export type SecureAssetPurpose = "preview" | "download";
