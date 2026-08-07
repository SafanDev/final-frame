import { z } from "zod";

export const projectRoleSchema = z.enum(["DESIGNER", "CLIENT"]);
export const accountStatusSchema = z.enum(["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED", "DELETED"]);
export const projectStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"]);
export const projectDeletionStatusSchema = z.enum(["ACTIVE", "DELETING", "DELETED"]);
export const assetProcessingStatusSchema = z.enum(["PENDING", "PROCESSING", "CLEAN", "REJECTED"]);
export const commentAnchorTypeSchema = z.enum(["GENERAL", "POINT", "PDF_POINT", "CODE_RANGE", "VIDEO_POINT"]);
export const invitationStatusSchema = z.enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]);
export const emailDeliveryStatusSchema = z.enum(["PENDING", "PROCESSING", "SENT", "FAILED", "ABANDONED", "CANCELLED"]);
export const notificationDeliveryModeSchema = z.enum(["IMMEDIATE", "DAILY_DIGEST", "IN_APP_ONLY"]);
export const notificationTypeSchema = z.enum(["INVITED", "MEMBER_JOINED", "COMMENT_ADDED", "COMMENT_RESOLVED", "REVIEW_SUBMITTED", "CHANGES_REQUESTED", "PROJECT_APPROVED", "ACCESS_REVOKED"]);
export const approvalDecisionSchema = z.enum(["SUBMITTED", "WITHDRAWN", "CHANGES_REQUESTED", "APPROVED", "REOPENED"]);

export const activityActionSchema = z.enum([
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
  "PROJECT_STATUS_CHANGED",
  "PROJECT_ARCHIVED",
  "PROJECT_REOPENED",
  "PROJECT_DELETE_REQUESTED",
  "PROJECT_DELETED",
  "DOWNLOAD_UNLOCKED",
  "DOWNLOAD_REVOKED",
  "MEMBER_ADDED",
  "MEMBER_REMOVED",
  "MEMBER_APPROVER_CHANGED",
  "INVITE_CREATED",
  "INVITE_SENT",
  "INVITE_ACCEPTED",
  "INVITE_REVOKED",
  "ASSET_UPLOADED",
  "ASSET_PROCESSING_FAILED",
  "ASSET_RENAMED",
  "ASSET_DELETED",
  "COMMENT_ADDED",
  "COMMENT_EDITED",
  "COMMENT_RESOLVED",
  "COMMENT_REOPENED",
  "COMMENT_DELETED",
  "REVIEW_SUBMITTED",
  "REVIEW_WITHDRAWN",
  "CHANGES_REQUESTED",
  "PROJECT_APPROVED",
  "PROJECT_AUDIT_EXPORTED",
  "AI_ENABLED",
  "AI_DISABLED",
  "ACCOUNT_EXPORT_REQUESTED",
  "ACCOUNT_DELETION_REQUESTED",
]);

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const identifierSchema = z.string().trim().min(1).max(191);
export const nullableIdentifierSchema = identifierSchema.nullable();

export const pageInfoSchema = z.object({
  hasMore: z.boolean(),
  nextCursor: identifierSchema.nullable(),
});

export const createPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pageInfo: pageInfoSchema,
  });

export const apiFieldErrorSchema = z.object({ path: z.string(), message: z.string() });
export const apiErrorPayloadSchema = z.object({
  error: z.string().min(1),
  code: z.string().min(1),
  requestId: z.string().min(1).optional(),
  fields: z.array(apiFieldErrorSchema).optional(),
});

export const basicUserSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(120),
  email: z.string().email().optional(),
});

export const publicUserSchema = basicUserSchema.extend({
  email: z.string().email(),
  status: accountStatusSchema,
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  sessionVersion: z.number().int().positive(),
  mfaEnabled: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const projectCountsSchema = z.object({
  assets: z.number().int().nonnegative(),
  members: z.number().int().nonnegative(),
  activityLogs: z.number().int().nonnegative().optional(),
  invitations: z.number().int().nonnegative().optional(),
});

export const projectListItemSchema = z.object({
  id: identifierSchema,
  title: z.string().max(100),
  description: z.string().max(1_000).nullable(),
  status: projectStatusSchema,
  version: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  isArchived: z.boolean(),
  isDownloadUnlocked: z.boolean(),
  aiEnabled: z.boolean(),
  ownerId: identifierSchema,
  finalAssetId: nullableIdentifierSchema,
  deletionStatus: projectDeletionStatusSchema,
  owner: basicUserSchema.optional(),
  _count: projectCountsSchema,
});

export const projectMemberSchema = z.object({
  id: identifierSchema,
  userId: identifierSchema,
  isApprover: z.boolean(),
  joinedAt: isoDateTimeSchema,
  user: basicUserSchema,
});

export const commentSchema = z.object({
  id: identifierSchema,
  text: z.string().max(5_000),
  anchorType: commentAnchorTypeSchema,
  xPos: z.number().finite().min(0).max(100).nullable(),
  yPos: z.number().finite().min(0).max(100).nullable(),
  pageNumber: z.number().int().positive().nullable(),
  lineStart: z.number().int().positive().nullable(),
  lineEnd: z.number().int().positive().nullable(),
  columnStart: z.number().int().nonnegative().nullable(),
  columnEnd: z.number().int().nonnegative().nullable(),
  hasAudio: z.boolean(),
  audioMimeType: z.string().max(120).nullable(),
  audioUrl: z.string().url().optional(),
  timestamp: z.number().finite().nonnegative().nullable(),
  isBlocking: z.boolean(),
  isResolved: z.boolean(),
  isDeleted: z.boolean(),
  editedAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  assetId: identifierSchema,
  authorId: nullableIdentifierSchema,
  author: basicUserSchema.nullable().optional(),
});

export const activityDetailsSchema = z.object({ message: z.string().optional() }).catchall(z.unknown());
export const activityLogSchema = z.object({
  id: identifierSchema,
  projectId: identifierSchema,
  userId: nullableIdentifierSchema,
  action: activityActionSchema,
  details: activityDetailsSchema,
  createdAt: isoDateTimeSchema,
  user: basicUserSchema.nullable().optional(),
});

export const assetSchema = z.object({
  id: identifierSchema,
  fileName: z.string().min(1).max(255),
  normalizedName: z.string().min(1).max(255),
  stackKey: z.string().min(1).max(191),
  mimeType: z.string().min(1).max(120),
  fileSize: z.number().int().positive(),
  previewMimeType: z.string().min(1).max(120).nullable(),
  previewFileSize: z.number().int().positive().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().finite().nonnegative().nullable(),
  processingStatus: assetProcessingStatusSchema,
  processingError: z.string().max(500).nullable(),
  version: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  projectId: identifierSchema,
  comments: z.array(commentSchema).optional().default([]),
  commentPageInfo: pageInfoSchema.optional(),
});

export const approvalEventSchema = z.object({
  id: identifierSchema,
  decision: approvalDecisionSchema,
  projectVersion: z.number().int().positive(),
  assetId: nullableIdentifierSchema,
  reason: z.string().max(2_000).nullable(),
  snapshot: z.unknown(),
  certificateDigest: z.string().length(64).nullable().optional(),
  certificateSignature: z.string().max(200).nullable().optional(),
  certificatePublicKey: z.string().max(100).nullable().optional(),
  certificateKeyId: z.string().max(80).nullable().optional(),
  createdAt: isoDateTimeSchema,
  actor: basicUserSchema.nullable().optional(),
});

export const pendingInvitationSchema = z.object({
  id: identifierSchema,
  invitedEmail: z.string().email(),
  canApprove: z.boolean(),
  expiresAt: isoDateTimeSchema,
  deliveryStatus: emailDeliveryStatusSchema,
  deliveryAttempts: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
});

export const finalAssetSchema = z.object({
  id: identifierSchema,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  fileSize: z.number().int().positive(),
  previewMimeType: z.string().min(1).max(120).nullable(),
  previewFileSize: z.number().int().positive().nullable(),
  processingStatus: assetProcessingStatusSchema,
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().finite().nonnegative().nullable(),
  version: z.number().int().positive(),
});

export const workspaceProjectSchema = projectListItemSchema.extend({
  owner: basicUserSchema,
  isOwner: z.boolean(),
  isApprover: z.boolean(),
  members: z.array(projectMemberSchema),
  assets: z.array(assetSchema),
  activityLogs: z.array(activityLogSchema),
  approvalEvents: z.array(approvalEventSchema),
  latestSignedApproval: approvalEventSchema.nullable(),
  pendingInvitations: z.array(pendingInvitationSchema),
  finalAsset: finalAssetSchema.nullable(),
  pageInfo: z.object({
    assets: pageInfoSchema,
    activityLogs: pageInfoSchema,
  }),
});

export const projectListStatsSchema = z.object({
  matching: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  owned: z.number().int().nonnegative(),
  shared: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  inReview: z.number().int().nonnegative(),
  changesRequested: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
});

export const projectPageSchema = createPageSchema(projectListItemSchema).extend({
  stats: projectListStatsSchema,
});

export const projectMutationResponseSchema = projectListItemSchema.partial().extend({
  id: identifierSchema,
  version: z.number().int().positive(),
});

export const authCapabilitiesSchema = z.object({
  emailDelivery: z.boolean(),
  emailVerificationRequired: z.boolean(),
});

export const registerResponseSchema = z.object({
  message: z.string(),
  accepted: z.literal(true),
  nextStep: z.enum(["VERIFY_EMAIL", "SIGN_IN"]),
});
export const loginResponseSchema = z.object({ message: z.string(), user: publicUserSchema });
export const messageResponseSchema = z.object({
  message: z.string().min(1),
  sessionRevoked: z.boolean().optional(),
  projectVersion: z.number().int().positive().optional(),
});
export const accountProfileSchema = z.object({
  id: identifierSchema,
  name: z.string().min(1).max(120),
  email: z.string().email(),
  status: accountStatusSchema,
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  lastLoginAt: isoDateTimeSchema.nullable(),
  mfaEnabled: z.boolean(),
  storageUsedBytes: z.string().regex(/^\d+$/),
  monthlyAiRequests: z.number().int().nonnegative(),
  quotaResetAt: isoDateTimeSchema,
  notificationDelivery: notificationDeliveryModeSchema,
  locale: z.string().min(2).max(35),
  timeZone: z.string().min(1).max(100),
  recoveryCodesRemaining: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const accountPreferencesResponseSchema = z.object({
  message: z.string().min(1),
  notificationDelivery: notificationDeliveryModeSchema,
  locale: z.string().min(2).max(35),
  timeZone: z.string().min(1).max(100),
});

export const notificationSchema = z.object({
  id: identifierSchema,
  type: notificationTypeSchema,
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  href: z.string().max(2_000).nullable(),
  readAt: isoDateTimeSchema.nullable(),
  emailStatus: emailDeliveryStatusSchema.nullable(),
  emailedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  actor: z.object({ id: identifierSchema, name: z.string().min(1).max(120) }).nullable(),
  project: z.object({ id: identifierSchema, title: z.string().min(1).max(100) }).nullable(),
});

export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
  pageInfo: pageInfoSchema,
});

export const mfaSetupSchema = z.object({
  secret: z.string().min(16).max(128),
  otpAuthUrl: z.string().startsWith("otpauth://"),
  expiresAt: isoDateTimeSchema,
});
export const mfaEnabledSchema = messageResponseSchema.extend({
  recoveryCodes: z.array(z.string().min(8).max(32)).min(1),
  sessionRevoked: z.literal(true),
});

export const inviteResponseSchema = z.object({
  id: identifierSchema,
  invitedEmail: z.string().email(),
  canApprove: z.boolean(),
  expiresAt: isoDateTimeSchema,
  deliveryStatus: emailDeliveryStatusSchema,
  inviteUrl: z.string().url(),
  projectVersion: z.number().int().positive(),
});

export const joinInviteResponseSchema = z.object({
  message: z.string(),
  projectId: identifierSchema,
  projectTitle: z.string().max(100).optional(),
  isApprover: z.boolean().optional(),
});

export const uploadReservationSchema = z.object({
  uploadMode: z.enum(['single', 'multipart']),
  uploadUrl: z.string().url().optional(),
  presignedData: z.string().url().optional(),
  uploadHeaders: z.record(z.string(), z.string()),
  multipart: z.object({
    uploadId: z.string().min(1).max(1_024),
    partSize: z.number().int().min(5 * 1024 * 1024),
    partCount: z.number().int().positive().max(10_000),
    uploadedParts: z.array(z.object({
      partNumber: z.number().int().positive().max(10_000),
      etag: z.string().min(1).max(256),
      fileSize: z.number().int().positive(),
    })),
    parts: z.array(z.object({
      partNumber: z.number().int().positive().max(10_000),
      url: z.string().url(),
      uploadHeaders: z.record(z.string(), z.string()),
    })),
  }).optional(),
  storageKey: z.string().min(1).max(1_024),
  fileName: z.string().min(1).max(255).optional(),
  fileType: z.string().min(1).max(120),
  fileSize: z.number().int().positive(),
  expiresAt: isoDateTimeSchema,
  expiresInSeconds: z.number().int().positive(),
});

export const multipartRefreshResponseSchema = z.object({
  multipart: uploadReservationSchema.shape.multipart.unwrap(),
});

export const assetMutationResponseSchema = assetSchema.extend({
  projectVersion: z.number().int().positive(),
  message: z.string(),
});

export const assetRenameResponseSchema = z.object({
  message: z.string().optional(),
  fileName: z.string().min(1).max(255),
  versionsRenamed: z.number().int().nonnegative(),
  projectVersion: z.number().int().positive(),
});

export const deleteAssetResponseSchema = z.object({
  message: z.string(),
  versionsDeleted: z.number().int().nonnegative(),
  projectVersion: z.number().int().positive(),
});

export const memberApproverResponseSchema = z.object({ projectVersion: z.number().int().positive(), isApprover: z.boolean() });
export const resolveCommentResponseSchema = z.object({ message: z.string(), isResolved: z.boolean() });
export const aiSummaryResponseSchema = z.object({ summary: z.string().min(1) });
const apiResourceReferenceSchema = z.string().refine(
  (value) => value.startsWith('/') || /^https?:\/\//iu.test(value),
  'Expected an absolute or root-relative API resource URL.',
);
export const secureAssetUrlResponseSchema = z.object({
  url: apiResourceReferenceSchema,
  purpose: z.enum(["preview", "download"]),
  expiresInSeconds: z.number().int().positive(),
});
export const assetDownloadResponseSchema = z.object({ downloadUrl: apiResourceReferenceSchema, expiresInSeconds: z.number().int().positive() });
export const commentAudioUrlResponseSchema = z.object({
  url: apiResourceReferenceSchema,
  mimeType: z.string().max(120).nullable().optional(),
  expiresInSeconds: z.number().int().positive(),
});
