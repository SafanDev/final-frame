import { disconnectPrisma, prisma } from '../config/prisma.js';
import { destroyStorageClient } from '../config/storage.js';
import { env } from '../config/env.js';
import { reconcileStorage } from '../services/storage-reconciliation.js';

const apply = process.argv.includes('--apply');
const confirmation = process.argv.find((argument) => argument.startsWith('--confirm-bucket='))
  ?.slice('--confirm-bucket='.length);

if (apply && confirmation !== env.R2_BUCKET_NAME) {
  throw new Error(`Applying reconciliation requires --confirm-bucket=${env.R2_BUCKET_NAME}`);
}

try {
  await prisma.$connect();
  const report = await reconcileStorage({ apply });
  process.stdout.write(`${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...report }, null, 2)}\n`);
  if (report.missingReferencedObjects > 0 || report.abandonedDeletionTasks > 0) process.exitCode = 2;
} finally {
  destroyStorageClient();
  await disconnectPrisma();
}
