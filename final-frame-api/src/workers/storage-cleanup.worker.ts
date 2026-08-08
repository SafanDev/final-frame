import { env } from '../config/env.js';
import {
  processStorageDeletionBatch,
  queueExpiredUploadReservations,
} from '../services/storage-cleanup.js';
import { metrics } from '../services/metrics.js';
import { logger } from '../utils/logger.js';

/**
 * Schedules bounded cleanup cycles without overlapping work in one process.
 * Database row locking inside the service keeps the same worker safe when the
 * API is horizontally scaled across multiple instances.
 */
export class StorageCleanupWorker {
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

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.inFlight) await this.inFlight;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;

    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.inFlight = this.runCycle().finally(() => {
        this.inFlight = undefined;

        if (!this.stopped) {
          // A small jitter prevents every application replica from waking at
          // exactly the same instant after a coordinated deployment.
          const jitter = Math.floor(Math.random() * Math.min(5_000, env.STORAGE_CLEANUP_INTERVAL_MS / 5));
          this.schedule(env.STORAGE_CLEANUP_INTERVAL_MS + jitter);
        }
      });
    }, delayMs);

    this.timer.unref();
  }

  private async runCycle(): Promise<void> {
    let startedAt = performance.now();
    try {
      startedAt = metrics.workerRun('storage-cleanup');
      const expiredReservations = await queueExpiredUploadReservations();
      let processedTasks = 0;

      for (let batch = 0; batch < env.STORAGE_CLEANUP_MAX_BATCHES_PER_RUN; batch += 1) {
        const processed = await processStorageDeletionBatch();
        processedTasks += processed;

        if (processed < env.STORAGE_CLEANUP_BATCH_SIZE) break;
      }

      metrics.workerSuccess('storage-cleanup', startedAt, expiredReservations + processedTasks);

      if (expiredReservations > 0 || processedTasks > 0) {
        logger.info('Storage cleanup cycle completed', {
          expiredReservations,
          processedTasks,
        });
      }
    } catch (error) {
      metrics.workerFailure('storage-cleanup', startedAt);
      logger.error('Storage cleanup cycle failed', { error });
    }
  }
}
