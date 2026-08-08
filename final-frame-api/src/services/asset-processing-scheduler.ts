import type { Request } from 'express';
import { logger } from '../utils/logger.js';

interface AssetProcessingWakeable {
  wake(): void;
}

function getWorker(request: Request): AssetProcessingWakeable | null {
  const candidate: unknown = request.app.get('assetProcessingWorker');
  if (!candidate || typeof candidate !== 'object') return null;
  const wake = (candidate as { wake?: unknown }).wake;
  return typeof wake === 'function' ? candidate as AssetProcessingWakeable : null;
}

export function wakeAssetProcessing(request: Request): void {
  try {
    getWorker(request)?.wake();
  } catch (error) {
    logger.warn('Asset processing worker could not be woken after upload', { error });
  }
}
