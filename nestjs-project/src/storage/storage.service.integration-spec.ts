import { TestingModule } from '@nestjs/testing';
import {
  MinioTestBucket,
  createStorageTestingModule,
  uploadPartInternally,
} from '../test/minio';
import { StorageService } from './storage.service';

const MIB = 1024 * 1024;

describe('StorageService (integration — real MinIO)', () => {
  let module: TestingModule;
  let storage: StorageService;
  let bucket: MinioTestBucket;

  beforeAll(async () => {
    module = await createStorageTestingModule();
    storage = module.get(StorageService);
    bucket = new MinioTestBucket(storage);
  });

  afterAll(async () => {
    await bucket.cleanup();
    await module.close();
  });

  describe('multipart upload', () => {
    it('should complete a 2-part upload whose object size is the sum of the parts', async () => {
      const key = bucket.key('multipart/original');
      const part1 = Buffer.alloc(5 * MIB, 1);
      const part2 = Buffer.alloc(MIB, 2);

      const uploadId = await storage.createMultipartUpload(key, 'video/mp4');
      const etag1 = await uploadPartInternally(
        storage,
        key,
        uploadId,
        1,
        part1,
      );
      const etag2 = await uploadPartInternally(
        storage,
        key,
        uploadId,
        2,
        part2,
      );

      const listed = await storage.listParts(key, uploadId);
      expect(listed).toEqual([
        { partNumber: 1, etag: etag1, sizeBytes: part1.length },
        { partNumber: 2, etag: etag2, sizeBytes: part2.length },
      ]);

      await storage.completeMultipartUpload(key, uploadId, [
        { partNumber: 1, etag: etag1 },
        { partNumber: 2, etag: etag2 },
      ]);

      const head = await storage.headObject(key);
      expect(head.contentLength).toBe(part1.length + part2.length);
      expect(head.contentType).toBe('video/mp4');
    });

    it('should make listParts fail with NoSuchUpload after an abort', async () => {
      const key = bucket.key('aborted/original');
      const uploadId = await storage.createMultipartUpload(key, 'video/mp4');
      await uploadPartInternally(storage, key, uploadId, 1, Buffer.alloc(MIB));

      await storage.abortMultipartUpload(key, uploadId);

      await expect(storage.listParts(key, uploadId)).rejects.toMatchObject({
        name: 'NoSuchUpload',
      });
    });
  });

  describe('presigned URLs', () => {
    const content = Buffer.from(
      Array.from({ length: 4096 }, (_, i) => i % 256),
    );
    let key: string;

    beforeAll(async () => {
      key = bucket.key('delivery/original');
      await storage.putObject(key, content, 'video/mp4');
    });

    it('should sign browser URLs with the public endpoint host, never minio:9000', async () => {
      const publicHost = new URL(process.env.S3_PUBLIC_ENDPOINT!).host;

      const partUrl = await storage.presignUploadPart(key, 'upload-id', 1, 60);
      const getUrl = await storage.presignGetObject(key, { expiresIn: 60 });

      for (const url of [partUrl, getUrl]) {
        expect(new URL(url).host).toBe(publicHost);
        expect(url).not.toContain('minio:9000');
      }
      expect(partUrl).toContain('partNumber=1');
      expect(partUrl).toContain('uploadId=upload-id');
    });

    it('should answer a Range request on a streaming URL with 206 and exactly the requested bytes', async () => {
      const url = await storage.presignGetObject(key, {
        expiresIn: 60,
        endpoint: 'internal',
      });

      const response = await fetch(url, { headers: { Range: 'bytes=0-99' } });

      expect(response.status).toBe(206);
      expect(response.headers.get('content-range')).toBe('bytes 0-99/4096');
      const body = Buffer.from(await response.arrayBuffer());
      expect(body).toEqual(content.subarray(0, 100));
    });

    it('should serve a download URL with Content-Disposition attachment and the original name', async () => {
      const url = await storage.presignGetObject(key, {
        expiresIn: 60,
        downloadFilename: 'aula final.mp4',
        endpoint: 'internal',
      });

      const response = await fetch(url);
      await response.arrayBuffer();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="aula final.mp4"',
      );
    });

    it('should not add a Content-Disposition override to streaming URLs', async () => {
      const url = await storage.presignGetObject(key, { expiresIn: 60 });
      expect(url).not.toContain('response-content-disposition');
    });
  });

  describe('deletePrefix', () => {
    it('should remove every object under the prefix and none outside it', async () => {
      const inside = [bucket.key('del/a/original'), bucket.key('del/a/x/y')];
      const outside = bucket.key('del/ab/original');
      for (const key of [...inside, outside]) {
        await storage.putObject(key, Buffer.from('x'), 'text/plain');
      }

      const removed = await storage.deletePrefix(bucket.key('del/a/'));

      expect(removed).toBe(2);
      for (const key of inside) {
        await expect(storage.headObject(key)).rejects.toMatchObject({
          name: 'NotFound',
        });
      }
      await expect(storage.headObject(outside)).resolves.toMatchObject({
        contentLength: 1,
      });
    });
  });
});
