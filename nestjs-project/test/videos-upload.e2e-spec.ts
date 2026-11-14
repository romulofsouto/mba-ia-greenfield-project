import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { QUEUES } from '../src/queue/queue.constants';
import { videoPrefix } from '../src/storage/storage.keys';
import { StorageService } from '../src/storage/storage.service';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { MinioTestBucket, uploadPartInternally } from '../src/test/minio';
import { createTestQueuePrefix, obliterateQueues } from '../src/test/redis';
import {
  TEST_PART_SIZE_BYTES,
  useTestPartSize,
} from '../src/test/video-app-config';
import { Video } from '../src/videos/entities/video.entity';
import { VideoProcessingProducer } from '../src/videos/video-processing.producer';
import {
  clearThrottling,
  createVideoE2eApp,
  registerConfirmAndLogin,
} from './support/video-e2e';

const MIB = 1024 * 1024;
const SMALL_VIDEO_SIZE = 6 * MIB; // 2 parts: 5 MiB + 1 MiB

describe('videos-upload', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let storage: StorageService;
  let bucket: MinioTestBucket;
  let queue: Queue;
  let tokenA: string;

  beforeAll(async () => {
    useTestPartSize();
    app = await createVideoE2eApp(createTestQueuePrefix());
    dataSource = app.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
    storage = app.get(StorageService);
    bucket = new MinioTestBucket(storage);
    queue = app.get<Queue>(getQueueToken(QUEUES.VIDEO_PROCESSING));
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
  });

  async function startUpload(
    token: string,
    sizeBytes = SMALL_VIDEO_SIZE,
  ): Promise<Video> {
    const res = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        filename: 'aula.mp4',
        mime_type: 'video/mp4',
        size_bytes: sizeBytes,
      })
      .expect(201);
    const row = await videoRepository.findOneByOrFail({
      public_id: res.body.video.public_id,
    });
    bucket.track(videoPrefix(row.id));
    return row;
  }

  async function uploadPart(video: Video, partNumber: number): Promise<string> {
    const size = partNumber === 1 ? TEST_PART_SIZE_BYTES : MIB;
    return uploadPartInternally(
      storage,
      video.storage_key,
      video.upload_id!,
      partNumber,
      Buffer.alloc(size, partNumber),
    );
  }

  // 1. Pré-cadastro e início do upload (POST /videos)

  it('cria-rascunho-e-inicia-multipart', async () => {
    const res = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        filename: 'aula.mp4',
        mime_type: 'video/mp4',
        size_bytes: 104857600,
      })
      .expect(201);

    expect(res.body.video.public_id).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(res.body.video.processing_status).toBe('uploading');
    expect(res.body.video.editorial_status).toBe('draft');
    expect(res.body.video.title).toBe('aula');
    expect(res.body.upload).toEqual({ part_size: 5242880, part_count: 20 });

    const row = await videoRepository.findOneOrFail({
      where: { public_id: res.body.video.public_id },
      relations: ['channel', 'channel.user'],
    });
    bucket.track(videoPrefix(row.id));
    expect(row.upload_id).not.toBeNull();
    expect(row.channel.user.email).toBe('owner@example.com');
  });

  it('rejeita-tamanho-e-tipo-fora-da-politica', async () => {
    const tooLarge = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        filename: 'grande.mp4',
        mime_type: 'video/mp4',
        size_bytes: 10737418241,
      })
      .expect(413);
    expect(tooLarge.body.error).toBe('VIDEO_TOO_LARGE');

    const wrongType = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        filename: 'doc.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
      })
      .expect(415);
    expect(wrongType.body.error).toBe('UNSUPPORTED_VIDEO_TYPE');

    await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ mime_type: 'video/mp4', size_bytes: 1024 })
      .expect(400);

    expect(await videoRepository.count()).toBe(0);
  });

  // 2. Envio de partes e retomada

  it('emite-urls-de-parte-e-valida-numero', async () => {
    const video = await startUpload(tokenA);
    const publicHost = new URL(process.env.S3_PUBLIC_ENDPOINT!).host;

    const res = await request(app.getHttpServer())
      .post(`/videos/${video.public_id}/upload/part-urls`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ part_numbers: [1, 2] })
      .expect(200);

    expect(
      res.body.parts.map((p: { part_number: number }) => p.part_number),
    ).toEqual([1, 2]);
    for (const part of res.body.parts as { url: string }[]) {
      expect(new URL(part.url).host).toBe(publicHost);
      expect(part.url).toContain('partNumber=');
      expect(part.url).toContain('uploadId=');
    }
    expect(res.body.expires_in).toBe(3600);

    const invalid = await request(app.getHttpServer())
      .post(`/videos/${video.public_id}/upload/part-urls`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ part_numbers: [3] })
      .expect(400);
    expect(invalid.body.error).toBe('INVALID_PART_NUMBER');
  });

  it('lista-partes-ja-enviadas', async () => {
    const video = await startUpload(tokenA);
    await uploadPart(video, 1);

    const res = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}/upload/parts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.parts).toHaveLength(1);
    expect(res.body.parts[0].part_number).toBe(1);
    expect(res.body.parts[0].etag).toBeTruthy();
    expect(res.body.parts[0].size_bytes).toBe(5242880);
  });

  // 3. Conclusão do upload (POST /videos/:publicId/upload/complete)

  it('conclui-e-enfileira-processamento', async () => {
    const video = await startUpload(tokenA);
    const etag1 = await uploadPart(video, 1);
    const etag2 = await uploadPart(video, 2);

    const res = await request(app.getHttpServer())
      .post(`/videos/${video.public_id}/upload/complete`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        parts: [
          { part_number: 1, etag: etag1 },
          { part_number: 2, etag: etag2 },
        ],
      })
      .expect(200);

    expect(res.body.processing_status).toBe('processing');
    expect(res.body.size_bytes).toBe(6291456);

    const job = await queue.getJob(`process-${video.id}`);
    expect(job?.name).toBe('process-video');
    expect(job?.data).toEqual({ videoId: video.id });

    const row = await videoRepository.findOneByOrFail({ id: video.id });
    expect(row.upload_id).toBeNull();
    expect(row.uploaded_at).not.toBeNull();
  });

  it('etag-invalido-mantem-upload-aberto', async () => {
    const video = await startUpload(tokenA);
    const etag1 = await uploadPart(video, 1);
    await uploadPart(video, 2);

    const res = await request(app.getHttpServer())
      .post(`/videos/${video.public_id}/upload/complete`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        parts: [
          { part_number: 1, etag: etag1 },
          { part_number: 2, etag: '"deadbeef"' },
        ],
      })
      .expect(400);
    expect(res.body.error).toBe('UPLOAD_INCOMPLETE');

    const status = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(status.body.processing_status).toBe('uploading');
  });

  it('falha-de-enfileiramento-marca-falha', async () => {
    const failingApp = await createVideoE2eApp(createTestQueuePrefix(), (b) =>
      b.overrideProvider(VideoProcessingProducer).useValue({
        enqueue: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      }),
    );
    try {
      clearThrottling(failingApp);
      const token = await registerConfirmAndLogin(
        failingApp,
        'enqueue@example.com',
      );
      const init = await request(failingApp.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          filename: 'aula.mp4',
          mime_type: 'video/mp4',
          size_bytes: SMALL_VIDEO_SIZE,
        })
        .expect(201);
      const video = await videoRepository.findOneByOrFail({
        public_id: init.body.video.public_id,
      });
      bucket.track(videoPrefix(video.id));
      const etag1 = await uploadPart(video, 1);
      const etag2 = await uploadPart(video, 2);

      const res = await request(failingApp.getHttpServer())
        .post(`/videos/${video.public_id}/upload/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          parts: [
            { part_number: 1, etag: etag1 },
            { part_number: 2, etag: etag2 },
          ],
        })
        .expect(503);
      expect(res.body.error).toBe('PROCESSING_ENQUEUE_FAILED');

      const row = await videoRepository.findOneByOrFail({ id: video.id });
      expect(row.processing_status).toBe('failed');
      expect(row.failure_reason).toBe('enqueue_failed');
    } finally {
      await failingApp.close();
    }
  });

  // 4. Cancelamento e controle de acesso

  it('aborta-upload-e-rejeita-repeticao', async () => {
    const video = await startUpload(tokenA);

    const res = await request(app.getHttpServer())
      .delete(`/videos/${video.public_id}/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
    expect(res.text).toBe('');

    const row = await videoRepository.findOneByOrFail({ id: video.id });
    expect(row.processing_status).toBe('failed');
    expect(row.failure_reason).toBe('upload_aborted');
    expect(row.upload_id).toBeNull();

    const again = await request(app.getHttpServer())
      .delete(`/videos/${video.public_id}/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(409);
    expect(again.body.error).toBe('UPLOAD_NOT_IN_PROGRESS');
  });

  it('somente-o-dono-acessa-o-upload', async () => {
    const video = await startUpload(tokenA);
    const tokenB = await registerConfirmAndLogin(app, 'other@example.com');
    const base = `/videos/${video.public_id}/upload`;
    const server = app.getHttpServer();

    // Request factories: a supertest request binds an ephemeral server when
    // created, so each one must be built right before it is awaited.
    const asB = [
      () =>
        request(server)
          .post(`${base}/part-urls`)
          .send({ part_numbers: [1] }),
      () => request(server).get(`${base}/parts`),
      () =>
        request(server)
          .post(`${base}/complete`)
          .send({ parts: [{ part_number: 1, etag: '"x"' }] }),
      () => request(server).delete(base),
    ];
    for (const build of asB) {
      const res = await build().set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    }

    const anonymous = [
      () =>
        request(server)
          .post('/videos')
          .send({ filename: 'a.mp4', mime_type: 'video/mp4', size_bytes: 1 }),
      ...asB,
    ];
    for (const build of anonymous) {
      expect((await build()).status).toBe(401);
    }

    const malformed = await request(server)
      .get('/videos/x/upload/parts')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    expect(malformed.body.error).toBe('VIDEO_NOT_FOUND');

    const row = await videoRepository.findOneByOrFail({ id: video.id });
    expect(row.processing_status).toBe('uploading');
  });
});
