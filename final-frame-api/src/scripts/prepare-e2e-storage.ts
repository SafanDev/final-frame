import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { r2 } from '../config/storage.js';

const main = async (): Promise<void> => {
  if (env.NODE_ENV !== 'test' || process.env.E2E_STORAGE_PREPARE_CONFIRM !== 'true') {
    throw new Error('E2E storage preparation is allowed only with NODE_ENV=test and E2E_STORAGE_PREPARE_CONFIRM=true.');
  }
  if (!env.R2_ENDPOINT) {
    throw new Error('E2E storage preparation requires an explicit R2_ENDPOINT so it cannot modify production R2 accidentally.');
  }

  try {
    await r2.send(new HeadBucketCommand({ Bucket: env.R2_BUCKET_NAME }));
  } catch {
    await r2.send(new CreateBucketCommand({ Bucket: env.R2_BUCKET_NAME }));
  }

  const useServerCors = process.env.E2E_STORAGE_USE_SERVER_CORS === 'true';

  if (useServerCors) {
    const endpoint = new URL(env.R2_ENDPOINT);
    const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

    if (!localHosts.has(endpoint.hostname)) {
      throw new Error('Server-managed E2E CORS is allowed only for a localhost storage endpoint.');
    }
  } else {
    await r2.send(new PutBucketCorsCommand({
      Bucket: env.R2_BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'HEAD', 'PUT'],
          AllowedOrigins: [new URL(env.FRONTEND_URL).origin],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3_600,
        }],
      },
    }));
  }

  process.stdout.write(`${JSON.stringify({
    prepared: true,
    bucket: env.R2_BUCKET_NAME,
    endpoint: env.R2_ENDPOINT,
    cors: useServerCors ? 'server-managed' : 'bucket-managed',
  })}\n`);
};

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'E2E storage preparation failed.'}\n`);
  process.exitCode = 1;
});
