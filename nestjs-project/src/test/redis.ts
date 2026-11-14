import { randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';

// Every suite uses its own BullMQ key prefix on the shared Compose Redis, so
// suites never see each other's jobs.
export function createTestQueuePrefix(): string {
  return `test-${randomUUID()}`;
}

export async function obliterateQueues(queues: Queue[]): Promise<void> {
  for (const queue of queues) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
}
