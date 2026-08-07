import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRegistrationAcceptedResponse,
  REGISTRATION_NEXT_STEP,
} from './registration-privacy.ts';

test('registration response depends only on verification policy', () => {
  assert.deepEqual(buildRegistrationAcceptedResponse(true), {
    message: 'Continue from your inbox, or sign in if you already have an account.',
    accepted: true,
    nextStep: REGISTRATION_NEXT_STEP.VERIFY_EMAIL,
  });

  assert.deepEqual(buildRegistrationAcceptedResponse(false), {
    message: 'Continue by signing in.',
    accepted: true,
    nextStep: REGISTRATION_NEXT_STEP.SIGN_IN,
  });
});

test('registration response never contains account identity or creation state', () => {
  for (const requireVerification of [true, false]) {
    const response = buildRegistrationAcceptedResponse(requireVerification) as unknown as Record<string, unknown>;
    assert.equal('user' in response, false);
    assert.equal('created' in response, false);
    assert.equal('exists' in response, false);
    assert.equal('status' in response, false);
  }
});
