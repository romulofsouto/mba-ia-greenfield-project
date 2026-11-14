import { Test } from '@nestjs/testing';
import { VideoProcessingProcessor } from '../videos/video-processing.processor';
import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  it('should compile with config, database, storage, media, queue and processor wiring', async () => {
    const module = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    expect(module.get(VideoProcessingProcessor)).toBeInstanceOf(
      VideoProcessingProcessor,
    );
    await module.close();
  }, 30000);
});
