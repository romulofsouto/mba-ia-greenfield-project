import { S3Client } from '@aws-sdk/client-s3';
import { createStorageTestingModule } from '../test/minio';
import { S3_INTERNAL_CLIENT, S3_PUBLIC_CLIENT } from './storage.constants';
import { StorageService } from './storage.service';

describe('StorageModule', () => {
  it('should compile with both S3 clients and StorageService', async () => {
    const module = await createStorageTestingModule();

    expect(module.get(StorageService)).toBeInstanceOf(StorageService);
    expect(module.get(S3_INTERNAL_CLIENT)).toBeInstanceOf(S3Client);
    expect(module.get(S3_PUBLIC_CLIENT)).toBeInstanceOf(S3Client);
    expect(module.get(S3_INTERNAL_CLIENT)).not.toBe(
      module.get(S3_PUBLIC_CLIENT),
    );
    await module.close();
  });
});
