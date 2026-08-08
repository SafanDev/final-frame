import { env } from '../config/env.js';
import { processEmailOutboxBatch } from '../services/email-outbox.js';
import { metrics } from '../services/metrics.js';
import { logger } from '../utils/logger.js';

export class EmailOutboxWorker {
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = true;

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(750);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.inFlight) await this.inFlight;
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.inFlight = this.run().finally(() => {
        this.inFlight = undefined;
        if (!this.stopped) this.schedule(env.EMAIL_OUTBOX_INTERVAL_MS + Math.floor(Math.random() * 1_000));
      });
    }, delay);
    this.timer.unref();
  }

  private async run(): Promise<void> {
    let startedAt = performance.now();
    try {
      startedAt = metrics.workerRun('email-outbox');
      const processed = await processEmailOutboxBatch(env.EMAIL_OUTBOX_BATCH_SIZE);
      metrics.workerSuccess('email-outbox', startedAt, processed);
      if (processed) logger.info('Email outbox cycle completed', { processed });
    } catch (error) {
      metrics.workerFailure('email-outbox', startedAt);
      logger.error('Email outbox cycle failed', { error });
    }
  }
}
