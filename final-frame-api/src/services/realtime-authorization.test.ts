import assert from 'node:assert/strict';
import test from 'node:test';
import { canPublishWorkspaceEvent } from './realtime-authorization.ts';

test('realtime events stay inside the workspace authorized by a successful join', () => {
  assert.equal(canPublishWorkspaceEvent(undefined, 'project-a'), false);
  assert.equal(canPublishWorkspaceEvent('project-a', 'project-b'), false);
  assert.equal(canPublishWorkspaceEvent('project-a', 'project-a'), true);
});
