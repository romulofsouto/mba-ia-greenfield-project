import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { QUEUES } from '../queue/queue.constants';
import { videoObjectKey, videoPrefix } from '../storage/storage.keys';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { MinioTestBucket, uploadPartInternally } from '../test/minio';
import { createTestQueuePrefix, obliterateQueues } from '../test/redis';
import {
  TEST_PART_SIZE_BYTES,
  overrideQueuePrefix,
  useTestPartSize,
} from '../test/video-app-config';
import { User } from '../users/entities/user.entity';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import { generatePublicId } from './public-id.util';
import { VideosModule } from './videos.module';
import { VideosService } from './videos.service';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('VideosService upload (integration — PostgreSQL + MinIO + Redis)', () => {
  let module: TestingModule;
  let service: VideosService;
  let storage: StorageService;
  let bucket: MinioTestBucket;
  let queue: Queue;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let userId: string;

  beforeAll(async () => {
    useTestPartSize();
    module = await overrideQueuePrefix(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [videoConfig, storageConfig, queueConfig],
          }),
          TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
          VideosModule,
        ],
      }),
      createTestQueuePrefix(),
    ).compile();

    service = module.get(VideosService);
    storage = module.get(StorageService);
    bucket = new MinioTestBucket(storage);
    queue = module.get<Queue>(getQueueToken(QUEUES.VIDEO_PROCESSING));
    dataSource = module.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await bucket.cleanup();
    await obliterateQueues([queue]);
    await module.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const user = await dataSource
      .getRepository(User)
      .save({ email: `upload_${Date.now()}@example.com`, password: 'hashed' });
    await dataSource.getRepository(Channel).save({
      name: 'Chan',
      nickname: `upload_${Date.now()}`,
      user_id: user.id,
    });
    userId = user.id;
  });

  async function initiate(sizeBytes: number): Promise<Video> {
    const { video } = await service.initiateUpload(userId, {
      filename: 'aula.mp4',
      mime_type: 'video/mp4',
      size_bytes: sizeBytes,
    });
    const row = await videoRepository.findOneByOrFail({
      public_id: video.public_id,
    });
    bucket.track(videoPrefix(row.id));
    return row;
  }

  it('should take a video from init through parts to processing with a queued job', async () => {
    const part1 = Buffer.alloc(TEST_PART_SIZE_BYTES, 1);
    const part2 = Buffer.alloc(1024 * 1024, 2);
    const video = await initiate(part1.length + part2.length);

    const etag1 = await uploadPartInternally(
      storage,
      video.storage_key,
      video.upload_id!,
      1,
      part1,
    );
    const etag2 = await uploadPartInternally(
      storage,
      video.storage_key,
      video.upload_id!,
      2,
      part2,
    );

    const response = await service.completeUpload(video.public_id, userId, [
      { part_number: 1, etag: etag1 },
      { part_number: 2, etag: etag2 },
    ]);

    expect(response.processing_status).toBe('processing');
    expect(response.size_bytes).toBe(part1.length + part2.length);

    const row = await videoRepository.findOneByOrFail({ id: video.id });
    expect(row.processing_status).toBe(VideoProcessingStatus.PROCESSING);
    expect(row.upload_id).toBeNull();
    expect(row.uploaded_at).toBeInstanceOf(Date);

    const job = await queue.getJob(`process-${video.id}`);
    expect(job?.name).toBe('process-video');
    expect(job?.data).toEqual({ videoId: video.id });
  });

  it('should abort the multipart upload and leave the video failed/upload_aborted', async () => {
    const video = await initiate(1024);

    await service.abortUpload(video.public_id, userId);

    const row = await videoRepository.findOneByOrFail({ id: video.id });
    expect(row.processing_status).toBe(VideoProcessingStatus.FAILED);
    expect(row.failure_reason).toBe('upload_aborted');
    expect(row.upload_id).toBeNull();
    await expect(
      storage.listParts(video.storage_key, video.upload_id!),
    ).rejects.toMatchObject({ name: 'NoSuchUpload' });
  });
});

describe('VideosService delivery (integration — PostgreSQL + MinIO)', () => {
  let module: TestingModule;
  let service: VideosService;
  let storage: StorageService;
  let bucket: MinioTestBucket;
  let queue: Queue;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let userId: string;
  let channelId: string;
  let fixture: Buffer;

  beforeAll(async () => {
    module = await overrideQueuePrefix(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [videoConfig, storageConfig, queueConfig],
          }),
          TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
          VideosModule,
        ],
      }),
      createTestQueuePrefix(),
    )
      // Delivery URLs are signed for S3_PUBLIC_ENDPOINT, which points at the
      // host and is unreachable from the container. Signing with the internal
      // endpoint lets the test fetch the exact URL the service returns.
      .overrideProvider(storageConfig.KEY)
      .useFactory({
        factory: () => {
          const config = storageConfig();
          return { ...config, publicEndpoint: config.endpoint };
        },
      })
      .compile();

    service = module.get(VideosService);
    storage = module.get(StorageService);
    bucket = new MinioTestBucket(storage);
    queue = module.get<Queue>(getQueueToken(QUEUES.VIDEO_PROCESSING));
    dataSource = module.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
    fixture = await readFile(join(__dirname, '../../test/fixtures/sample.mp4'));
  });

  afterAll(async () => {
    await bucket.cleanup();
    await obliterateQueues([queue]);
    await module.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    const user = await dataSource
      .getRepository(User)
      .save({ email: `delivery_${Date.now()}@example.com`, password: 'x' });
    const channel = await dataSource.getRepository(Channel).save({
      name: 'Chan',
      nickname: `delivery_${Date.now()}`,
      user_id: user.id,
    });
    userId = user.id;
    channelId = channel.id;
  });

  // Seeds a `ready` video whose original object holds the sample fixture.
  async function seedReadyVideo(originalFilename: string): Promise<Video> {
    const id = randomUUID();
    const storageKey = videoObjectKey(id);
    bucket.track(videoPrefix(id));
    await storage.putObject(storageKey, fixture, 'video/mp4');
    return videoRepository.save({
      id,
      public_id: generatePublicId(),
      channel_id: channelId,
      title: 'aula',
      original_filename: originalFilename,
      mime_type: 'video/mp4',
      size_bytes: fixture.length,
      processing_status: VideoProcessingStatus.READY,
      storage_key: storageKey,
    });
  }

  it('should serve a Range request on the stream URL with 206 and only the requested bytes', async () => {
    const video = await seedReadyVideo('aula.mp4');

    const { url, expires_in } = await service.getStreamUrl(
      video.public_id,
      userId,
    );
    expect(expires_in).toBe(900);

    const response = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(
      `bytes 0-1023/${fixture.length}`,
    );
    expect(body).toHaveLength(1024);
    expect(body.equals(fixture.subarray(0, 1024))).toBe(true);
  });

  it('should return a download URL whose response is an attachment with the original filename', async () => {
    const video = await seedReadyVideo('aula final.mp4');

    const { url } = await service.getDownloadUrl(video.public_id, userId);

    const response = await fetch(url);
    await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="aula final.mp4"',
    );
  });
});
