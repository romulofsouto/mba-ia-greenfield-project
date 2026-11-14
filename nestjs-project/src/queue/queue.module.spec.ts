import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import { QUEUES, VIDEO_PROCESSING_JOB_OPTIONS } from './queue.constants';
import { QueueModule } from './queue.module';

describe('QueueModule', () => {
  it('should compile and register producer and consumer queues with their job options', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
        QueueModule,
        QueueModule.registerProducerQueue(QUEUES.VIDEO_PROCESSING),
        QueueModule.registerConsumerQueue(QUEUES.VIDEO_MAINTENANCE),
      ],
    }).compile();

    const processing = module.get<Queue>(
      getQueueToken(QUEUES.VIDEO_PROCESSING),
    );
    const maintenance = module.get<Queue>(
      getQueueToken(QUEUES.VIDEO_MAINTENANCE),
    );

    expect(processing.name).toBe('video-processing');
    expect(processing.defaultJobOptions).toMatchObject(
      VIDEO_PROCESSING_JOB_OPTIONS,
    );
    expect(processing.opts.connection).toMatchObject({
      host: 'redis',
      enableOfflineQueue: false,
    });
    expect(maintenance.name).toBe('video-maintenance');

    await module.close();
  });
});
