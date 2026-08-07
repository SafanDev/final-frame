import { prisma } from '../config/prisma.js';
import { AppError, AuthorizationError, NotFoundError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ProjectDeletionStatus, type ProjectStatus } from '../generated/prisma/enums.js';
import { assertPrivateWorkspaceAvailable } from './project-access-policy.js';

export interface ProjectAccess {
  id: string;
  ownerId: string;
  status: ProjectStatus;
  deletionStatus: ProjectDeletionStatus;
  isArchived: boolean;
  isDownloadUnlocked: boolean;
  isOwner: boolean;
  isApprover: boolean;
}

type ProjectClient = Pick<Prisma.TransactionClient, 'project'>;
const accessSelect = {
  id: true,
  ownerId: true,
  status: true,
  deletionStatus: true,
  isArchived: true,
  isDownloadUnlocked: true,
  members: { select: { userId: true, isApprover: true } },
} as const;

export async function requireProjectAccess(
  projectId: string,
  userId: string,
  client: ProjectClient = prisma,
): Promise<ProjectAccess> {
  const project = await client.project.findFirst({
    where: {
      id: projectId,
      deletionStatus: ProjectDeletionStatus.ACTIVE,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    select: accessSelect,
  });
  if (!project) throw new NotFoundError('Project not found.');
  const membership = project.members.find((member) => member.userId === userId);
  return {
    id: project.id,
    ownerId: project.ownerId,
    status: project.status,
    deletionStatus: project.deletionStatus,
    isArchived: project.isArchived,
    isDownloadUnlocked: project.isDownloadUnlocked,
    isOwner: project.ownerId === userId,
    isApprover: membership?.isApprover ?? false,
  };
}

export async function requireProjectOwner(
  projectId: string,
  userId: string,
  client: ProjectClient = prisma,
): Promise<ProjectAccess> {
  const project = await client.project.findFirst({
    where: { id: projectId, ownerId: userId, deletionStatus: ProjectDeletionStatus.ACTIVE },
    select: accessSelect,
  });
  if (!project) throw new NotFoundError('Project not found.');
  return {
    id: project.id,
    ownerId: project.ownerId,
    status: project.status,
    deletionStatus: project.deletionStatus,
    isArchived: project.isArchived,
    isDownloadUnlocked: project.isDownloadUnlocked,
    isOwner: true,
    isApprover: false,
  };
}

export function assertProjectAccessible(project: ProjectAccess): void {
  assertPrivateWorkspaceAvailable(project.deletionStatus);
}

export function assertProjectContentMutable(project: ProjectAccess): void {
  assertProjectAccessible(project);
  if (project.isArchived || project.status === 'APPROVED') {
    throw new AppError({ statusCode: 423, code: 'PROJECT_LOCKED', message: 'The project content is locked.', clientMessage: 'This project is read-only.' });
  }
}

export function assertDesignerAssetMutable(project: ProjectAccess): void {
  assertProjectContentMutable(project);
  if (!project.isOwner) throw new AuthorizationError('Only the Designer can change project files.');
  if (project.status === 'IN_REVIEW') {
    throw new AppError({ statusCode: 423, code: 'REVIEW_ACTIVE', message: 'Files are frozen during Client review.', clientMessage: 'Withdraw the review before changing files.' });
  }
}

export const requireMutableProjectAccess = async (projectId: string, userId: string): Promise<ProjectAccess> => {
  const access = await requireProjectAccess(projectId, userId);
  assertProjectContentMutable(access);
  return access;
};

export const requireMutableProjectOwner = async (projectId: string, userId: string): Promise<ProjectAccess> => {
  const access = await requireProjectOwner(projectId, userId);
  assertDesignerAssetMutable(access);
  return access;
};

export function assertCanDownloadOriginal(project: ProjectAccess): void {
  assertProjectAccessible(project);
  if (!project.isOwner && !project.isDownloadUnlocked) {
    throw new AppError({ statusCode: 423, code: 'DOWNLOAD_LOCKED', message: 'Original downloads are locked.', clientMessage: 'Original downloads are currently locked.' });
  }
}
