import type { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { disableResponseCaching } from '../utils/http.js';

const PAGE_SIZE = 500;

type CursorRecord = { id: string };

const writeLine = async (response: Response, value: unknown): Promise<void> => {
  if (response.destroyed || response.writableEnded) throw new Error('ACCOUNT_EXPORT_ABORTED');
  if (response.write(`${JSON.stringify(value)}\n`)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      response.off('drain', onDrain);
      response.off('close', onClose);
      response.off('error', onError);
    };
    const onDrain = (): void => { cleanup(); resolve(); };
    const onClose = (): void => { cleanup(); reject(new Error('ACCOUNT_EXPORT_ABORTED')); };
    const onError = (error: Error): void => { cleanup(); reject(error); };
    response.once('drain', onDrain);
    response.once('close', onClose);
    response.once('error', onError);
  });
};

const streamCursorPages = async <T extends CursorRecord>(input: {
  response: Response;
  type: string;
  load: (cursor?: string) => Promise<T[]>;
}): Promise<void> => {
  let cursor: string | undefined;
  while (!input.response.destroyed && !input.response.writableEnded) {
    const items = await input.load(cursor);
    for (const item of items) await writeLine(input.response, { type: input.type, data: item });
    if (items.length < PAGE_SIZE) return;
    cursor = items.at(-1)?.id;
  }
};

export const streamAccountExport = async (response: Response, userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      storageUsedBytes: true,
      monthlyAiRequests: true,
      quotaResetAt: true,
      status: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      mfaEnabled: true,
      notificationDelivery: true,
      locale: true,
      timeZone: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw new Error('ACCOUNT_NOT_FOUND');

  disableResponseCaching(response);
  response.status(200);
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="finalframe-account-${user.id}.ndjson"`);
  response.flushHeaders();
  await writeLine(response, {
    type: 'export',
    schema: 'finalframe.account-export.v2',
    generatedAt: new Date().toISOString(),
  });
  await writeLine(response, { type: 'account', data: { ...user, storageUsedBytes: user.storageUsedBytes.toString() } });

  await streamCursorPages({
    response,
    type: 'owned-project',
    load: (cursor) => prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, title: true, description: true, status: true, version: true,
        isArchived: true, archivedAt: true, isDownloadUnlocked: true, aiEnabled: true,
        deletionStatus: true, deletionRequestedAt: true, deletedAt: true,
        finalAssetId: true, createdAt: true, updatedAt: true,
      },
    }),
  });
  await streamCursorPages({
    response,
    type: 'owned-asset',
    load: (cursor) => prisma.asset.findMany({
      where: { project: { ownerId: userId } },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, projectId: true, fileName: true, normalizedName: true, stackKey: true,
        mimeType: true, fileSize: true, sha256: true, previewMimeType: true,
        previewFileSize: true, width: true, height: true, durationSeconds: true,
        processingStatus: true, processingError: true, version: true, createdAt: true, updatedAt: true,
      },
    }),
  });
  await streamCursorPages({
    response,
    type: 'membership',
    load: (cursor) => prisma.projectMember.findMany({
      where: { userId }, orderBy: { id: 'asc' }, take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, projectId: true, isApprover: true, joinedAt: true, updatedAt: true },
    }),
  });
  await streamCursorPages({
    response,
    type: 'comment',
    load: (cursor) => prisma.comment.findMany({
      where: { authorId: userId }, orderBy: { id: 'asc' }, take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, assetId: true, text: true, anchorType: true, xPos: true, yPos: true,
        pageNumber: true, lineStart: true, lineEnd: true, columnStart: true, columnEnd: true,
        timestamp: true, isBlocking: true, isResolved: true, isDeleted: true,
        editedAt: true, deletedAt: true, createdAt: true, updatedAt: true,
      },
    }),
  });
  await streamCursorPages({
    response,
    type: 'comment-revision',
    load: (cursor) => prisma.commentRevision.findMany({
      where: { OR: [{ editorId: userId }, { comment: { authorId: userId } }] },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, commentId: true, editorId: true, previousText: true, newText: true, createdAt: true },
    }),
  });
  await streamCursorPages({
    response,
    type: 'invitation',
    load: (cursor) => prisma.projectInvitation.findMany({
      where: { OR: [{ createdById: userId }, { acceptedById: userId }, { invitedEmail: user.email }] },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, projectId: true, invitedEmail: true, status: true, canApprove: true,
        expiresAt: true, acceptedAt: true, acceptedById: true, revokedAt: true,
        createdById: true, deliveryStatus: true, createdAt: true, updatedAt: true,
      },
    }),
  });
  await streamCursorPages({
    response,
    type: 'approval',
    load: (cursor) => prisma.approvalEvent.findMany({
      where: { OR: [{ actorId: userId }, { project: { ownerId: userId } }] }, orderBy: { id: 'asc' }, take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, projectId: true, decision: true, projectVersion: true, assetId: true,
        reason: true, snapshot: true, certificateDigest: true, certificateSignature: true,
        certificatePublicKey: true, certificateKeyId: true, createdAt: true,
      },
    }),
  });
  await streamCursorPages({
    response,
    type: 'activity',
    load: (cursor) => prisma.activityLog.findMany({
      where: { userId }, orderBy: { id: 'asc' }, take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, projectId: true, action: true, details: true, createdAt: true },
    }),
  });
  await streamCursorPages({
    response,
    type: 'notification',
    load: (cursor) => prisma.notification.findMany({
      where: { recipientId: userId }, orderBy: { id: 'asc' }, take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, projectId: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    }),
  });

  await writeLine(response, { type: 'end', generatedAt: new Date().toISOString() });
  response.end();
};
