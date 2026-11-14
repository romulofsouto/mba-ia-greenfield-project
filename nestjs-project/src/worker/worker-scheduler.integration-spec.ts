import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import queueConfig from '../config/queue.config';
import { QueueModule } from '../queue/queue.module';
import { JOBS, QUEUES } from '../queue/queue.constants';
import { createTestQueuePrefix, obliterateQueues } from '../test/redis';
import { overrideQueuePrefix } from '../test/video-app-config';
import {
  CLEANUP_ABANDONED_UPLOADS_PATTERN,
  MaintenanceScheduler,
} from './maintenance-scheduler';

describe('MaintenanceScheduler (integration — Redis)', () => {
  const prefix = createTestQueuePrefix();
  const modules: TestingModule[] = [];

  // Boots the scheduler the way the worker does (init runs
  // onApplicationBootstrap) against the suite's queue prefix.
  async function bootWorker(): Promise<TestingModule> {
    const module = await overrideQueuePrefix(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, load: [queueConfig] }),
          QueueModule,
          QueueModule.registerConsumerQueue(QUEUES.VIDEO_MAINTENANCE),
        ],
        providers: [MaintenanceScheduler],
      }),
      prefix,
    ).compile();
    await module.init();
    modules.push(module);
    return module;
  }

  afterAll(async () => {
    const queue = modules[0].get<Queue>(
      getQueueToken(QUEUES.VIDEO_MAINTENANCE),
    );
    await obliterateQueues([queue]);
    for (const module of modules) {
      await module.close();
    }
  });

  it('should keep a single hourly cleanup scheduler across two boots', async () => {
    await bootWorker();
    const second = await bootWorker();
    const queue = second.get<Queue>(getQueueToken(QUEUES.VIDEO_MAINTENANCE));

    const schedulers = await queue.getJobSchedulers();

    expect(schedulers).toHaveLength(1);
    expect(schedulers[0]).toMatchObject({
      key: JOBS.CLEANUP_ABANDONED_UPLOADS,
      name: JOBS.CLEANUP_ABANDONED_UPLOADS,
      pattern: CLEANUP_ABANDONED_UPLOADS_PATTERN,
    });
  });
});
