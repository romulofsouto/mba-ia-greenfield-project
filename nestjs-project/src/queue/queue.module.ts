import { DynamicModule, Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import type { DefaultJobOptions } from 'bullmq';
import queueConfig from '../config/queue.config';
import { QUEUES, VIDEO_PROCESSING_JOB_OPTIONS } from './queue.constants';

type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const DEFAULT_JOB_OPTIONS: Record<QueueName, DefaultJobOptions | undefined> = {
  [QUEUES.VIDEO_PROCESSING]: VIDEO_PROCESSING_JOB_OPTIONS,
  [QUEUES.VIDEO_MAINTENANCE]: undefined,
};

// Root Redis connection shared by every queue and worker of the application.
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [queueConfig.KEY],
      useFactory: (cfg: ConfigType<typeof queueConfig>) => ({
        connection: { host: cfg.host, port: cfg.port },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {
  // Producer-side queue (API): the connection disables the ioredis offline
  // queue so `add` rejects at once when Redis is down instead of waiting for a
  // reconnection while an HTTP request is open.
  static registerProducerQueue(name: QueueName): DynamicModule {
    return BullModule.registerQueueAsync({
      name,
      inject: [queueConfig.KEY],
      useFactory: (cfg: ConfigType<typeof queueConfig>) => ({
        connection: {
          host: cfg.host,
          port: cfg.port,
          enableOfflineQueue: false,
        },
        defaultJobOptions: DEFAULT_JOB_OPTIONS[name],
      }),
    });
  }

  // Consumer-side queue (worker): keeps the root connection, which waits for
  // reconnections — the right behaviour for background processing.
  static registerConsumerQueue(name: QueueName): DynamicModule {
    return BullModule.registerQueue({
      name,
      defaultJobOptions: DEFAULT_JOB_OPTIONS[name],
    });
  }
}
