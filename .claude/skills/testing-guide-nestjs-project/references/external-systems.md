> Part of the `testing-guide-nestjs-project` skill (see `../SKILL.md`).

# External System Strategies

How each external system is handled in tests. These strategies were confirmed with the team.

---

## PostgreSQL — Real (Docker)

**Strategy:** Real database via the Docker `db` service (already in `compose.yaml`).

**Connection config for tests:**
```typescript
{
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'streamtube',
  password: process.env.DB_PASSWORD ?? 'streamtube',
  database: process.env.DB_DATABASE ?? 'streamtube',
  synchronize: true, // auto-create tables in test setup
}
```

**Test isolation:**
- Use `dataSource.query('DELETE FROM "table_name"')` to clean tables between tests
- Do NOT use `repository.delete({})` — throws `Empty criteria(s) are not allowed`
- Alternative: `repository.clear()` (truncates the table)
- For complex foreign key chains, delete in reverse dependency order or use `TRUNCATE ... CASCADE`
- Use `beforeEach` for cleanup to ensure each test starts with a clean state

**Entity setup:**
- Use `synchronize: true` in test DataSource to auto-create tables from entities
- For integration tests, import only the entities needed by the test — not all entities
- For E2E tests, import `AppModule` which includes all entities via their domain modules

---

## Object Storage — Real MinIO (Docker)

**Strategy:** Real S3 API via the Compose `minio` service (bucket `S3_BUCKET`, created by the one-shot `minio-init` service). No filesystem adapter and no S3 mocks — multipart uploads, presigned URLs, `Range`/`206` and `Content-Disposition` only exist in a real S3 implementation. S3 in production uses the same `StorageService`.

**Connection:** `StorageModule` builds two `S3Client`s from `storageConfig`: the internal one (`S3_ENDPOINT=http://minio:9000`, Compose service name) runs every operation; the public one (`S3_PUBLIC_ENDPOINT`) only signs URLs for the browser on the host.

**Gotcha — presigned URLs inside the container:** a URL signed with `S3_PUBLIC_ENDPOINT` (`http://localhost:9000`) points at the host and is unreachable from the `nestjs-api` container. To actually *use* a presigned URL in a test (upload a part, read with `Range`), sign it for the internal endpoint (`presignUploadPart(..., 'internal')`, `presignGetObject(key, { endpoint: 'internal' })`). Assert on public URLs only as strings (host, query params).

**Test isolation:** one shared bucket; each suite owns its keys and removes them in `afterAll`. `src/test/minio.ts` provides:
- `createStorageTestingModule()` — `ConfigModule` + `StorageModule` against the Compose MinIO
- `MinioTestBucket` — a random per-suite prefix (`test/<uuid>/`), `key(name)` to build keys under it, `track(prefix)` for prefixes created by the code under test (e.g. `videos/{id}/`), and `cleanup()` (`deletePrefix` on every tracked prefix)
- `uploadPartInternally(storage, key, uploadId, partNumber, body)` — uploads one part through an internal-endpoint URL and returns its ETag

**Integration test:**
```typescript
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

  it('should complete a multipart upload', async () => {
    const key = bucket.key('video/original');
    const uploadId = await storage.createMultipartUpload(key, 'video/mp4');
    const etag = await uploadPartInternally(storage, key, uploadId, 1, Buffer.alloc(1024));
    await storage.completeMultipartUpload(key, uploadId, [{ partNumber: 1, etag }]);

    expect((await storage.headObject(key)).contentLength).toBe(1024);
  });
});
```

---

## Message Queue — Real Redis + BullMQ (Docker)

**Strategy:** Real Redis via the Compose `redis` service (`REDIS_HOST=redis`), BullMQ through `@nestjs/bullmq`. No queue mocks for producer/consumer contracts.

**Test isolation:** a BullMQ `prefix` unique per suite, so suites never see each other's jobs; in `afterAll`, `queue.obliterate({ force: true })` and `close()` every queue the suite opened (`src/test/redis.ts`). Processors are not registered in the API, so E2E suites never consume jobs — assert on the waiting jobs instead.

- For publisher tests: assert the job is enqueued with the expected name, `jobId` and payload
- For consumer tests: call the processor's `process(job)` with a real job and assert the outcome in DB/storage

**Setup pattern:**
```typescript
BullModule.forRoot({
  connection: { host: process.env.REDIS_HOST ?? 'redis', port: Number(process.env.REDIS_PORT ?? 6379) },
  prefix: `test-${randomUUID()}`,
}),
BullModule.registerQueue({ name: 'video-processing' }),
```

```typescript
const queue = module.get<Queue>(getQueueToken('video-processing'));
const jobs = await queue.getJobs(['waiting']);
expect(jobs[0].data).toEqual({ videoId });
```

---

## Email — Mailpit (Real SMTP Capture)

**Strategy:** Mailpit — a local SMTP server that captures all emails for inspection via its API. No emails are actually delivered.

**Setup:**
- Add Mailpit to `compose.yaml`:
```yaml
mailpit:
  image: axllent/mailpit
  ports:
    - "1025:1025"   # SMTP
    - "8025:8025"   # Web UI / API
```

**NestJS configuration:**
```typescript
// In mail module or config
{
  transport: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
  },
}
```

**Integration test:**
```typescript
describe('MailService (integration)', () => {
  beforeEach(async () => {
    // Clear all captured emails via Mailpit API
    await fetch('http://localhost:8025/api/v1/messages', { method: 'DELETE' });
  });

  it('should send confirmation email', async () => {
    await mailService.sendConfirmation('user@test.com', 'token-123');

    // Query Mailpit API for captured emails
    const response = await fetch('http://localhost:8025/api/v1/messages');
    const data = await response.json();

    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].To[0].Address).toBe('user@test.com');
    expect(data.messages[0].Subject).toContain('confirm');
  });
});
```

**Key points:**
- Mailpit captures ALL emails — no mocking, no side effects
- Use Mailpit's REST API (`http://localhost:8025/api/v1/messages`) to inspect sent emails
- Clear captured emails in `beforeEach` to ensure test isolation
- Web UI at `http://localhost:8025` for manual debugging
- Tests the full SMTP transport path — if the SMTP config is wrong, the test fails
