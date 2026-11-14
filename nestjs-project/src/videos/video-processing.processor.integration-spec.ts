import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import { MediaModule } from '../media/media.module';
import {
  thumbnailObjectKey,
  thumbnailPrefix,
  videoObjectKey,
  videoPrefix,
} from '../storage/storage.keys';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { MinioTestBucket } from '../test/minio';
import { User } from '../users/entities/user.entity';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import { generatePublicId } from './public-id.util';
import { VideoProcessingProcessor } from './video-processing.processor';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];
const FIXTURES = join(__dirname, '..', '..', 'test', 'fixtures');

describe('VideoProcessingProcessor (integration — PostgreSQL + MinIO + ffmpeg)', () => {
  let module: TestingModule;
  let processor: VideoProcessingProcessor;
  let storage: StorageService;
  let bucket: MinioTestBucket;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let channelId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [storageConfig] }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        TypeOrmModule.forFeature([Video]),
        StorageModule,
        MediaModule,
      ],
      providers: [VideoProcessingProcessor],
    }).compile();

    processor = module.get(VideoProcessingProcessor);
    storage = module.get(StorageService);
    bucket = new MinioTestBucket(storage);
    dataSource = module.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await bucket.cleanup();
    await module.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const user = await dataSource
      .getRepository(User)
      .save({ email: `worker_${Date.now()}@example.com`, password: 'x' });
    const channel = await dataSource.getRepository(Channel).save({
      name: 'Chan',
      nickname: `worker_${Date.now()}`,
      user_id: user.id,
    });
    channelId = channel.id;
  });

  // Uploads a fixture as the video's original object and seeds the row.
  async function seedVideo(
    fixture: string,
    status = VideoProcessingStatus.PROCESSING,
  ): Promise<Video> {
    const id = randomUUID();
    const body = await readFile(join(FIXTURES, fixture));
    bucket.track(videoPrefix(id));
    bucket.track(thumbnailPrefix(id));
    await storage.putObject(videoObjectKey(id), body, 'video/mp4');
    return videoRepository.save({
      id,
      public_id: generatePublicId(),
      channel_id: channelId,
      title: 'aula',
      original_filename: fixture,
      mime_type: 'video/mp4',
      size_bytes: body.length,
      processing_status: status,
      storage_key: videoObjectKey(id),
    });
  }

  function jobFor(video: Video): Job {
    return {
      id: `process-${video.id}`,
      data: { videoId: video.id },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;
  }

  it('should extract metadata, store the thumbnail and mark a valid video ready', async () => {
    const video = await seedVideo('sample.mp4');

    await processor.process(jobFor(video));

    const row = await videoRepository.findOneByOrFail({ id: video.id });
    expect(row.processing_status).toBe(VideoProcessingStatus.READY);
    expect(row.duration_seconds).toBeCloseTo(2, 0);
    expect(row.width).toBe(160);
    expect(row.height).toBe(120);
    expect(row.video_codec).toBe('h264');
    expect(row.audio_codec).toBe('aac');
    expect(row.thumbnail_key).toBe(thumbnailObjectKey(video.id));
    expect(row.processed_at).toBeInstanceOf(Date);

    const thumb = await storage.headObject(thumbnailObjectKey(video.id));
    expect(thumb.contentType).toBe('image/jpeg');
    expect(thumb.contentLength).toBeGreaterThan(0);
  });

  it('should mark a non-video file failed with not_a_video without retrying', async () => {
    const video = await seedVideo('not-a-video.mp4');

    await expect(processor.process(jobFor(video))).rejects.toMatchObject({
      name: 'UnrecoverableError',
    });

    const row = await videoRepository.findOneByOrFail({ id: video.id });
    expect(row.processing_status).toBe(VideoProcessingStatus.FAILED);
    expect(row.failure_reason).toBe('not_a_video');
    expect(row.processed_at).toBeInstanceOf(Date);
  });

  it('should ignore a video that is not processing', async () => {
    const video = await seedVideo('sample.mp4', VideoProcessingStatus.READY);

    await processor.process(jobFor(video));

    const row = await videoRepository.findOneByOrFail({ id: video.id });
    expect(row.processing_status).toBe(VideoProcessingStatus.READY);
    expect(row.thumbnail_key).toBeNull();
    expect(row.updated_at).toEqual(video.updated_at);
    await expect(
      storage.headObject(thumbnailObjectKey(video.id)),
    ).rejects.toBeDefined();
  });
});
