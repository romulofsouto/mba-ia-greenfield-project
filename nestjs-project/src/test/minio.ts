import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import storageConfig from '../config/storage.config';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';

// Tests run against the real MinIO bucket from Compose. Each suite writes only
// under prefixes it owns and removes them in afterAll.
export class MinioTestBucket {
  readonly suitePrefix = `test/${randomUUID()}/`;
  private readonly trackedPrefixes = new Set<string>([this.suitePrefix]);

  constructor(readonly storage: StorageService) {}

  // Registers an extra prefix (e.g. `videos/{id}/`) created by the code under
  // test so it is removed during cleanup.
  track(prefix: string): void {
    this.trackedPrefixes.add(prefix);
  }

  key(name: string): string {
    return `${this.suitePrefix}${name}`;
  }

  async cleanup(): Promise<void> {
    for (const prefix of this.trackedPrefixes) {
      await this.storage.deletePrefix(prefix);
    }
    this.trackedPrefixes.clear();
  }
}

// Uploads one part through a URL signed for the internal endpoint: URLs signed
// with S3_PUBLIC_ENDPOINT point at the host and are unreachable from the
// container. Returns the part ETag.
export async function uploadPartInternally(
  storage: StorageService,
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer,
): Promise<string> {
  const url = await storage.presignUploadPart(
    key,
    uploadId,
    partNumber,
    300,
    'internal',
  );
  const response = await fetch(url, {
    method: 'PUT',
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    throw new Error(
      `Part ${partNumber} upload failed: ${response.status} ${await response.text()}`,
    );
  }
  const etag = response.headers.get('etag');
  if (!etag) {
    throw new Error(`Part ${partNumber} upload returned no ETag`);
  }
  return etag;
}

export async function createStorageTestingModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [storageConfig] }),
      StorageModule,
    ],
  }).compile();
}
