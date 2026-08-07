import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveEmailDeliveryMode,
  shouldRequireEmailVerification,
} from './email-delivery-policy.ts';

test('auto mode uses Resend only when both sender values exist', () => {
  assert.equal(resolveEmailDeliveryMode('auto'), 'disabled');
  assert.equal(resolveEmailDeliveryMode('auto', 'key'), 'disabled');
  assert.equal(resolveEmailDeliveryMode('auto', undefined, 'mail@example.com'), 'disabled');
  assert.equal(resolveEmailDeliveryMode('auto', 'key', 'mail@example.com'), 'resend');
});

test('explicit modes do not depend on optional credentials', () => {
  assert.equal(resolveEmailDeliveryMode('disabled', 'key', 'mail@example.com'), 'disabled');
  assert.equal(resolveEmailDeliveryMode('resend'), 'resend');
});

test('email verification is required only with active email delivery', () => {
  assert.equal(shouldRequireEmailVerification(true, 'resend'), true);
  assert.equal(shouldRequireEmailVerification(true, 'disabled'), false);
  assert.equal(shouldRequireEmailVerification(false, 'resend'), false);
});
