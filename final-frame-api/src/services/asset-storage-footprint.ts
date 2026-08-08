export interface AssetAudioStorage {
  audioKey: string | null;
  audioFileSize: number | bigint | null;
}

export interface AssetStorageFootprintInput {
  storageKey: string;
  previewKey: string | null;
  fileSize: number | bigint;
  previewFileSize: number | bigint | null;
  originalRetiredAt: Date | string | null;
  comments: AssetAudioStorage[];
}

export interface AssetStorageFootprint {
  objectKeys: string[];
  accountedBytes: bigint;
}

const addObject = (
  objectSizes: Map<string, bigint>,
  key: string | null,
  size: number | bigint | null,
): void => {
  if (!key) return;
  const bytes = BigInt(size ?? 0);
  const current = objectSizes.get(key);
  // A storage key names one physical object. If malformed legacy rows refer to
  // it repeatedly, use the largest verified size and delete/account it once.
  if (current === undefined || bytes > current) objectSizes.set(key, bytes);
};

/**
 * Returns the unique private objects and quota bytes still owned by one or
 * more Asset rows. Deduplication is deliberately performed across the entire
 * input collection so stack and project deletion cannot subtract one object
 * multiple times when legacy data contains duplicate references.
 */
export function getAssetsStorageFootprint(
  assets: readonly AssetStorageFootprintInput[],
): AssetStorageFootprint {
  const objectSizes = new Map<string, bigint>();

  for (const asset of assets) {
    if (!asset.originalRetiredAt) addObject(objectSizes, asset.storageKey, asset.fileSize);
    addObject(objectSizes, asset.previewKey, asset.previewFileSize);
    for (const comment of asset.comments) addObject(objectSizes, comment.audioKey, comment.audioFileSize);
  }

  const accountedBytes = [...objectSizes.values()].reduce((total, bytes) => total + bytes, 0n);
  return { objectKeys: [...objectSizes.keys()], accountedBytes };
}

export function getAssetStorageFootprint(asset: AssetStorageFootprintInput): AssetStorageFootprint {
  return getAssetsStorageFootprint([asset]);
}
