import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../errors/app-error.ts';
import {
  assertDesignerContentMutable,
  assertProjectStatusTransition,
  type TransitionContext,
  type ProjectStatusValue,
} from './project-workflow.ts';

const status = (value: ProjectStatusValue): ProjectStatusValue => value;

const baseTransition = (overrides: Partial<TransitionContext> = {}): TransitionContext => ({
  current: status('DRAFT'),
  target: status('IN_REVIEW'),
  isOwner: true,
  isApprover: false,
  finalAssetId: 'asset-1',
  cleanFinalAsset: true,
  approverCount: 1,
  blockingCommentCount: 0,
  ...overrides,
});

const expectCode = (callback: () => void, expectedCode: string): void => {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, expectedCode);
    return true;
  });
};

test('Designer can submit a verified final file to an assigned Client approver', () => {
  assert.doesNotThrow(() => assertProjectStatusTransition(baseTransition()));
});

test('submission requires a verified final file and Client approver', () => {
  expectCode(
    () => assertProjectStatusTransition(baseTransition({ cleanFinalAsset: false })),
    'CONFLICT',
  );
  expectCode(
    () => assertProjectStatusTransition(baseTransition({ approverCount: 0 })),
    'CONFLICT',
  );
});

test('Designer cannot approve their own submission', () => {
  expectCode(
    () => assertProjectStatusTransition(baseTransition({
      current: status('IN_REVIEW'),
      target: status('APPROVED'),
      isOwner: true,
      isApprover: false,
    })),
    'FORBIDDEN',
  );
});

test('only an assigned Client approver can approve', () => {
  expectCode(
    () => assertProjectStatusTransition(baseTransition({
      current: status('IN_REVIEW'),
      target: status('APPROVED'),
      isOwner: false,
      isApprover: false,
    })),
    'FORBIDDEN',
  );

  assert.doesNotThrow(() => assertProjectStatusTransition(baseTransition({
    current: status('IN_REVIEW'),
    target: status('APPROVED'),
    isOwner: false,
    isApprover: true,
  })));
});

test('blocking feedback prevents approval', () => {
  expectCode(
    () => assertProjectStatusTransition(baseTransition({
      current: status('IN_REVIEW'),
      target: status('APPROVED'),
      isOwner: false,
      isApprover: true,
      blockingCommentCount: 1,
    })),
    'CONFLICT',
  );
});

test('only the Designer can withdraw an active review', () => {
  expectCode(
    () => assertProjectStatusTransition(baseTransition({
      current: status('IN_REVIEW'),
      target: status('DRAFT'),
      isOwner: false,
    })),
    'FORBIDDEN',
  );

  assert.doesNotThrow(() => assertProjectStatusTransition(baseTransition({
    current: status('IN_REVIEW'),
    target: status('DRAFT'),
    isOwner: true,
  })));
});

test('Designer file mutations are frozen during Client review', () => {
  assert.doesNotThrow(() => assertDesignerContentMutable({
    isOwner: true,
    status: status('DRAFT'),
    isArchived: false,
    deletionStatus: 'ACTIVE',
  }));

  expectCode(
    () => assertDesignerContentMutable({
      isOwner: true,
      status: status('IN_REVIEW'),
      isArchived: false,
      deletionStatus: 'ACTIVE',
    }),
    'CONFLICT',
  );
});
