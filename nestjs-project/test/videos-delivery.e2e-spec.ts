import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { Channel } from '../src/channels/entities/channel.entity';
import { QUEUES } from '../src/queue/queue.constants';
import { videoObjectKey, videoPrefix } from '../src/storage/storage.keys';
import { StorageService } from '../src/storage/storage.service';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { MinioTestBucket } from '../src/test/minio';
import { createTestQueuePrefix, obliterateQueues } from '../src/test/redis';
import {
  Video,
  VideoProcessingStatus,
} from '../src/videos/entities/video.entity';
import { generatePublicId } from '../src/videos/public-id.util';
import {
  clearThrottling,
  createVideoE2eApp,
  registerConfirmAndLogin,
} from './support/video-e2e';

describe('videos-delivery', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let storage: StorageService;
  let bucket: MinioTestBucket;
  let queue: Queue;
  let publicEndpoint: URL;
  let fixture: Buffer;
  let tokenA: string;
  let tokenB: string;
  let readyVideo: Video;
  let processingVideo: Video;

  beforeAll(async () => {
    app = await createVideoE2eApp(createTestQueuePrefix());
    dataSource = app.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
    storage = app.get(StorageService);
    bucket = new MinioTestBucket(storage);
    queue = app.get<Queue>(getQueueToken(QUEUES.VIDEO_PROCESSING));
    publicEndpoint = new URL(
      app.get(ConfigService).getOrThrow<string>('storage.publicEndpoint'),
    );
    fixture = await readFile(join(__dirname, 'fixtures/sample.mp4'));
  });

  afterAll(async () => {
    await bucket.cleanup();
    await obliterateQueues([queue]);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    clearThrottling(app);
    tokenA = await registerConfirmAndLogin(app, 'owner@example.com');
    tokenB = await registerConfirmAndLogin(app, 'other@example.com');

    // The worker does not run in E2E: videos are seeded directly in the
    // database and in MinIO.
    const channelA = await dataSource.getRepository(Channel).findOneOrFail({
      where: { user: { email: 'owner@example.com' } },
    });
    readyVideo = await seedVideo(channelA.id, VideoProcessingStatus.READY);
    processingVideo = await seedVideo(
      channelA.id,
      VideoProcessingStatus.PROCESSING,
    );
  });

  async function seedVideo(
    channelId: string,
    status: VideoProcessingStatus,
  ): Promise<Video> {
    const id = randomUUID();
    const storageKey = videoObjectKey(id);
    bucket.track(videoPrefix(id));
    await storage.putObject(storageKey, fixture, 'video/mp4');
    return videoRepository.save({
      id,
      public_id: generatePublicId(),
      channel_id: channelId,
      title: 'aula final',
      original_filename: 'aula final.mp4',
      mime_type: 'video/mp4',
      size_bytes: fixture.length,
      processing_status: status,
      storage_key: storageKey,
      thumbnail_key: null,
    });
  }

  function get(path: string, token?: string) {
    const req = request(app.getHttpServer()).get(path);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  // 1. Consulta e entrega ao dono

  it('consulta-retorna-video-do-dono', async () => {
    const res = await get(`/videos/${readyVideo.public_id}`, tokenA).expect(
      200,
    );

    expect(res.body).toMatchObject({
      public_id: readyVideo.public_id,
      title: 'aula final',
      original_filename: 'aula final.mp4',
      mime_type: 'video/mp4',
      size_bytes: fixture.length,
      processing_status: 'ready',
      editorial_status: 'draft',
      duration_seconds: null,
      width: null,
      height: null,
      video_codec: null,
      audio_codec: null,
      format_name: null,
      failure_reason: null,
      thumbnail_url: null,
    });
    expect(typeof res.body.created_at).toBe('string');
    expect(typeof res.body.updated_at).toBe('string');
    for (const hidden of ['id', 'channel_id', 'upload_id', 'storage_key']) {
      expect(res.body).not.toHaveProperty(hidden);
    }
  });

  it('stream-retorna-url-assinada-publica', async () => {
    const res = await get(
      `/videos/${readyVideo.public_id}/stream`,
      tokenA,
    ).expect(200);

    expect(res.headers.location).toBeUndefined();
    expect(res.body.expires_in).toBe(900);

    const url = new URL(res.body.url);
    expect(url.host).toBe(publicEndpoint.host);
    expect(url.pathname).toContain(`videos/${readyVideo.id}/original`);
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.has('response-content-disposition')).toBe(false);
  });

  it('download-retorna-url-com-attachment', async () => {
    const res = await get(
      `/videos/${readyVideo.public_id}/download`,
      tokenA,
    ).expect(200);

    expect(res.body.expires_in).toBe(900);
    const url = new URL(res.body.url);
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="aula final.mp4"',
    );
  });

  // 2. Vídeo ainda não pronto

  it('stream-e-download-exigem-ready', async () => {
    const stream = await get(
      `/videos/${processingVideo.public_id}/stream`,
      tokenA,
    ).expect(409);
    expect(stream.body.error).toBe('VIDEO_NOT_READY');

    const download = await get(
      `/videos/${processingVideo.public_id}/download`,
      tokenA,
    ).expect(409);
    expect(download.body.error).toBe('VIDEO_NOT_READY');

    const status = await get(
      `/videos/${processingVideo.public_id}`,
      tokenA,
    ).expect(200);
    expect(status.body.processing_status).toBe('processing');
  });

  // 3. Controle de acesso

  it('somente-o-dono-consulta-e-recebe-urls', async () => {
    const paths = [
      `/videos/${readyVideo.public_id}`,
      `/videos/${readyVideo.public_id}/stream`,
      `/videos/${readyVideo.public_id}/download`,
    ];

    for (const path of paths) {
      const res = await get(path, tokenB).expect(404);
      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
      expect(res.body).not.toHaveProperty('url');
    }

    for (const path of paths) {
      await get(path).expect(401);
    }

    const unknown = await get('/videos/AAAAAAAAAAA', tokenA).expect(404);
    expect(unknown.body.error).toBe('VIDEO_NOT_FOUND');
  });
});
