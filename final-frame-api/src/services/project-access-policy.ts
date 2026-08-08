import { AppError } from '../errors/app-error.ts';

export const PROJECT_DELETION_STATUS = {
  ACTIVE: 'ACTIVE',
  DELETING: 'DELETING',
  DELETED: 'DELETED',
} as const;

export type ProjectDeletionStatusValue = typeof PROJECT_DELETION_STATUS[keyof typeof PROJECT_DELETION_STATUS];

/**
 * Private workspace content becomes unavailable as soon as secure deletion is
 * requested. Waiting until the deletion worker finishes would leave a window
 * where old members could continue requesting previews, comments, or audio.
 */
export function assertPrivateWorkspaceAvailable(status: ProjectDeletionStatusValue): void {
  if (status !== PROJECT_DELETION_STATUS.ACTIVE) {
    throw new AppError({
      statusCode: 410,
      code: 'PROJECT_DELETING',
      message: 'The project is being deleted.',
      clientMessage: 'This project is no longer available.',
    });
  }
}
