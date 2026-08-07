import { env } from '../config/env.js';
import { processProjectDeletionBatch } from '../services/project-deletion.js';
import { metrics } from '../services/metrics.js';
import { logger } from '../utils/logger.js';

export class ProjectDeletionWorker {
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = true;

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(500);
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
          const jitter = Math.floor(Math.random() * 1_000);
          this.schedule(env.PROJECT_DELETION_INTERVAL_MS + jitter);
        }
      });
    }, delayMs);
    this.timer.unref();
  }

  private async runCycle(): Promise<void> {
    let startedAt = performance.now();
    try {
      startedAt = metrics.workerRun('project-deletion');
      const processed = await processProjectDeletionBatch(env.PROJECT_DELETION_BATCH_SIZE);
      metrics.workerSuccess('project-deletion', startedAt, processed);
      if (processed > 0) logger.info('Project deletion cycle completed', { processed });
    } catch (error) {
      metrics.workerFailure('project-deletion', startedAt);
      logger.error('Project deletion worker failed', { error });
    }
  }
}
