import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  verifyDocumentSignature,
  type SignedDocument,
} from '../services/document-integrity-core.js';

interface TrustInput {
  keyId: string;
  publicKey: string;
}

const argumentsMap = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const separator = argument.indexOf('=');
  if (!argument.startsWith('--') || separator < 3) continue;
  argumentsMap.set(argument.slice(2, separator), argument.slice(separator + 1));
}

const filePath = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const trust: TrustInput = {
  keyId: argumentsMap.get('trusted-key-id') ?? '',
  publicKey: argumentsMap.get('trusted-public-key') ?? '',
};

const fail = (message: string): never => {
  process.stderr.write(`${JSON.stringify({ valid: false, error: message })}\n`);
  process.exit(1);
  throw new Error('UNREACHABLE_AFTER_EXIT');
};

const isSignedDocument = (value: unknown): value is SignedDocument<unknown> => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const publicKey = record.publicKey as Record<string, unknown> | undefined;
  return typeof record.schema === 'string'
    && typeof record.keyId === 'string'
    && record.algorithm === 'Ed25519'
    && typeof record.digest === 'string'
    && typeof record.signature === 'string'
    && publicKey?.kty === 'OKP'
    && publicKey.crv === 'Ed25519'
    && typeof publicKey.x === 'string';
};

const trustedAndValid = (document: SignedDocument<unknown>): boolean =>
  document.keyId === trust.keyId
  && document.publicKey.x === trust.publicKey
  && verifyDocumentSignature(document);

const verifyCertificate = async (path: string): Promise<Record<string, unknown>> => {
  const stat = await fs.stat(path);
  if (stat.size > 4 * 1024 * 1024) fail('Certificate file is unexpectedly large.');
  const parsed = JSON.parse(await fs.readFile(path, 'utf8')) as unknown;
  if (!isSignedDocument(parsed)) return fail('Certificate is not a supported signed document.');
  const document: SignedDocument<unknown> = parsed;
  if (!trustedAndValid(document)) return fail('Certificate signature or trusted key does not match.');
  return { valid: true, kind: 'certificate', schema: document.schema, keyId: document.keyId, digest: document.digest };
};

const verifyAudit = async (path: string): Promise<Record<string, unknown>> => {
  const reader = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  const hash = createHash('sha256');
  let previousLine: string | undefined;
  let recordCount = 0;

  for await (const line of reader) {
    if (previousLine !== undefined) {
      hash.update(`${previousLine}\n`, 'utf8');
      recordCount += 1;
    }
    previousLine = line;
  }

  if (!previousLine) return fail('Audit export is empty.');
  const signatureLine: string = previousLine;
  let finalRecord: unknown;
  try {
    finalRecord = JSON.parse(signatureLine) as unknown;
  } catch {
    fail('Audit export signature record is invalid JSON.');
  }
  if (!finalRecord || typeof finalRecord !== 'object') return fail('Audit export signature record is invalid.');
  const record = finalRecord as Record<string, unknown>;
  const documentCandidate = record.data;
  if (record.type !== 'signature' || !isSignedDocument(documentCandidate)) {
    return fail('Audit export does not end with a supported signature record.');
  }
  const document: SignedDocument<unknown> = documentCandidate;
  if (!trustedAndValid(document)) fail('Audit signature or trusted key does not match.');
  if (!document.payload || typeof document.payload !== 'object') fail('Audit signature payload is invalid.');
  const payload = document.payload as Record<string, unknown>;
  const contentDigest = hash.digest('hex');
  if (payload.contentDigest !== contentDigest || payload.recordCount !== recordCount) {
    fail('Audit records were added, removed, reordered, or modified.');
  }

  return {
    valid: true,
    kind: 'audit',
    schema: document.schema,
    keyId: document.keyId,
    digest: document.digest,
    contentDigest,
    recordCount,
  };
};

const main = async (): Promise<void> => {
  const evidencePath = filePath ?? fail('Provide a certificate JSON or audit NDJSON file path.');
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(trust.keyId)) fail('Provide --trusted-key-id=<key-id>.');
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(trust.publicKey)) fail('Provide --trusted-public-key=<base64url-key>.');

  const result = evidencePath.endsWith('.ndjson')
    ? await verifyAudit(evidencePath)
    : await verifyCertificate(evidencePath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : 'Evidence verification failed.');
});
