import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JOBS, QUEUES } from '../queue/queue.constants';

export const CLEANUP_ABANDONED_UPLOADS_PATTERN = '0 * * * *';

// Registers the recurring maintenance jobs at worker boot. `upsertJobScheduler`
// is idempotent, so restarting the worker never duplicates a schedule.
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUES.VIDEO_MAINTENANCE)
    private readonly maintenanceQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.maintenanceQueue.upsertJobScheduler(
      JOBS.CLEANUP_ABANDONED_UPLOADS,
      { pattern: CLEANUP_ABANDONED_UPLOADS_PATTERN },
      { name: JOBS.CLEANUP_ABANDONED_UPLOADS },
    );
  }
}
