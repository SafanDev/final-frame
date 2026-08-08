export interface VersionedAssetRecord {
  id: string;
  stackKey: string;
  updatedAt: string;
}

export interface AssetMergeTombstones {
  ids?: ReadonlyMap<string, number>;
  stacks?: ReadonlyMap<string, number>;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isTombstoned(asset: VersionedAssetRecord, tombstones: AssetMergeTombstones): boolean {
  const updatedAt = timestamp(asset.updatedAt);
  const idCutoff = tombstones.ids?.get(asset.id);
  if (idCutoff !== undefined && updatedAt <= idCutoff) return true;
  const stackCutoff = tombstones.stacks?.get(asset.stackKey);
  return stackCutoff !== undefined && updatedAt <= stackCutoff;
}

export function mergeAssetsByFreshness<T extends VersionedAssetRecord>(
  current: readonly T[],
  incoming: readonly T[],
  tombstones: AssetMergeTombstones = {},
): T[] {
  const byId = new Map<string, T>();

  for (const asset of current) {
    if (!isTombstoned(asset, tombstones)) byId.set(asset.id, asset);
  }

  for (const asset of incoming) {
    if (isTombstoned(asset, tombstones)) continue;
    const existing = byId.get(asset.id);
    if (!existing || timestamp(asset.updatedAt) >= timestamp(existing.updatedAt)) {
      byId.set(asset.id, asset);
    }
  }

  return Array.from(byId.values());
}
