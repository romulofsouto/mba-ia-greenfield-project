import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { videoObjectKey, videoPrefix } from '../storage/storage.keys';
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
import { UploadCleanupService } from './upload-cleanup.service';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];
const HOUR_MS = 60 * 60 * 1000;

describe('UploadCleanupService (integration — PostgreSQL + MinIO)', () => {
  let module: TestingModule;
  let service: UploadCleanupService;
  let storage: StorageService;
  let bucket: MinioTestBucket;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let channelId: string;
  const now = new Date();

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig, videoConfig],
        }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        TypeOrmModule.forFeature([Video]),
        StorageModule,
      ],
      providers: [UploadCleanupService],
    }).compile();

    service = module.get(UploadCleanupService);
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
      .save({ email: `cleanup_${Date.now()}@example.com`, password: 'x' });
    const channel = await dataSource.getRepository(Channel).save({
      name: 'Chan',
      nickname: `cleanup_${Date.now()}`,
      user_id: user.id,
    });
    channelId = channel.id;
  });

  // Seeds a video `ageHours` old; `uploading` videos get a real multipart
  // upload in MinIO unless `uploadId` is given.
  async function seedVideo(
    status: VideoProcessingStatus,
    ageHours: number,
    uploadId?: string,
  ): Promise<Video> {
    const id = randomUUID();
    const storageKey = videoObjectKey(id);
    bucket.track(videoPrefix(id));
    const resolvedUploadId =
      status === VideoProcessingStatus.UPLOADING
        ? (uploadId ??
          (await storage.createMultipartUpload(storageKey, 'video/mp4')))
        : null;
    const video = await videoRepository.save({
      id,
      public_id: generatePublicId(),
      channel_id: channelId,
      title: 'aula',
      original_filename: 'aula.mp4',
      mime_type: 'video/mp4',
      size_bytes: 1024,
      processing_status: status,
      upload_id: resolvedUploadId,
      storage_key: storageKey,
    });
    await videoRepository.update(video.id, {
      created_at: new Date(now.getTime() - ageHours * HOUR_MS),
    });
    return videoRepository.findOneByOrFail({ id: video.id });
  }

  it('should abort an upload older than the window and mark the video upload_abandoned', async () => {
    const video = await seedVideo(VideoProcessingStatus.UPLOADING, 25);

    const marked = await service.sweep(now);

    expect(marked).toBe(1);
    const row = await videoRepository.findOneByOrFail({ id: video.id });
    expect(row.processing_status).toBe(VideoProcessingStatus.FAILED);
    expect(row.failure_reason).toBe('upload_abandoned');
    expect(row.upload_id).toBeNull();
    expect(row.processed_at).toBeInstanceOf(Date);
    await expect(
      storage.listParts(video.storage_key, video.upload_id!),
    ).rejects.toMatchObject({ name: 'NoSuchUpload' });
  });

  it('should leave recent uploads and videos in other states untouched', async () => {
    const recent = await seedVideo(VideoProcessingStatus.UPLOADING, 23);
    const others = await Promise.all(
      [
        VideoProcessingStatus.PROCESSING,
        VideoProcessingStatus.READY,
        VideoProcessingStatus.FAILED,
      ].map((status) => seedVideo(status, 48)),
    );

    const marked = await service.sweep(now);

    expect(marked).toBe(0);
    for (const video of [recent, ...others]) {
      const row = await videoRepository.findOneByOrFail({ id: video.id });
      expect(row.processing_status).toBe(video.processing_status);
      expect(row.upload_id).toBe(video.upload_id);
      expect(row.updated_at).toEqual(video.updated_at);
    }
    await expect(
      storage.listParts(recent.storage_key, recent.upload_id!),
    ).resolves.toEqual([]);
  });

  it('should still mark a video whose multipart upload no longer exists, without stopping the sweep', async () => {
    const expired = await seedVideo(
      VideoProcessingStatus.UPLOADING,
      30,
      'expired-upload-id',
    );
    const live = await seedVideo(VideoProcessingStatus.UPLOADING, 30);

    const marked = await service.sweep(now);

    expect(marked).toBe(2);
    for (const video of [expired, live]) {
      const row = await videoRepository.findOneByOrFail({ id: video.id });
      expect(row.processing_status).toBe(VideoProcessingStatus.FAILED);
      expect(row.failure_reason).toBe('upload_abandoned');
    }
  });
});
