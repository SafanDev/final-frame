import { disconnectPrisma, prisma } from '../config/prisma.js';
import { EmailDeliveryStatus, EmailOutboxType, StorageDeletionStatus } from '../generated/prisma/enums.js';

const options = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const separator = argument.indexOf('=');
  if (!argument.startsWith('--')) continue;
  options.set(
    separator === -1 ? argument.slice(2) : argument.slice(2, separator),
    separator === -1 ? 'true' : argument.slice(separator + 1),
  );
}

const action = options.get('action') ?? 'list';
const kind = options.get('kind') ?? 'all';
const id = options.get('id') ?? '';
const confirmation = options.get('confirm') ?? '';
const requireEmpty = options.get('require-empty') === 'true';
const limit = Number(options.get('limit') ?? '100');

if (!['list', 'replay'].includes(action)) throw new Error('--action must be list or replay.');
if (!['all', 'email', 'storage'].includes(kind)) throw new Error('--kind must be all, email, or storage.');
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('--limit must be an integer between 1 and 500.');
if (action === 'replay' && kind === 'all') throw new Error('Replay requires --kind=email or --kind=storage.');
if (action === 'replay' && (!id || confirmation !== id)) {
  throw new Error('Replay requires --id=<dead-letter-id> and an exact --confirm=<dead-letter-id>.');
}

const maskEmail = (value: string): string => {
  const [local = '', domain = ''] = value.split('@');
  if (!domain) return 'redacted';
  return `${local.slice(0, 1) || '*'}***@${domain}`;
};

const listDeadLetters = async () => {
  const [email, storage] = await Promise.all([
    kind === 'storage'
      ? Promise.resolve([])
      : prisma.emailOutbox.findMany({
          where: { status: EmailDeliveryStatus.ABANDONED },
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: limit,
          select: {
            id: true,
            type: true,
            recipient: true,
            attempts: true,
            lastError: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
    kind === 'email'
      ? Promise.resolve([])
      : prisma.storageDeletionTask.findMany({
          where: { status: StorageDeletionStatus.ABANDONED },
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: limit,
          select: {
            id: true,
            attempts: true,
            lastError: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
  ]);

  const result = {
    checkedAt: new Date().toISOString(),
    email: email.map((item) => ({
      id: item.id,
      type: item.type,
      recipient: maskEmail(item.recipient),
      attempts: item.attempts,
      lastError: item.lastError,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    storage,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (requireEmpty && email.length + storage.length > 0) process.exitCode = 2;
};

const replayEmail = async (): Promise<void> => {
  const item = await prisma.emailOutbox.findUnique({
    where: { id },
    select: { id: true, type: true, payload: true, status: true },
  });
  if (!item || item.status !== EmailDeliveryStatus.ABANDONED) {
    throw new Error('Email outbox item is not an abandoned dead letter.');
  }

  await prisma.$transaction(async (transaction) => {
    const replayed = await transaction.emailOutbox.updateMany({
      where: { id, status: EmailDeliveryStatus.ABANDONED },
      data: {
        status: EmailDeliveryStatus.FAILED,
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
    if (replayed.count !== 1) throw new Error('Email dead letter changed before replay could be scheduled.');

    if (item.type === EmailOutboxType.NOTIFICATION && item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)) {
      const notificationIds = (item.payload as Record<string, unknown>).notificationIds;
      if (Array.isArray(notificationIds)) {
        const ids = notificationIds.filter((candidate): candidate is string => typeof candidate === 'string');
        if (ids.length) {
          await transaction.notification.updateMany({
            where: { id: { in: ids }, emailStatus: EmailDeliveryStatus.ABANDONED },
            data: { emailStatus: EmailDeliveryStatus.FAILED },
          });
        }
      }
    }
  });
};

const replayStorage = async (): Promise<void> => {
  const replayed = await prisma.storageDeletionTask.updateMany({
    where: { id, status: StorageDeletionStatus.ABANDONED },
    data: {
      status: StorageDeletionStatus.FAILED,
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
  if (replayed.count !== 1) throw new Error('Storage deletion item is not an abandoned dead letter or changed before replay.');
};

try {
  await prisma.$connect();
  if (action === 'list') {
    await listDeadLetters();
  } else {
    if (kind === 'email') await replayEmail();
    else await replayStorage();
    process.stdout.write(`${JSON.stringify({ replayScheduled: true, kind, id, scheduledAt: new Date().toISOString() }, null, 2)}\n`);
  }
} finally {
  await disconnectPrisma();
}
