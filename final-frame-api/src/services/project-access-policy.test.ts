import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../errors/app-error.ts';
import {
  assertPrivateWorkspaceAvailable,
  PROJECT_DELETION_STATUS,
} from './project-access-policy.ts';

test('active projects retain private workspace access', () => {
  assert.doesNotThrow(() => assertPrivateWorkspaceAvailable(PROJECT_DELETION_STATUS.ACTIVE));
});

for (const status of [PROJECT_DELETION_STATUS.DELETING, PROJECT_DELETION_STATUS.DELETED] as const) {
  test(`${status.toLowerCase()} projects revoke private workspace access`, () => {
    assert.throws(
      () => assertPrivateWorkspaceAvailable(status),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 410);
        assert.equal(error.code, 'PROJECT_DELETING');
        return true;
      },
    );
  });
}
