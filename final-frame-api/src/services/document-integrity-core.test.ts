import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveEd25519KeyPair,
  signDocumentWithKey,
  verifyDocumentSignature,
  verifyTrustedDocumentSignature,
} from './document-integrity-core.ts';

const pair = deriveEd25519KeyPair('test-only-high-entropy-signing-key-material-000000000000000000');

const signed = () => signDocumentWithKey({
  schema: 'finalframe.test.v1',
  payload: { projectId: 'project-1', approved: true, sequence: 3 },
  keyId: 'test-ed25519-v1',
  privateKey: pair.privateKey,
  publicKey: pair.publicKey,
});

test('Ed25519 evidence verifies when its payload is unchanged', () => {
  assert.equal(verifyDocumentSignature(signed()), true);
});

test('Ed25519 evidence fails after payload tampering', () => {
  const document = signed();
  document.payload = { ...document.payload, sequence: 4 };
  assert.equal(verifyDocumentSignature(document), false);
});

test('trusted verification rejects a self-consistent attacker document', () => {
  const attacker = deriveEd25519KeyPair('different-test-signing-key-material-111111111111111111111');
  const attackerDocument = signDocumentWithKey({
    schema: 'finalframe.test.v1',
    payload: { projectId: 'project-1', approved: true, sequence: 3 },
    keyId: 'attacker-key-v1',
    privateKey: attacker.privateKey,
    publicKey: attacker.publicKey,
  });

  assert.equal(verifyDocumentSignature(attackerDocument), true);
  assert.equal(
    verifyTrustedDocumentSignature(
      attackerDocument,
      new Map([['test-ed25519-v1', pair.publicKey.x]]),
    ),
    false,
  );
});

test('trusted verification accepts a configured rotation key', () => {
  const document = signed();
  assert.equal(
    verifyTrustedDocumentSignature(
      document,
      new Map([['test-ed25519-v1', pair.publicKey.x]]),
    ),
    true,
  );
});
