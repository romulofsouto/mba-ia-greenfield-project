import { getSharedConfigToken } from '@nestjs/bullmq';
import type { TestingModuleBuilder } from '@nestjs/testing';

// 5 MiB is the S3 minimum part size: small parts keep real multipart uploads
// cheap in tests. Must be set before the testing module compiles.
export const TEST_PART_SIZE_BYTES = 5 * 1024 * 1024;

export function useTestPartSize(): void {
  process.env.VIDEO_PART_SIZE_BYTES = String(TEST_PART_SIZE_BYTES);
}

// Points every BullMQ queue of the module at a suite-specific key prefix on the
// shared Compose Redis.
export function overrideQueuePrefix(
  builder: TestingModuleBuilder,
  prefix: string,
): TestingModuleBuilder {
  return builder.overrideProvider(getSharedConfigToken()).useValue({
    connection: {
      host: process.env.REDIS_HOST ?? 'redis',
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    prefix,
  });
}
