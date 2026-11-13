import { Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUES } from '../queue/queue.constants';
import { UploadCleanupService } from './upload-cleanup.service';

@Processor(QUEUES.VIDEO_MAINTENANCE)
export class UploadCleanupProcessor extends WorkerHost {
  constructor(private readonly cleanupService: UploadCleanupService) {
    super();
  }

  // The only job on this queue is the hourly `cleanup-abandoned-uploads`.
  async process(): Promise<number> {
    return this.cleanupService.sweep();
  }
}
