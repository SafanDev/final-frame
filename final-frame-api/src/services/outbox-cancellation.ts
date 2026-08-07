import type { Prisma } from '../generated/prisma/client.js';
import { EmailDeliveryStatus, EmailOutboxType } from '../generated/prisma/enums.js';
import { selectOutboxIdsByReference, type OutboxReferenceField } from './outbox-cancellation-policy.js';

const cancellableStatuses = [
  EmailDeliveryStatus.PENDING,
  EmailDeliveryStatus.FAILED,
  EmailDeliveryStatus.PROCESSING,
] as const;

interface CancelByPayloadReferenceInput {
  type: EmailOutboxType;
  userId: string;
  referenceField: OutboxReferenceField;
  referenceIds: readonly string[];
  reason: string;
}

/**
 * Cancels unsent email jobs and removes secret-bearing action URLs from their
 * payloads. A provider call already in flight can still complete, but its link
 * is invalid because the related invitation/token is revoked in the same
 * transaction.
 */
export async function cancelOutboxByPayloadReference(
  transaction: Prisma.TransactionClient,
  input: CancelByPayloadReferenceInput,
): Promise<number> {
  if (input.referenceIds.length === 0) return 0;

  const candidates = await transaction.emailOutbox.findMany({
    where: {
      type: input.type,
      userId: input.userId,
      status: { in: [...cancellableStatuses] },
    },
    select: { id: true, payload: true },
  });

  const ids = selectOutboxIdsByReference(
    candidates,
    input.referenceField,
    input.referenceIds,
  );

  if (ids.length === 0) return 0;
  const result = await transaction.emailOutbox.updateMany({
    where: { id: { in: ids }, status: { in: [...cancellableStatuses] } },
    data: {
      status: EmailDeliveryStatus.CANCELLED,
      lockedAt: null,
      lockedBy: null,
      lastError: input.reason.slice(0, 2_000),
      payload: { cancelled: true },
    },
  });
  return result.count;
}
