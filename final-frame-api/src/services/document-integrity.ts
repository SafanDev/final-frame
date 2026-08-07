import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import {
  deriveEd25519KeyPair,
  documentDigest,
  signDocumentWithKey,
  verifyTrustedDocumentSignature,
  type DocumentPublicKey,
  type SignedDocument,
} from './document-integrity-core.js';

export { documentDigest, type DocumentPublicKey, type SignedDocument };

let signingKeyPair: ReturnType<typeof deriveEd25519KeyPair> | undefined;
let trustedPublicKeys: ReadonlyMap<string, string> | undefined;

const getSigningKeyPair = (): ReturnType<typeof deriveEd25519KeyPair> => {
  signingKeyPair ??= deriveEd25519KeyPair(env.CERTIFICATE_SIGNING_KEY);
  return signingKeyPair;
};

const getTrustedPublicKeys = (): ReadonlyMap<string, string> => {
  if (trustedPublicKeys) return trustedPublicKeys;

  const configured = JSON.parse(env.CERTIFICATE_TRUSTED_PUBLIC_KEYS_JSON) as Record<string, string>;
  const keys = new Map(Object.entries(configured));
  keys.set(env.CERTIFICATE_KEY_ID, getSigningKeyPair().publicKey.x);
  trustedPublicKeys = keys;
  return keys;
};

export const signDocument = <T>(schema: string, payload: T): SignedDocument<T> => {
  const pair = getSigningKeyPair();
  return signDocumentWithKey({
    schema,
    payload,
    keyId: env.CERTIFICATE_KEY_ID,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
  });
};

/**
 * Verifies both cryptographic integrity and FinalFrame key trust. A document
 * signed by an arbitrary attacker-controlled key is therefore rejected even if
 * its self-contained Ed25519 signature is internally consistent.
 */
export const verifySignedDocument = (document: SignedDocument<unknown>): boolean =>
  verifyTrustedDocumentSignature(document, getTrustedPublicKeys());

export const currentDocumentTrust = (): {
  keyId: string;
  algorithm: 'Ed25519';
  publicKey: DocumentPublicKey;
  fingerprint: string;
} => {
  const publicKey = getSigningKeyPair().publicKey;
  return {
    keyId: env.CERTIFICATE_KEY_ID,
    algorithm: 'Ed25519',
    publicKey,
    fingerprint: createHash('sha256').update(publicKey.x, 'utf8').digest('hex'),
  };
};
