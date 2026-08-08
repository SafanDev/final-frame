import { AppError, AuthorizationError, ConflictError } from '../errors/app-error.ts';

export const PROJECT_STATUS = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
} as const;

export type ProjectStatusValue = typeof PROJECT_STATUS[keyof typeof PROJECT_STATUS];

export interface TransitionContext {
  current: ProjectStatusValue;
  target: ProjectStatusValue;
  isOwner: boolean;
  isApprover: boolean;
  finalAssetId: string | null;
  cleanFinalAsset: boolean;
  approverCount: number;
  blockingCommentCount: number;
}

const invalidTransition = (current: ProjectStatusValue, target: ProjectStatusValue) => new ConflictError(
  `The project cannot move from ${current} to ${target}. Refresh the workspace and try again.`,
);

export function assertProjectStatusTransition(context: TransitionContext): void {
  if (context.current === context.target) {
    throw new AppError({
      statusCode: 400,
      code: 'NO_PROJECT_CHANGES',
      message: 'The requested project status is already active.',
      clientMessage: 'The project is already in that review state.',
    });
  }

  const designerTransition =
    (context.current === PROJECT_STATUS.DRAFT && context.target === PROJECT_STATUS.IN_REVIEW) ||
    (context.current === PROJECT_STATUS.CHANGES_REQUESTED && context.target === PROJECT_STATUS.IN_REVIEW) ||
    (context.current === PROJECT_STATUS.IN_REVIEW && context.target === PROJECT_STATUS.DRAFT);

  if (designerTransition) {
    if (!context.isOwner) throw new AuthorizationError('Only the Designer can submit or withdraw a review.');
    if (context.target === PROJECT_STATUS.IN_REVIEW) {
      if (!context.finalAssetId || !context.cleanFinalAsset) {
        throw new ConflictError('Choose a fully processed final file before submitting for review.');
      }
      if (context.approverCount < 1) {
        throw new ConflictError('Assign at least one Client approver before submitting for review.');
      }
    }
    return;
  }

  if (context.current === PROJECT_STATUS.IN_REVIEW && context.target === PROJECT_STATUS.CHANGES_REQUESTED) {
    if (context.isOwner) throw new AuthorizationError('The Designer cannot request changes on their own submission.');
    return;
  }

  if (context.current === PROJECT_STATUS.IN_REVIEW && context.target === PROJECT_STATUS.APPROVED) {
    if (!context.isApprover) throw new AuthorizationError('Only an assigned Client approver can approve this project.');
    if (!context.finalAssetId || !context.cleanFinalAsset) {
      throw new ConflictError('The submitted final file is unavailable or has not passed processing.');
    }
    if (context.blockingCommentCount > 0) {
      throw new ConflictError('Resolve all blocking feedback before approval.');
    }
    return;
  }

  throw invalidTransition(context.current, context.target);
}

export function assertDesignerContentMutable(project: {
  isOwner: boolean;
  status: ProjectStatusValue;
  isArchived: boolean;
  deletionStatus: string;
}): void {
  if (!project.isOwner) throw new AuthorizationError('Only the Designer can change project files.');
  if (project.deletionStatus !== 'ACTIVE' || project.isArchived) {
    throw new ConflictError('This project is read-only.');
  }
  if (project.status !== PROJECT_STATUS.DRAFT && project.status !== PROJECT_STATUS.CHANGES_REQUESTED) {
    throw new ConflictError('Files are frozen while the Client review is active. Withdraw the review before editing files.');
  }
}
