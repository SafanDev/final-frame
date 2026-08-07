import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

export interface DocumentPublicKey {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
}

export interface SignedDocument<T> {
  schema: string;
  keyId: string;
  algorithm: 'Ed25519';
  publicKey: DocumentPublicKey;
  payload: T;
  digest: string;
  signature: string;
}

const canonicalize = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Signed documents cannot contain non-finite numbers.');
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Unsupported signed-document value: ${typeof value}`);
};

const documentMessage = (schema: string, keyId: string, digest: string): Buffer =>
  Buffer.from(`${schema}\n${keyId}\n${digest}`, 'utf8');

export const documentDigest = (schema: string, payload: unknown): string =>
  createHash('sha256').update(canonicalize({ schema, payload })).digest('hex');

export const deriveEd25519KeyPair = (secret: string): {
  privateKey: KeyObject;
  publicKey: DocumentPublicKey;
} => {
  // An Ed25519 PKCS#8 private key is a fixed ASN.1 prefix followed by a 32-byte
  // seed. Hashing a high-entropy deployment secret gives a deterministic key
  // while allowing the secret itself to remain in the platform secret store.
  const seed = createHash('sha256').update(secret, 'utf8').digest();
  const privateDer = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed,
  ]);
  const privateKey = createPrivateKey({ key: privateDer, format: 'der', type: 'pkcs8' });
  const exported = createPublicKey(privateKey).export({ format: 'jwk' }) as {
    kty?: string;
    crv?: string;
    x?: string;
  };
  if (exported.kty !== 'OKP' || exported.crv !== 'Ed25519' || typeof exported.x !== 'string') {
    throw new Error('Unable to derive the approval-certificate public key.');
  }

  return {
    privateKey,
    publicKey: { kty: 'OKP', crv: 'Ed25519', x: exported.x },
  };
};

export const signDocumentWithKey = <T>(input: {
  schema: string;
  payload: T;
  keyId: string;
  privateKey: KeyObject;
  publicKey: DocumentPublicKey;
}): SignedDocument<T> => {
  const digest = documentDigest(input.schema, input.payload);
  return {
    schema: input.schema,
    keyId: input.keyId,
    algorithm: 'Ed25519',
    publicKey: input.publicKey,
    payload: input.payload,
    digest,
    signature: sign(
      null,
      documentMessage(input.schema, input.keyId, digest),
      input.privateKey,
    ).toString('base64url'),
  };
};

export const verifyDocumentSignature = (document: SignedDocument<unknown>): boolean => {
  if (document.algorithm !== 'Ed25519') return false;
  const expectedDigest = documentDigest(document.schema, document.payload);
  if (expectedDigest !== document.digest) return false;
  if (
    document.publicKey.kty !== 'OKP'
    || document.publicKey.crv !== 'Ed25519'
    || typeof document.publicKey.x !== 'string'
    || document.publicKey.x.length > 100
  ) return false;

  try {
    const publicKeyJwk: Record<string, string> = {
      kty: document.publicKey.kty,
      crv: document.publicKey.crv,
      x: document.publicKey.x,
    };
    const publicKey = createPublicKey({ key: publicKeyJwk, format: 'jwk' });
    return verify(
      null,
      documentMessage(document.schema, document.keyId, document.digest),
      publicKey,
      Buffer.from(document.signature, 'base64url'),
    );
  } catch {
    return false;
  }
};

/**
 * Verifies document integrity against an explicit FinalFrame trust store.
 * Self-contained signatures are not sufficient because an attacker can create
 * a valid document with their own key. The key ID and public key must match a
 * configured trusted key before the cryptographic signature is accepted.
 */
export const verifyTrustedDocumentSignature = (
  document: SignedDocument<unknown>,
  trustedPublicKeys: ReadonlyMap<string, string>,
): boolean => {
  const trustedPublicKey = trustedPublicKeys.get(document.keyId);
  if (!trustedPublicKey || trustedPublicKey !== document.publicKey.x) return false;
  return verifyDocumentSignature(document);
};
