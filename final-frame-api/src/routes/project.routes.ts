import { Router, type Response } from 'express';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import {
  AccountStatus,
  ActivityAction,
  ApprovalDecision,
  AssetProcessingStatus,
  EmailDeliveryStatus,
  EmailOutboxType,
  InvitationStatus,
  NotificationType,
  ProjectDeletionStatus,
  ProjectStatus,
} from '../generated/prisma/enums.js';
import { emailDeliveryEnabled } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AppError, AuthorizationError, ConflictError, NotFoundError } from '../errors/app-error.js';
import {
  getAuthenticatedUser,
  requireAuth,
  type AuthRequest,
} from '../middleware/auth.js';
import { inviteLimiter } from '../middleware/rate-limit.js';
import { recordActivity } from '../services/activity.js';
import { documentDigest, signDocument, verifySignedDocument } from '../services/document-integrity.js';
import { generateProjectInvite, validateAndHashInviteToken } from '../services/invites.js';
import { createNotification, notifyProjectParticipants } from '../services/notifications.js';
import { cancelOutboxByPayloadReference } from '../services/outbox-cancellation.js';
import {
  assertDesignerContentMutable,
  assertProjectStatusTransition,
} from '../services/project-workflow.js';
import {
  requireMemberCapacity,
  requirePendingInviteCapacity,
  requireProjectCapacity,
} from '../services/quotas.js';
import {
  emitMemberRemoved,
  emitProjectDeleted,
  emitWorkspaceRefresh,
} from '../services/realtime.js';
import { runSerializableTransaction } from '../services/transaction.js';
import { loadActivityPage, loadAssetPage } from '../services/workspace-data.js';
import { streamProjectAuditExport } from '../services/project-audit-export.js';
import { createPage, setPaginationHeaders } from '../utils/pagination.js';
import { disableResponseCaching } from '../utils/http.js';
import assetRoutes from './asset.routes.js';

const router = Router();

const cuid = z.string().cuid('Invalid identifier.');
const expectedVersion = z.number().int().positive();
const normalizedEmail = z.string().trim().email().max(254).transform((value) => value.toLowerCase());

const projectIdParamsSchema = z.object({ projectId: cuid }).strict();
const memberParamsSchema = z.object({ projectId: cuid, userId: cuid }).strict();
const invitationParamsSchema = z.object({ projectId: cuid, invitationId: cuid }).strict();
const approvalEventParamsSchema = z.object({ projectId: cuid, approvalEventId: cuid }).strict();

const queryInteger = (fallback: number, maximum: number) => z.preprocess(
  (raw) => {
    if (raw === undefined || raw === '') return fallback;
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return Number.NaN;
    return Number(raw);
  },
  z.number().int().min(1).max(maximum),
);

const projectListQuerySchema = z.object({
  cursor: cuid.optional(),
  limit: queryInteger(24, 100),
  q: z.string().trim().max(120).optional(),
  status: z.enum(ProjectStatus).optional(),
  archived: z.enum(['true', 'false', 'all']).default('false'),
  scope: z.enum(['all', 'owned', 'shared']).default('all'),
  sort: z.enum(['updated_desc', 'created_desc', 'title_asc']).default('updated_desc'),
}).strict();

const createProjectSchema = z.object({
  title: z.string().trim().min(1, 'Project title is required.').max(100),
  description: z.string().trim().max(1_000).optional(),
}).strict();

const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1_000).nullable().optional(),
  isDownloadUnlocked: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  expectedVersion,
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== 'expectedVersion'),
  'At least one project field must be supplied.',
);

const finalAssetSchema = z.object({
  assetId: cuid.nullable(),
  expectedVersion,
}).strict();

const transitionSchema = z.object({
  status: z.enum([
    ProjectStatus.DRAFT,
    ProjectStatus.IN_REVIEW,
    ProjectStatus.CHANGES_REQUESTED,
    ProjectStatus.APPROVED,
  ]),
  reason: z.string().trim().max(2_000).optional(),
  expectedVersion,
}).strict().superRefine((value, context) => {
  if (value.status === ProjectStatus.CHANGES_REQUESTED && (!value.reason || value.reason.length < 3)) {
    context.addIssue({
      code: 'custom',
      path: ['reason'],
      message: 'Briefly explain what should change.',
    });
  }
});

const createInvitationSchema = z.object({
  email: normalizedEmail,
  canApprove: z.boolean().default(true),
  expectedVersion,
}).strict();

const invitationTokenSchema = z.object({
  token: z.string().trim().regex(/^[a-fA-F0-9]{64}$/, 'Invalid invitation token.'),
}).strict();

const versionMutationSchema = z.object({ expectedVersion }).strict();
const approverMutationSchema = z.object({ isApprover: z.boolean(), expectedVersion }).strict();

const projectListSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  isArchived: true,
  isDownloadUnlocked: true,
  aiEnabled: true,
  ownerId: true,
  finalAssetId: true,
  deletionStatus: true,
  owner: { select: { id: true, name: true } },
  _count: { select: { assets: true, members: true } },
} as const;

const activeProjectAccessWhere = (projectId: string, userId: string): Prisma.ProjectWhereInput => ({
  id: projectId,
  deletionStatus: ProjectDeletionStatus.ACTIVE,
  OR: [
    { ownerId: userId },
    { members: { some: { userId } } },
  ],
});

function assertVersion(current: number, supplied: number): void {
  if (current !== supplied) {
    throw new ConflictError('The project changed in another session. Refresh and try again.');
  }
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function transitionDecision(current: ProjectStatus, target: ProjectStatus): ApprovalDecision {
  if (target === ProjectStatus.IN_REVIEW) return ApprovalDecision.SUBMITTED;
  if (current === ProjectStatus.IN_REVIEW && target === ProjectStatus.DRAFT) return ApprovalDecision.WITHDRAWN;
  if (target === ProjectStatus.CHANGES_REQUESTED) return ApprovalDecision.CHANGES_REQUESTED;
  if (target === ProjectStatus.APPROVED) return ApprovalDecision.APPROVED;
  return ApprovalDecision.REOPENED;
}

function transitionActivity(current: ProjectStatus, target: ProjectStatus): ActivityAction {
  if (target === ProjectStatus.IN_REVIEW) return ActivityAction.REVIEW_SUBMITTED;
  if (current === ProjectStatus.IN_REVIEW && target === ProjectStatus.DRAFT) return ActivityAction.REVIEW_WITHDRAWN;
  if (target === ProjectStatus.CHANGES_REQUESTED) return ActivityAction.CHANGES_REQUESTED;
  if (target === ProjectStatus.APPROVED) return ActivityAction.PROJECT_APPROVED;
  return ActivityAction.PROJECT_STATUS_CHANGED;
}

/** Public token validation is intentionally not offered. The signed-in account
 * must match the invitation email before any project metadata is disclosed. */
router.post(
  '/invitations/preview',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { token } = invitationTokenSchema.parse(request.body);
    const tokenHash = validateAndHashInviteToken(token);
    if (!tokenHash) throw new NotFoundError('Invitation not found.');

    const invitation = await prisma.projectInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        invitedEmail: true,
        status: true,
        expiresAt: true,
        canApprove: true,
        project: {
          select: {
            id: true,
            title: true,
            deletionStatus: true,
            owner: { select: { name: true } },
          },
        },
      },
    });

    const valid = invitation &&
      invitation.status === InvitationStatus.PENDING &&
      invitation.expiresAt > new Date() &&
      invitation.project.deletionStatus === ProjectDeletionStatus.ACTIVE;
    if (!valid) {
      throw new AppError({
        statusCode: 410,
        code: 'INVITATION_UNAVAILABLE',
        message: 'Invitation is invalid, expired, revoked, or already used.',
        clientMessage: 'This invitation is no longer available.',
      });
    }
    if (!user.email || user.email.toLowerCase() !== invitation.invitedEmail) {
      throw new AuthorizationError(`Sign in with ${maskEmail(invitation.invitedEmail)} to accept this invitation.`);
    }

    disableResponseCaching(response);
    response.status(200).json({
      invitationId: invitation.id,
      projectId: invitation.project.id,
      projectTitle: invitation.project.title,
      designerName: invitation.project.owner.name,
      canApprove: invitation.canApprove,
      expiresAt: invitation.expiresAt,
    });
  },
);

router.post(
  '/invitations/accept',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { token } = invitationTokenSchema.parse(request.body);
    const tokenHash = validateAndHashInviteToken(token);
    if (!tokenHash) throw new NotFoundError('Invitation not found.');

    const result = await runSerializableTransaction(async (transaction) => {
      const invitation = await transaction.projectInvitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          projectId: true,
          invitedEmail: true,
          status: true,
          canApprove: true,
          expiresAt: true,
          deliveryStatus: true,
          createdById: true,
          project: {
            select: {
              id: true,
              title: true,
              ownerId: true,
              version: true,
              deletionStatus: true,
            },
          },
        },
      });
      if (!invitation || invitation.status !== InvitationStatus.PENDING || invitation.expiresAt <= new Date()) {
        throw new AppError({
          statusCode: 410,
          code: 'INVITATION_UNAVAILABLE',
          message: 'Invitation is invalid, expired, revoked, or already used.',
          clientMessage: 'This invitation is no longer available.',
        });
      }
      if (invitation.project.deletionStatus !== ProjectDeletionStatus.ACTIVE) {
        throw new ConflictError('This project is no longer available.');
      }
      if (!user.email || user.email.toLowerCase() !== invitation.invitedEmail) {
        throw new AuthorizationError(`Sign in with ${maskEmail(invitation.invitedEmail)} to accept this invitation.`);
      }
      if (invitation.project.ownerId === user.id) {
        throw new ConflictError('The Designer already owns this project.');
      }

      const existing = await transaction.projectMember.findUnique({
        where: { projectId_userId: { projectId: invitation.projectId, userId: user.id } },
        select: { id: true, isApprover: true },
      });
      if (!existing) {
        await requireMemberCapacity(transaction, invitation.projectId, invitation.project.ownerId);
      }

      const membership = await transaction.projectMember.upsert({
        where: { projectId_userId: { projectId: invitation.projectId, userId: user.id } },
        create: {
          projectId: invitation.projectId,
          userId: user.id,
          isApprover: invitation.canApprove,
        },
        update: {
          isApprover: existing?.isApprover === true || invitation.canApprove,
        },
        select: { id: true, isApprover: true },
      });

      const acceptedAt = new Date();
      const accepted = await transaction.projectInvitation.updateMany({
        where: { id: invitation.id, status: InvitationStatus.PENDING },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt,
          acceptedById: user.id,
          ...(invitation.deliveryStatus === EmailDeliveryStatus.SENT
            ? {}
            : { deliveryStatus: EmailDeliveryStatus.CANCELLED }),
        },
      });
      if (accepted.count !== 1) throw new ConflictError('This invitation was already used.');

      const supersededInvitations = await transaction.projectInvitation.findMany({
        where: {
          projectId: invitation.projectId,
          invitedEmail: invitation.invitedEmail,
          status: InvitationStatus.PENDING,
          id: { not: invitation.id },
        },
        select: { id: true, createdById: true, deliveryStatus: true },
      });
      if (supersededInvitations.length > 0) {
        const supersededIds = supersededInvitations.map((item) => item.id);
        await transaction.projectInvitation.updateMany({
          where: { id: { in: supersededIds } },
          data: { status: InvitationStatus.REVOKED, revokedAt: acceptedAt },
        });
        const undeliveredIds = supersededInvitations
          .filter((item) => item.deliveryStatus !== EmailDeliveryStatus.SENT)
          .map((item) => item.id);
        if (undeliveredIds.length > 0) {
          await transaction.projectInvitation.updateMany({
            where: { id: { in: undeliveredIds } },
            data: { deliveryStatus: EmailDeliveryStatus.CANCELLED },
          });
        }
      }

      const invitationIdsByCreator = new Map<string, string[]>();
      for (const item of [
        { id: invitation.id, createdById: invitation.createdById },
        ...supersededInvitations,
      ]) {
        const ids = invitationIdsByCreator.get(item.createdById) ?? [];
        ids.push(item.id);
        invitationIdsByCreator.set(item.createdById, ids);
      }
      for (const [creatorId, invitationIds] of invitationIdsByCreator) {
        await cancelOutboxByPayloadReference(transaction, {
          type: EmailOutboxType.PROJECT_INVITATION,
          userId: creatorId,
          referenceField: 'invitationId',
          referenceIds: invitationIds,
          reason: 'The project invitation was accepted or replaced before delivery completed.',
        });
      }

      const updated = await transaction.project.updateMany({
        where: { id: invitation.projectId, version: invitation.project.version },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictError('The project changed while joining. Try again.');

      await recordActivity({
        projectId: invitation.projectId,
        userId: user.id,
        action: ActivityAction.INVITE_ACCEPTED,
        message: 'Client joined the project through an email-bound invitation.',
        metadata: { invitationId: invitation.id, isApprover: membership.isApprover },
      }, transaction);

      await createNotification({
        recipientId: invitation.project.ownerId,
        actorId: user.id,
        projectId: invitation.projectId,
        type: NotificationType.MEMBER_JOINED,
        title: 'Client joined',
        body: `${user.name ?? 'A Client'} joined ${invitation.project.title}.`,
        href: `/project/${invitation.projectId}`,
        traceparent: response.locals.traceparent,
      }, transaction);

      return {
        projectId: invitation.projectId,
        projectTitle: invitation.project.title,
        isApprover: membership.isApprover,
      };
    });

    emitWorkspaceRefresh(request, result.projectId, 'member-joined');
    disableResponseCaching(response);
    response.status(200).json({
      message: `You joined ${result.projectTitle}.`,
      ...result,
    });
  },
);

// Nested asset and comment routes retain the existing public URL structure.
router.use('/:projectId/assets', assetRoutes);

router.get(
  '/',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const query = projectListQuerySchema.parse(request.query);

    const allAccess: Prisma.ProjectWhereInput = {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    };
    const access: Prisma.ProjectWhereInput = query.scope === 'owned'
      ? { ownerId: user.id }
      : query.scope === 'shared'
        ? { members: { some: { userId: user.id } }, ownerId: { not: user.id } }
        : allAccess;

    const statsWhere: Prisma.ProjectWhereInput = {
      AND: [allAccess, { deletionStatus: ProjectDeletionStatus.ACTIVE }, { isArchived: false }],
    };
    const filters: Prisma.ProjectWhereInput[] = [
      access,
      { deletionStatus: ProjectDeletionStatus.ACTIVE },
    ];
    if (query.archived !== 'all') filters.push({ isArchived: query.archived === 'true' });
    if (query.status) filters.push({ status: query.status });
    if (query.q) {
      filters.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.ProjectWhereInput = { AND: filters };

    const orderBy: Prisma.ProjectOrderByWithRelationInput[] = query.sort === 'title_asc'
      ? [{ title: 'asc' }, { id: 'asc' }]
      : query.sort === 'created_desc'
        ? [{ createdAt: 'desc' }, { id: 'desc' }]
        : [{ updatedAt: 'desc' }, { id: 'desc' }];

    const [rows, matching, total, owned, shared, draft, inReview, changesRequested, approved] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        orderBy,
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: projectListSelect,
      }),
      prisma.project.count({ where }),
      prisma.project.count({ where: statsWhere }),
      prisma.project.count({ where: { AND: [statsWhere, { ownerId: user.id }] } }),
      prisma.project.count({
        where: { AND: [statsWhere, { members: { some: { userId: user.id } } }, { ownerId: { not: user.id } }] },
      }),
      prisma.project.count({ where: { AND: [statsWhere, { status: ProjectStatus.DRAFT }] } }),
      prisma.project.count({ where: { AND: [statsWhere, { status: ProjectStatus.IN_REVIEW }] } }),
      prisma.project.count({ where: { AND: [statsWhere, { status: ProjectStatus.CHANGES_REQUESTED }] } }),
      prisma.project.count({ where: { AND: [statsWhere, { status: ProjectStatus.APPROVED }] } }),
    ]);

    const page = createPage(rows, query.limit);
    disableResponseCaching(response);
    setPaginationHeaders(response, page.pageInfo);
    response.status(200).json({
      ...page,
      stats: { matching, total, owned, shared, draft, inReview, changesRequested, approved },
    });
  },
);

router.post(
  '/',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const input = createProjectSchema.parse(request.body);

    const project = await runSerializableTransaction(async (transaction) => {
      await requireProjectCapacity(transaction, user.id);
      const created = await transaction.project.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          ownerId: user.id,
          status: ProjectStatus.DRAFT,
        },
        select: projectListSelect,
      });
      await recordActivity({
        projectId: created.id,
        userId: user.id,
        action: ActivityAction.PROJECT_CREATED,
        message: 'Project created.',
      }, transaction);
      return created;
    });

    disableResponseCaching(response);
    response.status(201).json(project);
  },
);

router.get(
  '/workspace/:projectId',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);

    const project = await prisma.project.findFirst({
      where: activeProjectAccessWhere(projectId, user.id),
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        isArchived: true,
        isDownloadUnlocked: true,
        aiEnabled: true,
        ownerId: true,
        finalAssetId: true,
        deletionStatus: true,
        owner: { select: { id: true, name: true, email: true } },
        finalAsset: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            previewMimeType: true,
            previewFileSize: true,
            processingStatus: true,
            width: true,
            height: true,
            durationSeconds: true,
            version: true,
          },
        },
        members: {
          orderBy: { joinedAt: 'asc' },
          select: {
            id: true,
            userId: true,
            isApprover: true,
            joinedAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        approvalEvents: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            decision: true,
            projectVersion: true,
            assetId: true,
            reason: true,
            snapshot: true,
            certificateDigest: true,
            certificateSignature: true,
            certificatePublicKey: true,
            certificateKeyId: true,
            createdAt: true,
            actor: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: {
            assets: true,
            members: true,
            activityLogs: true,
            invitations: { where: { status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } } },
          },
        },
      },
    });
    if (!project) throw new NotFoundError('Project not found.');

    const isOwner = project.ownerId === user.id;
    const member = project.members.find((item) => item.userId === user.id);
    const [assetPage, activityPage, pendingInvitations, latestSignedApproval] = await Promise.all([
      loadAssetPage(projectId, undefined, 50, 50),
      loadActivityPage(projectId, undefined, 50),
      isOwner
        ? prisma.projectInvitation.findMany({
            where: { projectId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              invitedEmail: true,
              canApprove: true,
              expiresAt: true,
              deliveryStatus: true,
              deliveryAttempts: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      prisma.approvalEvent.findFirst({
        where: {
          projectId,
          decision: ApprovalDecision.APPROVED,
          certificateSignature: { not: null },
          certificateDigest: { not: null },
          certificatePublicKey: { not: null },
          certificateKeyId: { not: null },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          decision: true,
          projectVersion: true,
          assetId: true,
          reason: true,
          snapshot: true,
          certificateDigest: true,
          certificateSignature: true,
          certificatePublicKey: true,
          certificateKeyId: true,
          createdAt: true,
          actor: { select: { id: true, name: true } },
        },
      }),
    ]);

    disableResponseCaching(response);
    response.status(200).json({
      ...project,
      isOwner,
      isApprover: member?.isApprover ?? false,
      pendingInvitations,
      latestSignedApproval,
      assets: assetPage.items,
      activityLogs: activityPage.items,
      pageInfo: {
        assets: assetPage.pageInfo,
        activityLogs: activityPage.pageInfo,
      },
    });
  },
);

router.get(
  '/:projectId/activity',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const query = z.object({ cursor: cuid.optional(), limit: queryInteger(50, 100) }).strict().parse(request.query);

    const accessible = await prisma.project.findFirst({
      where: activeProjectAccessWhere(projectId, user.id),
      select: { id: true },
    });
    if (!accessible) throw new NotFoundError('Project not found.');

    const page = await loadActivityPage(projectId, query.cursor, query.limit);
    disableResponseCaching(response);
    response.status(200).json(page);
  },
);

router.get(
  '/:projectId/approval-events/:approvalEventId/certificate',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId, approvalEventId } = approvalEventParamsSchema.parse(request.params);

    const event = await prisma.approvalEvent.findFirst({
      where: {
        id: approvalEventId,
        projectId,
        decision: ApprovalDecision.APPROVED,
        OR: [
          { project: { ownerId: user.id } },
          { actorId: user.id },
          { project: { members: { some: { userId: user.id } } } },
        ],
      },
      select: {
        id: true,
        decision: true,
        projectVersion: true,
        projectId: true,
        assetId: true,
        reason: true,
        snapshot: true,
        certificateDigest: true,
        certificateSignature: true,
        certificatePublicKey: true,
        certificateKeyId: true,
        createdAt: true,
        project: { select: { title: true } },
      },
    });
    if (!event) throw new NotFoundError('Approval certificate not found.');
    if (!event.certificateDigest || !event.certificateSignature || !event.certificatePublicKey || !event.certificateKeyId) {
      throw new ConflictError('This historical approval predates signed certificates.');
    }

    const payload = {
      certificateId: event.id,
      decision: event.decision,
      projectId,
      projectVersion: event.projectVersion,
      assetId: event.assetId,
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
      snapshot: event.snapshot,
    };
    const certificate = {
      schema: 'finalframe.approval-certificate.v1' as const,
      keyId: event.certificateKeyId,
      algorithm: 'Ed25519' as const,
      publicKey: { kty: 'OKP' as const, crv: 'Ed25519' as const, x: event.certificatePublicKey },
      payload,
      digest: event.certificateDigest,
      signature: event.certificateSignature,
    };
    if (
      documentDigest(certificate.schema, payload) !== event.certificateDigest
      || !verifySignedDocument(certificate)
    ) {
      throw new AppError({
        statusCode: 500,
        code: 'CERTIFICATE_INTEGRITY_FAILURE',
        message: 'Stored approval certificate failed digest or public-key signature verification.',
        clientMessage: 'This approval certificate could not be verified. Contact support.',
      });
    }

    const safeTitle = event.project.title.normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'project';
    disableResponseCaching(response);
    response.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-approval.json"`);
    response.status(200).json(certificate);
  },
);

router.get(
  '/:projectId/audit-export',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: user.id },
      select: { id: true, title: true },
    });
    if (!project) throw new NotFoundError('Project not found.');

    const exportedAt = new Date().toISOString();
    await recordActivity({
      projectId,
      userId: user.id,
      action: ActivityAction.PROJECT_AUDIT_EXPORTED,
      message: 'Designer started a signed project audit export.',
      metadata: { exportedAt },
    });

    try {
      await streamProjectAuditExport({
        projectId,
        projectTitle: project.title,
        exportedAt,
        response,
      });
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : new Error('Audit export failed.'));
        return;
      }
      throw error;
    }
  },
);

router.put(
  '/:projectId',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const input = updateProjectSchema.parse(request.body);

    const project = await runSerializableTransaction(async (transaction) => {
      const current = await transaction.project.findFirst({
        where: { id: projectId, ownerId: user.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          version: true,
          isArchived: true,
          isDownloadUnlocked: true,
          aiEnabled: true,
        },
      });
      if (!current) throw new NotFoundError('Project not found.');
      assertVersion(current.version, input.expectedVersion);

      const metadataChanges = input.title !== undefined || input.description !== undefined;
      if (metadataChanges && current.status !== ProjectStatus.DRAFT && current.status !== ProjectStatus.CHANGES_REQUESTED) {
        throw new ConflictError('Project details are frozen during and after Client review.');
      }
      if (input.isArchived === true && current.status === ProjectStatus.IN_REVIEW) {
        throw new ConflictError('Withdraw the active review before archiving this project.');
      }

      const data: Prisma.ProjectUpdateManyMutationInput = { version: { increment: 1 } };
      const activities: Array<{ action: ActivityAction; message: string; metadata?: Prisma.InputJsonObject }> = [];

      if (input.title !== undefined && input.title !== current.title) {
        data.title = input.title;
        activities.push({ action: ActivityAction.PROJECT_UPDATED, message: 'Project title updated.', metadata: { field: 'title' } });
      }
      if (input.description !== undefined && input.description !== current.description) {
        data.description = input.description;
        activities.push({ action: ActivityAction.PROJECT_UPDATED, message: 'Project description updated.', metadata: { field: 'description' } });
      }
      if (input.isDownloadUnlocked !== undefined && input.isDownloadUnlocked !== current.isDownloadUnlocked) {
        data.isDownloadUnlocked = input.isDownloadUnlocked;
        activities.push({
          action: input.isDownloadUnlocked ? ActivityAction.DOWNLOAD_UNLOCKED : ActivityAction.DOWNLOAD_REVOKED,
          message: input.isDownloadUnlocked ? 'Original downloads unlocked.' : 'Original downloads locked.',
        });
      }
      if (input.isArchived !== undefined && input.isArchived !== current.isArchived) {
        data.isArchived = input.isArchived;
        data.archivedAt = input.isArchived ? new Date() : null;
        activities.push({
          action: input.isArchived ? ActivityAction.PROJECT_ARCHIVED : ActivityAction.PROJECT_REOPENED,
          message: input.isArchived ? 'Project archived.' : 'Project reopened.',
        });
      }
      if (input.aiEnabled !== undefined && input.aiEnabled !== current.aiEnabled) {
        data.aiEnabled = input.aiEnabled;
        activities.push({
          action: input.aiEnabled ? ActivityAction.AI_ENABLED : ActivityAction.AI_DISABLED,
          message: input.aiEnabled
            ? 'AI summaries enabled for this project with Designer consent.'
            : 'AI summaries disabled for this project.',
        });
      }
      if (activities.length === 0) {
        throw new AppError({
          statusCode: 400,
          code: 'NO_PROJECT_CHANGES',
          message: 'The request does not change the project.',
          clientMessage: 'No project changes were detected.',
        });
      }

      const changed = await transaction.project.updateMany({
        where: { id: projectId, ownerId: user.id, version: current.version, deletionStatus: ProjectDeletionStatus.ACTIVE },
        data,
      });
      if (changed.count !== 1) throw new ConflictError('The project changed in another session. Refresh and try again.');

      for (const activity of activities) {
        await recordActivity({
          projectId,
          userId: user.id,
          action: activity.action,
          message: activity.message,
          ...(activity.metadata ? { metadata: activity.metadata } : {}),
        }, transaction);
      }

      return transaction.project.findUniqueOrThrow({ where: { id: projectId }, select: projectListSelect });
    });

    emitWorkspaceRefresh(request, projectId, 'project-updated');
    disableResponseCaching(response);
    response.status(200).json(project);
  },
);

router.patch(
  '/:projectId/final-asset',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const input = finalAssetSchema.parse(request.body);

    const project = await runSerializableTransaction(async (transaction) => {
      const current = await transaction.project.findFirst({
        where: { id: projectId, ownerId: user.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
        select: {
          id: true,
          ownerId: true,
          status: true,
          version: true,
          isArchived: true,
          deletionStatus: true,
          finalAssetId: true,
        },
      });
      if (!current) throw new NotFoundError('Project not found.');
      assertVersion(current.version, input.expectedVersion);
      assertDesignerContentMutable({ ...current, isOwner: true });
      if (input.assetId === current.finalAssetId) {
        throw new AppError({
          statusCode: 400,
          code: 'NO_PROJECT_CHANGES',
          message: 'The selected final file is already active.',
          clientMessage: 'That file is already selected as final.',
        });
      }
      if (input.assetId) {
        const asset = await transaction.asset.findFirst({
          where: {
            id: input.assetId,
            projectId,
            processingStatus: AssetProcessingStatus.CLEAN,
          },
          select: { id: true },
        });
        if (!asset) throw new ConflictError('Select a verified file from this project.');
      }

      const changed = await transaction.project.updateMany({
        where: { id: projectId, version: current.version, deletionStatus: ProjectDeletionStatus.ACTIVE },
        data: { finalAssetId: input.assetId, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictError('The project changed in another session. Refresh and try again.');

      await recordActivity({
        projectId,
        userId: user.id,
        action: ActivityAction.PROJECT_UPDATED,
        message: input.assetId ? 'Final review file selected.' : 'Final review file selection cleared.',
        metadata: { field: 'finalAssetId', assetId: input.assetId },
      }, transaction);

      return transaction.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { id: true, finalAssetId: true, version: true, updatedAt: true },
      });
    });

    emitWorkspaceRefresh(request, projectId, 'final-asset-changed');
    disableResponseCaching(response);
    response.status(200).json(project);
  },
);

router.post(
  '/:projectId/review',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const input = transitionSchema.parse(request.body);

    const result = await runSerializableTransaction(async (transaction) => {
      const current = await transaction.project.findFirst({
        where: activeProjectAccessWhere(projectId, user.id),
        select: {
          id: true,
          title: true,
          ownerId: true,
          status: true,
          version: true,
          finalAssetId: true,
          isArchived: true,
          deletionStatus: true,
          finalAsset: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              sha256: true,
              processingStatus: true,
              version: true,
            },
          },
          members: {
            select: { userId: true, isApprover: true },
          },
        },
      });
      if (!current) throw new NotFoundError('Project not found.');
      assertVersion(current.version, input.expectedVersion);
      if (current.isArchived) throw new ConflictError('Reopen the project before changing its review state.');

      const membership = current.members.find((member) => member.userId === user.id);
      const blockingCommentCount = await transaction.comment.count({
        where: {
          asset: { projectId },
          isBlocking: true,
          isResolved: false,
          isDeleted: false,
        },
      });
      const approverCount = current.members.filter((member) => member.isApprover).length;
      assertProjectStatusTransition({
        current: current.status,
        target: input.status,
        isOwner: current.ownerId === user.id,
        isApprover: membership?.isApprover ?? false,
        finalAssetId: current.finalAssetId,
        cleanFinalAsset: current.finalAsset?.processingStatus === AssetProcessingStatus.CLEAN,
        approverCount,
        blockingCommentCount,
      });

      const nextVersion = current.version + 1;
      const changed = await transaction.project.updateMany({
        where: { id: projectId, version: current.version, deletionStatus: ProjectDeletionStatus.ACTIVE },
        data: { status: input.status, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictError('The project changed in another session. Refresh and try again.');

      const decision = transitionDecision(current.status, input.status);
      const snapshot: Prisma.InputJsonObject = {
        projectId,
        projectTitle: current.title,
        previousStatus: current.status,
        nextStatus: input.status,
        projectVersion: nextVersion,
        capturedAt: new Date().toISOString(),
        finalAsset: current.finalAsset
          ? {
              id: current.finalAsset.id,
              fileName: current.finalAsset.fileName,
              mimeType: current.finalAsset.mimeType,
              fileSize: current.finalAsset.fileSize,
              sha256: current.finalAsset.sha256,
              version: current.finalAsset.version,
            }
          : null,
        approverUserIds: current.members.filter((member) => member.isApprover).map((member) => member.userId),
        unresolvedBlockingFeedback: blockingCommentCount,
        actor: {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
          role: current.ownerId === user.id ? 'DESIGNER' : 'CLIENT',
        },
      };
      const approvalEvent = await transaction.approvalEvent.create({
        data: {
          projectId,
          actorId: user.id,
          decision,
          projectVersion: nextVersion,
          assetId: current.finalAssetId,
          reason: input.reason ?? null,
          snapshot,
        },
        select: { id: true, createdAt: true },
      });

      if (input.status === ProjectStatus.APPROVED) {
        const certificate = signDocument('finalframe.approval-certificate.v1', {
          certificateId: approvalEvent.id,
          decision,
          projectId,
          projectVersion: nextVersion,
          assetId: current.finalAssetId,
          reason: input.reason ?? null,
          createdAt: approvalEvent.createdAt.toISOString(),
          snapshot,
        });
        await transaction.approvalEvent.update({
          where: { id: approvalEvent.id },
          data: {
            certificateDigest: certificate.digest,
            certificateSignature: certificate.signature,
            certificatePublicKey: certificate.publicKey.x,
            certificateKeyId: certificate.keyId,
          },
          select: { id: true },
        });
      }

      await recordActivity({
        projectId,
        userId: user.id,
        action: transitionActivity(current.status, input.status),
        message: input.status === ProjectStatus.IN_REVIEW
          ? 'Designer submitted the final file for Client review.'
          : input.status === ProjectStatus.DRAFT
            ? 'Designer withdrew the active review.'
            : input.status === ProjectStatus.CHANGES_REQUESTED
              ? 'Client requested changes.'
              : 'Client approver approved the project.',
        metadata: {
          from: current.status,
          to: input.status,
          reason: input.reason ?? null,
          finalAssetId: current.finalAssetId,
          projectVersion: nextVersion,
        },
      }, transaction);

      if (input.status === ProjectStatus.IN_REVIEW) {
        await notifyProjectParticipants(projectId, user.id, {
          type: NotificationType.REVIEW_SUBMITTED,
          title: 'Ready for review',
          body: `${current.title} is ready for Client review.`,
          href: `/project/${projectId}`,
          traceparent: response.locals.traceparent,
        }, transaction);
      } else if (input.status === ProjectStatus.CHANGES_REQUESTED) {
        await createNotification({
          recipientId: current.ownerId,
          actorId: user.id,
          projectId,
          type: NotificationType.CHANGES_REQUESTED,
          title: 'Changes requested',
          body: `${user.name ?? 'A Client'} requested changes to ${current.title}.`,
          href: `/project/${projectId}`,
          traceparent: response.locals.traceparent,
        }, transaction);
      } else if (input.status === ProjectStatus.APPROVED) {
        await notifyProjectParticipants(projectId, user.id, {
          type: NotificationType.PROJECT_APPROVED,
          title: 'Project approved',
          body: `${current.title} received final Client approval.`,
          href: `/project/${projectId}`,
          traceparent: response.locals.traceparent,
        }, transaction);
      }

      return {
        id: projectId,
        status: input.status,
        version: nextVersion,
        finalAssetId: current.finalAssetId,
      };
    });

    emitWorkspaceRefresh(request, projectId, 'review-state-changed');
    disableResponseCaching(response);
    response.status(200).json(result);
  },
);

router.get(
  '/:projectId/invitations',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: user.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
      select: { id: true },
    });
    if (!project) throw new NotFoundError('Project not found.');

    const invitations = await prisma.projectInvitation.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        invitedEmail: true,
        status: true,
        canApprove: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        deliveryStatus: true,
        deliveryAttempts: true,
        providerMessageId: true,
        lastDeliveryError: true,
        createdAt: true,
        acceptedBy: { select: { id: true, name: true, email: true } },
      },
    });
    disableResponseCaching(response);
    response.status(200).json({ items: invitations });
  },
);

async function createProjectInvitationHandler(request: AuthRequest, response: Response): Promise<void> {
  const user = getAuthenticatedUser(request);
  const { projectId } = projectIdParamsSchema.parse(request.params);
  const input = createInvitationSchema.parse(request.body);
  const generated = generateProjectInvite();

  const result = await runSerializableTransaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, ownerId: user.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
      select: { id: true, title: true, ownerId: true, version: true },
    });
    if (!project) throw new NotFoundError('Project not found.');
    assertVersion(project.version, input.expectedVersion);
    if (user.email?.toLowerCase() === input.email) {
      throw new ConflictError('The Designer already owns this project.');
    }

    const target = await transaction.user.findUnique({
      where: { email: input.email },
      select: { id: true, status: true },
    });
    if (target) {
      const membership = await transaction.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: target.id } },
        select: { id: true },
      });
      if (membership) throw new ConflictError('This Client is already a project member.');
    }

    const oldInvitations = await transaction.projectInvitation.findMany({
      where: { projectId, invitedEmail: input.email, status: InvitationStatus.PENDING },
      select: { id: true, createdById: true, deliveryStatus: true },
    });
    if (oldInvitations.length > 0) {
      const revokedAt = new Date();
      await transaction.projectInvitation.updateMany({
        where: { id: { in: oldInvitations.map((invitation) => invitation.id) } },
        data: { status: InvitationStatus.REVOKED, revokedAt },
      });
      const undeliveredIds = oldInvitations
        .filter((invitation) => invitation.deliveryStatus !== EmailDeliveryStatus.SENT)
        .map((invitation) => invitation.id);
      if (undeliveredIds.length > 0) {
        await transaction.projectInvitation.updateMany({
          where: { id: { in: undeliveredIds } },
          data: { deliveryStatus: EmailDeliveryStatus.CANCELLED },
        });
      }
      const oldIdsByCreator = new Map<string, string[]>();
      for (const invitation of oldInvitations) {
        const ids = oldIdsByCreator.get(invitation.createdById) ?? [];
        ids.push(invitation.id);
        oldIdsByCreator.set(invitation.createdById, ids);
      }
      for (const [creatorId, invitationIds] of oldIdsByCreator) {
        await cancelOutboxByPayloadReference(transaction, {
          type: EmailOutboxType.PROJECT_INVITATION,
          userId: creatorId,
          referenceField: 'invitationId',
          referenceIds: invitationIds,
          reason: 'A newer project invitation replaced this message.',
        });
      }
    }
    await requirePendingInviteCapacity(transaction, projectId, project.ownerId);

    const invitation = await transaction.projectInvitation.create({
      data: {
        projectId,
        invitedEmail: input.email,
        tokenHash: generated.tokenHash,
        canApprove: input.canApprove,
        expiresAt: generated.expiresAt,
        createdById: user.id,
      },
      select: {
        id: true,
        invitedEmail: true,
        canApprove: true,
        expiresAt: true,
        deliveryStatus: true,
        createdAt: true,
      },
    });

    if (emailDeliveryEnabled) {
      await transaction.emailOutbox.create({
        data: {
          type: EmailOutboxType.PROJECT_INVITATION,
          recipient: input.email,
          subject: `You were invited to review ${project.title}`,
          userId: user.id,
          payload: {
            invitationId: invitation.id,
            projectTitle: project.title,
            inviteUrl: generated.inviteUrl,
          },
        },
        select: { id: true },
      });
    } else {
      await transaction.projectInvitation.update({
        where: { id: invitation.id },
        data: {
          deliveryStatus: EmailDeliveryStatus.CANCELLED,
          lastDeliveryError: 'Email delivery is disabled. Share the one-time link directly.',
        },
        select: { id: true },
      });
    }

    const changed = await transaction.project.updateMany({
      where: { id: projectId, version: project.version, deletionStatus: ProjectDeletionStatus.ACTIVE },
      data: { version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ConflictError('The project changed in another session. Refresh and try again.');

    await recordActivity({
      projectId,
      userId: user.id,
      action: ActivityAction.INVITE_CREATED,
      message: 'Email-bound Client invitation created.',
      metadata: {
        invitationId: invitation.id,
        recipientDomain: input.email.split('@')[1] ?? 'unknown',
        canApprove: input.canApprove,
      },
    }, transaction);

    if (target?.status === AccountStatus.ACTIVE) {
      await createNotification({
        recipientId: target.id,
        actorId: user.id,
        projectId,
        type: NotificationType.INVITED,
        title: 'Project invitation',
        body: `${user.name ?? 'A Designer'} invited you to review ${project.title}.`,
        href: '/notifications',
        traceparent: response.locals.traceparent,
      }, transaction);
    }

    return {
      ...invitation,
      deliveryStatus: emailDeliveryEnabled ? invitation.deliveryStatus : EmailDeliveryStatus.CANCELLED,
      inviteUrl: generated.inviteUrl,
      projectVersion: project.version + 1,
    };
  });

  emitWorkspaceRefresh(request, projectId, 'invitation-created');
  disableResponseCaching(response);
  response.status(201).json(result);
}

router.post('/:projectId/invitations', requireAuth, inviteLimiter, createProjectInvitationHandler);
router.delete(
  '/:projectId/invitations/:invitationId',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId, invitationId } = invitationParamsSchema.parse(request.params);
    const input = versionMutationSchema.parse(request.body);

    const version = await runSerializableTransaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: { id: projectId, ownerId: user.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
        select: { id: true, version: true },
      });
      if (!project) throw new NotFoundError('Project not found.');
      assertVersion(project.version, input.expectedVersion);

      const invitation = await transaction.projectInvitation.findFirst({
        where: { id: invitationId, projectId },
        select: { id: true, status: true, invitedEmail: true, createdById: true, deliveryStatus: true },
      });
      if (!invitation) throw new NotFoundError('Invitation not found.');
      if (invitation.status !== InvitationStatus.PENDING) {
        throw new ConflictError('Only a pending invitation can be revoked.');
      }

      const revoked = await transaction.projectInvitation.updateMany({
        where: { id: invitationId, projectId, status: InvitationStatus.PENDING },
        data: {
          status: InvitationStatus.REVOKED,
          revokedAt: new Date(),
          ...(invitation.deliveryStatus === EmailDeliveryStatus.SENT
            ? {}
            : { deliveryStatus: EmailDeliveryStatus.CANCELLED }),
        },
      });
      if (revoked.count !== 1) throw new ConflictError('The invitation changed in another session.');

      await cancelOutboxByPayloadReference(transaction, {
        type: EmailOutboxType.PROJECT_INVITATION,
        userId: invitation.createdById,
        referenceField: 'invitationId',
        referenceIds: [invitation.id],
        reason: 'The project invitation was revoked before delivery completed.',
      });

      const changed = await transaction.project.updateMany({
        where: { id: projectId, version: project.version },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictError('The project changed in another session. Refresh and try again.');

      await recordActivity({
        projectId,
        userId: user.id,
        action: ActivityAction.INVITE_REVOKED,
        message: 'Pending Client invitation revoked.',
        metadata: { invitationId, recipientDomain: invitation.invitedEmail.split('@')[1] ?? 'unknown' },
      }, transaction);
      return project.version + 1;
    });

    emitWorkspaceRefresh(request, projectId, 'invitation-revoked');
    disableResponseCaching(response);
    response.status(200).json({ message: 'Invitation revoked.', projectVersion: version });
  },
);

router.patch(
  '/:projectId/members/:userId/approver',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId, userId: targetUserId } = memberParamsSchema.parse(request.params);
    const input = approverMutationSchema.parse(request.body);

    const result = await runSerializableTransaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: { id: projectId, ownerId: user.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
        select: { id: true, status: true, version: true },
      });
      if (!project) throw new NotFoundError('Project not found.');
      assertVersion(project.version, input.expectedVersion);

      const membership = await transaction.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: targetUserId } },
        select: { id: true, isApprover: true },
      });
      if (!membership) throw new NotFoundError('Project member not found.');
      if (membership.isApprover === input.isApprover) {
        throw new AppError({
          statusCode: 400,
          code: 'NO_PROJECT_CHANGES',
          message: 'The Client approval role is already set.',
          clientMessage: 'No approval-role change was detected.',
        });
      }
      if (!input.isApprover && project.status === ProjectStatus.IN_REVIEW) {
        const approvers = await transaction.projectMember.count({ where: { projectId, isApprover: true } });
        if (approvers <= 1) throw new ConflictError('Assign another Client approver or withdraw the active review first.');
      }

      await transaction.projectMember.update({
        where: { id: membership.id },
        data: { isApprover: input.isApprover },
        select: { id: true },
      });
      const changed = await transaction.project.updateMany({
        where: { id: projectId, version: project.version },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictError('The project changed in another session. Refresh and try again.');

      await recordActivity({
        projectId,
        userId: user.id,
        action: ActivityAction.MEMBER_APPROVER_CHANGED,
        message: input.isApprover ? 'Client assigned as an approver.' : 'Client approval authority removed.',
        metadata: { targetUserId, isApprover: input.isApprover },
      }, transaction);
      return { projectVersion: project.version + 1, isApprover: input.isApprover };
    });

    emitWorkspaceRefresh(request, projectId, 'approver-changed');
    disableResponseCaching(response);
    response.status(200).json(result);
  },
);

router.delete(
  '/:projectId/members/:userId',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId, userId: targetUserId } = memberParamsSchema.parse(request.params);
    const input = versionMutationSchema.parse(request.body);

    const projectVersion = await runSerializableTransaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: { id: projectId, ownerId: user.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
        select: { id: true, title: true, status: true, version: true },
      });
      if (!project) throw new NotFoundError('Project not found.');
      assertVersion(project.version, input.expectedVersion);

      const member = await transaction.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: targetUserId } },
        select: { id: true, isApprover: true },
      });
      if (!member) throw new NotFoundError('Project member not found.');
      if (member.isApprover && project.status === ProjectStatus.IN_REVIEW) {
        const approvers = await transaction.projectMember.count({ where: { projectId, isApprover: true } });
        if (approvers <= 1) throw new ConflictError('Assign another Client approver or withdraw the active review first.');
      }

      await transaction.projectMember.delete({ where: { id: member.id } });
      const changed = await transaction.project.updateMany({
        where: { id: projectId, version: project.version },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictError('The project changed in another session. Refresh and try again.');

      await recordActivity({
        projectId,
        userId: user.id,
        action: ActivityAction.MEMBER_REMOVED,
        message: 'Client access revoked.',
        metadata: { removedUserId: targetUserId },
      }, transaction);
      await createNotification({
        recipientId: targetUserId,
        actorId: user.id,
        projectId,
        type: NotificationType.ACCESS_REVOKED,
        title: 'Project access removed',
        body: `Your access to ${project.title} was removed.`,
        href: null,
        traceparent: response.locals.traceparent,
      }, transaction);
      return project.version + 1;
    });

    await emitMemberRemoved(request, projectId, targetUserId);
    disableResponseCaching(response);
    response.status(200).json({ message: 'Client access removed.', projectVersion });
  },
);

router.delete(
  '/:projectId',
  requireAuth,
  async (request: AuthRequest, response: Response): Promise<void> => {
    const user = getAuthenticatedUser(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const input = versionMutationSchema.parse(request.body);

    await runSerializableTransaction(async (transaction) => {
      const project = await transaction.project.findFirst({
        where: { id: projectId, ownerId: user.id },
        select: { id: true, version: true, deletionStatus: true },
      });
      if (!project) throw new NotFoundError('Project not found.');
      assertVersion(project.version, input.expectedVersion);
      if (project.deletionStatus === ProjectDeletionStatus.DELETED) throw new NotFoundError('Project not found.');
      if (project.deletionStatus === ProjectDeletionStatus.DELETING) {
        throw new ConflictError('Project deletion is already in progress.');
      }

      const changed = await transaction.project.updateMany({
        where: { id: projectId, ownerId: user.id, version: project.version, deletionStatus: ProjectDeletionStatus.ACTIVE },
        data: {
          deletionStatus: ProjectDeletionStatus.DELETING,
          deletionRequestedAt: new Date(),
          isArchived: true,
          archivedAt: new Date(),
          isDownloadUnlocked: false,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictError('The project changed in another session. Refresh and try again.');

      await transaction.projectInvitation.updateMany({
        where: { projectId, status: InvitationStatus.PENDING },
        data: {
          status: InvitationStatus.REVOKED,
          revokedAt: new Date(),
        },
      });
      await transaction.projectMember.deleteMany({ where: { projectId } });
      await recordActivity({
        projectId,
        userId: user.id,
        action: ActivityAction.PROJECT_DELETE_REQUESTED,
        message: 'Secure project deletion requested.',
      }, transaction);
    });

    await emitProjectDeleted(request, projectId);
    disableResponseCaching(response);
    response.status(202).json({
      message: 'Project access is closed. Private files are queued for secure deletion while audit evidence is retained.',
    });
  },
);

export default router;
