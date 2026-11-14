import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // SIGTERM (e.g. `docker compose stop`) closes the BullMQ workers, letting
  // the active job finish instead of leaving it stalled.
  app.enableShutdownHooks();
}
void bootstrap();
