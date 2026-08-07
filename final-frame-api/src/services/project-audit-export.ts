import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { signDocument } from './document-integrity.js';

interface AuditExportInput {
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  response: Response;
}

const safeDownloadName = (title: string): string => {
  const normalized = title
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'project';
};

export const streamProjectAuditExport = async ({
  projectId,
  projectTitle,
  exportedAt,
  response,
}: AuditExportInput): Promise<void> => {
  response.status(200);
  response.type('application/x-ndjson; charset=utf-8');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeDownloadName(projectTitle)}-audit.ndjson"`,
  );
  response.setHeader('Cache-Control', 'no-store, private');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.flushHeaders();

  const contentHash = createHash('sha256');
  let recordCount = 0;

  const waitForDrain = async (): Promise<void> => {
    if (response.destroyed || response.writableEnded) {
      throw new Error('Audit export connection closed.');
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        response.off('drain', onDrain);
        response.off('close', onClose);
        response.off('error', onError);
      };
      const onDrain = (): void => {
        cleanup();
        resolve();
      };
      const onClose = (): void => {
        cleanup();
        reject(new Error('Audit export connection closed.'));
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };

      response.once('drain', onDrain);
      response.once('close', onClose);
      response.once('error', onError);
    });
  };

  const writeRecord = async (record: unknown, includeInDigest = true): Promise<void> => {
    if (response.destroyed || response.writableEnded) {
      throw new Error('Audit export connection closed.');
    }
    const line = `${JSON.stringify(record)}\n`;
    if (includeInDigest) {
      contentHash.update(line);
      recordCount += 1;
    }
    if (!response.write(line)) await waitForDrain();
  };

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      archivedAt: true,
      isDownloadUnlocked: true,
      aiEnabled: true,
      deletionStatus: true,
      deletionRequestedAt: true,
      deletedAt: true,
      finalAssetId: true,
      owner: { select: { id: true, name: true, email: true } },
      members: {
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          isApprover: true,
          joinedAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true, status: true } },
        },
      },
      invitations: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
          createdAt: true,
          updatedAt: true,
          acceptedBy: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  await writeRecord({
    type: 'manifest',
    schema: 'finalframe.project-audit.v1',
    exportedAt,
    projectId,
  });
  await writeRecord({ type: 'project', data: project });

  const emitPages = async <T extends { id: string }>(
    type: string,
    queryPage: (afterId: string | undefined) => Promise<T[]>,
  ): Promise<void> => {
    let afterId: string | undefined;
    while (true) {
      const page = await queryPage(afterId);
      for (const item of page) await writeRecord({ type, data: item });
      if (page.length < 100) return;
      afterId = page.at(-1)?.id;
      if (!afterId) return;
    }
  };

  await emitPages('asset', (afterId) => prisma.asset.findMany({
    where: { projectId, ...(afterId ? { id: { gt: afterId } } : {}) },
    orderBy: { id: 'asc' },
    take: 100,
    select: {
      id: true,
      fileName: true,
      normalizedName: true,
      stackKey: true,
      mimeType: true,
      fileSize: true,
      sha256: true,
      previewMimeType: true,
      previewFileSize: true,
      width: true,
      height: true,
      durationSeconds: true,
      processingStatus: true,
      processingError: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  }));

  await emitPages('comment', (afterId) => prisma.comment.findMany({
    where: { asset: { projectId }, ...(afterId ? { id: { gt: afterId } } : {}) },
    orderBy: { id: 'asc' },
    take: 100,
    select: {
      id: true,
      text: true,
      anchorType: true,
      xPos: true,
      yPos: true,
      pageNumber: true,
      lineStart: true,
      lineEnd: true,
      columnStart: true,
      columnEnd: true,
      timestamp: true,
      audioMimeType: true,
      audioFileSize: true,
      isBlocking: true,
      isResolved: true,
      isDeleted: true,
      editedAt: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      assetId: true,
      author: { select: { id: true, name: true, email: true } },
      revisions: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          previousText: true,
          newText: true,
          createdAt: true,
          editor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  }));

  await emitPages('approval-event', (afterId) => prisma.approvalEvent.findMany({
    where: { projectId, ...(afterId ? { id: { gt: afterId } } : {}) },
    orderBy: { id: 'asc' },
    take: 100,
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
      actor: { select: { id: true, name: true, email: true } },
    },
  }));

  await emitPages('activity', (afterId) => prisma.activityLog.findMany({
    where: { projectId, ...(afterId ? { id: { gt: afterId } } : {}) },
    orderBy: { id: 'asc' },
    take: 100,
    select: {
      id: true,
      action: true,
      details: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  }));

  const contentDigest = contentHash.digest('hex');
  const signedManifest = signDocument('finalframe.project-audit-manifest.v1', {
    projectId,
    projectTitle,
    exportedAt,
    recordCount,
    contentDigest,
  });
  await writeRecord({ type: 'signature', data: signedManifest }, false);
  response.end();
};
