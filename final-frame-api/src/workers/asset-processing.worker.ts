import { env } from '../config/env.js';
import { processAssetBatch } from '../services/asset-processing.js';
import { metrics } from '../services/metrics.js';
import { logger } from '../utils/logger.js';

export class AssetProcessingWorker {
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = true;

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(1_000);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.inFlight) await this.inFlight;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.inFlight = this.runCycle().finally(() => {
        this.inFlight = undefined;
        if (!this.stopped) this.schedule(env.ASSET_PROCESSING_INTERVAL_MS + Math.floor(Math.random() * 1_000));
      });
    }, delayMs);
    this.timer.unref();
  }

  private async runCycle(): Promise<void> {
    let startedAt = performance.now();
    try {
      startedAt = metrics.workerRun('asset-processing');
      const processed = await processAssetBatch();
      metrics.workerSuccess('asset-processing', startedAt, processed);
      if (processed > 0) logger.info('Asset processing cycle completed', { processed });
    } catch (error) {
      metrics.workerFailure('asset-processing', startedAt);
      logger.error('Asset processing cycle failed', { error });
    }
  }
}
