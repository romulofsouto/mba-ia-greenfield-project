import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  JOBS,
  ProcessVideoJobData,
  QUEUES,
  processVideoJobId,
} from '../queue/queue.constants';

@Injectable()
export class VideoProcessingProducer {
  constructor(
    @InjectQueue(QUEUES.VIDEO_PROCESSING)
    private readonly queue: Queue<ProcessVideoJobData>,
  ) {}

  // Idempotent: the deterministic jobId makes a re-enqueue of the same video a
  // no-op while its job still exists.
  async enqueue(videoId: string): Promise<void> {
    await this.queue.add(
      JOBS.PROCESS_VIDEO,
      { videoId },
      { jobId: processVideoJobId(videoId) },
    );
  }
}
