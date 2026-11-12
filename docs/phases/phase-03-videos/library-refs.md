---
libs:
  "bullmq":
    version: "^6.7.5 (latest on npm 2026-11-12; not installed yet)"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-11-12T12:50:51-03:00"
  "@nestjs/bullmq":
    version: "^12.0.1 (latest on npm 2026-11-12; peer: @nestjs/core ^10||^11||^12, bullmq ^3..^6; not installed yet)"
    context7_id: "/nestjs/bull"
    fetched_at: "2026-11-12T12:50:51-03:00"
  "@aws-sdk/client-s3":
    version: "^3.1167.0 (latest on npm 2026-11-12; not installed yet)"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-11-12T12:50:51-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "^3.1167.0 (latest on npm 2026-11-12; not installed yet)"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-11-12T12:50:51-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-12T12:49:46-03:00"
---

# Library References — phase-03-videos

Distilled from Context7 for the surfaces the phase-03-videos TDs use. Versions are the npm `latest` at fetch time; pin the installed version in `nestjs-project/package.json` during implementation and re-check here if a major differs.

### bullmq

_Used by: phase-03-videos/TD-01 (queue), TD-06 (retries, terminal `failed`, idempotent enqueue), TD-08 (scheduled cleanup candidate)._

- **Idempotent enqueue:** pass a deterministic `jobId` (e.g. derived from the video ID) — re-adding the same logical job is skipped while it exists in the queue. Caveat from the docs: jobs already removed (manually or via `removeOnComplete`/`removeOnFail`) are NOT treated as duplicates.
  ```ts
  await queue.add('process-video', { videoId }, { jobId: `process-${videoId}` });
  ```
- **Retries:** `attempts` + `backoff: { type: 'exponential', delay }` (delay grows as 2^(attempt-1)·delay). A job that throws in the processor fails the attempt and is retried; after the last attempt it lands in the failed set → map to the terminal `failed` processing state (TD-06).
- **Job options** (`DefaultJobOptions`): `attempts`, `backoff`, `delay`, `priority`, `removeOnComplete`, `removeOnFail` (boolean | count | KeepJobs), `keepLogs`; `BaseJobOptions` adds `jobId`.
- **Stalled jobs:** worker defaults `lockDuration: 30000`, `stalledInterval: 30000`, `maxStalledCount: 1` (a job may return to `wait` once, then goes to failed). Long FFmpeg runs rely on automatic lock renewal (`lockRenewTime` = lockDuration/2) — do not set `skipLockRenewal`.
- **Connection:** `Worker` requires a `connection`; it forces `maxRetriesPerRequest: null` on its blocking connection (overriding it triggers a warning — don't).
- **Concurrency:** `Worker` option `concurrency` (default 1) — keep it low for CPU-bound FFmpeg work.
- **Graceful shutdown:** `await worker.close()` on SIGTERM/SIGINT lets active jobs finish and minimizes stalled jobs.
- **Recurring jobs (v6):** repeatable jobs are expressed as Job Schedulers — `queue.upsertJobScheduler(id, { pattern: '<cron>' }, { name, data, opts })`; `upsert` is idempotent, so it can be called at every boot. Candidate mechanism for the TD-08 abandoned-upload cleanup without adding another scheduler lib.

### @nestjs/bullmq

_Used by: phase-03-videos/TD-01, TD-03 (worker container runs the same Nest codebase with the processor registered)._

- **Root config (async, from `@nestjs/config`):** fits the inherited `registerAs` + `ConfigType` convention.
  ```ts
  BullModule.forRootAsync({
    inject: [queueConfig.KEY],
    useFactory: (cfg: ConfigType<typeof queueConfig>) => ({ connection: { host: cfg.host, port: cfg.port } }),
  })
  ```
- **Queue registration:** `BullModule.registerQueue({ name })` or `registerQueueAsync({ name, useFactory, inject })` — `defaultJobOptions` (e.g. `{ attempts: 3, backoff: { type: 'exponential' } }`) can be set per queue.
- **Producer:** inject with `@InjectQueue('<name>') queue: Queue` and call `queue.add(...)`.
- **Consumer:** a class annotated `@Processor('<name>')` must extend `WorkerHost` and implement `async process(job: Job, token?: string)`; a missing `process` throws `InvalidProcessorClassError` at registration. Throwing inside `process` fails the attempt (retried per queue config).
- `this.worker` (the underlying BullMQ `Worker`) is only available after module init — use it in `onApplicationBootstrap`, never in the constructor. How to pass worker options (concurrency, lockDuration) through `@Processor` was not covered by the fetched docs — confirm via context7 at implementation time.
- Registering the processor only in the worker container's module (not in the API's) is what keeps processing off the API (TD-03).

### @aws-sdk/client-s3

_Used by: phase-03-videos/TD-02 (multipart), TD-05 (GetObject), TD-07 (client config, endpoints), TD-09 (real MinIO in tests)._

- **MinIO client config:** `new S3Client({ endpoint, forcePathStyle: true, region, credentials: { accessKeyId, secretAccessKey } })`. `forcePathStyle` (v2's `s3ForcePathStyle`) puts the bucket in the path (`host/bucket/key`) — required for MinIO. Two clients per TD-07: one with the internal endpoint (`http://minio:9000`, server-side operations) and one with the public endpoint (used only for presigning, since the signature embeds the host).
- **Multipart flow (TD-02):** `CreateMultipartUploadCommand({ Bucket, Key, ContentType })` → `UploadId`; client uploads parts via presigned `UploadPartCommand({ Bucket, Key, UploadId, PartNumber })`; `CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts: [{ ETag, PartNumber }] } })`; `AbortMultipartUploadCommand({ Bucket, Key, UploadId })` for cancellation/cleanup; `ListPartsCommand` to resume.
- `PartNumber` is an integer 1–10,000; with additional checksums the parts must start at 1 and be consecutive, otherwise `400 InvalidPartOrder`.
- **Final size check (TD-08):** `HeadObjectCommand({ Bucket, Key })` returns `ContentLength`, `ContentType`, `ETag`, `AcceptRanges: 'bytes'` without downloading the body.
- **Delivery (TD-05):** `GetObjectCommand({ Bucket, Key, ResponseContentDisposition: 'attachment; filename="..."' })` for download; without the disposition override for streaming.

### @aws-sdk/s3-request-presigner

_Used by: phase-03-videos/TD-02 (part URLs), TD-05 (stream/download URLs)._

- `getSignedUrl(client, command, { expiresIn })` — `expiresIn` in seconds, default **900**. Works with any client command (`UploadPartCommand`, `GetObjectCommand`).
  ```ts
  const url = await getSignedUrl(publicS3, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber }), { expiresIn: 3600 });
  ```
- Presign with the client configured for the **public** endpoint (TD-07) — the URL is bound to the host it was signed for.
- To sign `x-amz-*` headers (e.g. checksums) they must be listed in `unhoistableHeaders`, forcing the uploader to send them; `signableHeaders` / `unsignableHeaders` control which headers enter the signature.
- Browser part uploads need the bucket CORS to expose the `ETag` header so the client can report it at completion (TD-02 Cons).
