export type OutboxReferenceField = 'invitationId' | 'tokenId';

export interface OutboxPayloadCandidate {
  id: string;
  payload: unknown;
}

function payloadReference(payload: unknown, field: OutboxReferenceField): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
}

/** Selects only jobs whose structured payload references a revoked secret. */
export function selectOutboxIdsByReference(
  candidates: readonly OutboxPayloadCandidate[],
  field: OutboxReferenceField,
  referenceIds: readonly string[],
): string[] {
  const references = new Set(referenceIds);
  if (references.size === 0) return [];
  return candidates
    .filter((candidate) => {
      const reference = payloadReference(candidate.payload, field);
      return reference !== null && references.has(reference);
    })
    .map((candidate) => candidate.id);
}
