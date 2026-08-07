import assert from 'node:assert/strict';
import test from 'node:test';
import { selectOutboxIdsByReference } from './outbox-cancellation-policy.ts';

test('outbox cancellation selects only matching structured references', () => {
  assert.deepEqual(selectOutboxIdsByReference([
    { id: 'email-1', payload: { invitationId: 'invite-1', inviteUrl: 'secret' } },
    { id: 'email-2', payload: { invitationId: 'invite-2' } },
    { id: 'email-3', payload: { tokenId: 'token-1' } },
    { id: 'email-4', payload: null },
  ], 'invitationId', ['invite-2']), ['email-2']);
});

test('malformed payloads and duplicate references cannot broaden cancellation', () => {
  assert.deepEqual(selectOutboxIdsByReference([
    { id: 'email-1', payload: ['invite-1'] },
    { id: 'email-2', payload: { tokenId: 123 } },
    { id: 'email-3', payload: { tokenId: 'token-1' } },
  ], 'tokenId', ['token-1', 'token-1']), ['email-3']);
});
