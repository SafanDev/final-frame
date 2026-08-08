import { env } from '../config/env.js';
import { runRetentionCleanupBatch } from '../services/retention-cleanup.js';
import { metrics } from '../services/metrics.js';
import { logger } from '../utils/logger.js';

export class RetentionCleanupWorker {
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = true;

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(15_000);
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
        if (!this.stopped) {
          const jitter = Math.floor(Math.random() * Math.min(30_000, env.RETENTION_CLEANUP_INTERVAL_MS / 10));
          this.schedule(env.RETENTION_CLEANUP_INTERVAL_MS + jitter);
        }
      });
    }, delayMs);
    this.timer.unref();
  }

  private async runCycle(): Promise<void> {
    let startedAt = performance.now();
    try {
      startedAt = metrics.workerRun('retention-cleanup');
      const result = await runRetentionCleanupBatch();
      const removed = Object.values(result).reduce((total, value) => total + value, 0);
      metrics.workerSuccess('retention-cleanup', startedAt, removed);
      if (removed > 0) logger.info('Retention cleanup cycle completed', { ...result });
    } catch (error) {
      metrics.workerFailure('retention-cleanup', startedAt);
      logger.error('Retention cleanup cycle failed', { error });
    }
  }
}
