import { ConfigModule } from '@nestjs/config';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import { QUEUES } from '../queue/queue.constants';
import { QueueModule } from '../queue/queue.module';
import { createTestQueuePrefix, obliterateQueues } from '../test/redis';
import { VideoProcessingProducer } from './video-processing.producer';

async function createProducerModule(prefix: string): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
      BullModule.forRoot({
        connection: {
          host: process.env.REDIS_HOST ?? 'redis',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
        prefix,
      }),
      QueueModule.registerProducerQueue(QUEUES.VIDEO_PROCESSING),
    ],
    providers: [VideoProcessingProducer],
  }).compile();
}

describe('VideoProcessingProducer (integration — real Redis)', () => {
  let module: TestingModule;
  let producer: VideoProcessingProducer;
  let queue: Queue;

  beforeAll(async () => {
    module = await createProducerModule(createTestQueuePrefix());
    producer = module.get(VideoProcessingProducer);
    queue = module.get<Queue>(getQueueToken(QUEUES.VIDEO_PROCESSING));
  });

  afterAll(async () => {
    await obliterateQueues([queue]);
    await module.close();
  });

  it('should enqueue process-video with a deterministic jobId and the video id payload', async () => {
    const videoId = randomUUID();

    await producer.enqueue(videoId);

    const job = await queue.getJob(`process-${videoId}`);
    expect(job).toBeDefined();
    expect(job!.name).toBe('process-video');
    expect(job!.data).toEqual({ videoId });
  });

  it('should not create a second job when the same video is enqueued twice', async () => {
    const videoId = randomUUID();

    await producer.enqueue(videoId);
    await producer.enqueue(videoId);

    const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized']);
    expect(jobs.filter((job) => job.data.videoId === videoId)).toHaveLength(1);
  });

  it('should apply 3 attempts with a 10000 ms exponential backoff', async () => {
    const videoId = randomUUID();

    await producer.enqueue(videoId);

    const job = await queue.getJob(`process-${videoId}`);
    expect(job!.opts.attempts).toBe(3);
    expect(job!.opts.backoff).toEqual({ type: 'exponential', delay: 10000 });
  });

  // BullMQ only fails fast once the queue has connected (it waits for the first
  // connection), which is the production case: the API boots after Redis is
  // healthy and Redis goes away later. Dropping the live connection reproduces
  // that without stopping the shared Compose service.
  it('should reject instead of hanging when the Redis connection is lost', async () => {
    const isolated = await createProducerModule(createTestQueuePrefix());
    const isolatedQueue = isolated.get<Queue>(
      getQueueToken(QUEUES.VIDEO_PROCESSING),
    );
    try {
      await isolatedQueue.waitUntilReady();
      await isolatedQueue.disconnect();
      const started = Date.now();

      await expect(
        isolated.get(VideoProcessingProducer).enqueue(randomUUID()),
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(1000);
    } finally {
      await isolated.close();
    }
  });
});
