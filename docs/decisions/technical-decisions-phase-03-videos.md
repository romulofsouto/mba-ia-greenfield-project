---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-11-12
scope_description: "Backend foundation for video upload and processing: queue technology, direct-to-storage upload protocol for files up to 10GB, worker runtime and FFmpeg invocation, unique video URL strategy, streaming/download delivery, video status lifecycle, object storage layout and endpoints, upload limits/policies, and the test strategy for real storage and queue services."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — backend + its Docker Compose infra (`nestjs-project/compose.yaml`): receives the videos module, storage and queue integration, the video worker, the `CreateVideos` migration, and the new Compose services (object storage, queue broker, worker with FFmpeg). Covered by TD-01..TD-09.
- `next-frontend/` — out of scope, no open decision in this document. Every Phase 03 capability bullet is a backend/infra capability; no screen is listed for this phase (the player and the download button arrive in Fase 05, video editing in Fase 04). The Cross-layer TDs (TD-02 upload handshake, TD-05 streaming/download delivery) fix the HTTP contract the frontend will consume later, and they are decided here once so the later phases inherit them instead of reopening them.

Inherited constraints (not reopened): `@nestjs/config` + Joi + namespaced `registerAs` configs (phase-01 TD-01..TD-04); JWT access guard with `@Public()` and the Domain Exception Filter error envelope (phase-02-auth TD-02, TD-07); `class-validator` DTOs (phase-02-auth TD-06); OpenAPI via `@nestjs/swagger` + exported `openapi.json` (openapi-docs-nestjs TD-01, TD-02). Object storage technology is given by the architecture (S3 API, MinIO locally).

Installed baseline checked in `nestjs-project/package.json`: NestJS 11, TypeORM 0.3.28, Joi 18, Jest 30, TypeScript 5.7. No queue, S3, or FFmpeg dependency is installed yet.

---

## TD-01: Queue Technology for Background Video Processing

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** The architecture diagram (`docs/diagrams/software-arch.mermaid`) marks the Message Queue container as `TBD`. The API publishes one job per uploaded video and a separate worker consumes it. The choice adds (or not) a Compose service, drives the env-var contract (Joi schema + `compose.yaml` + `.env.example`), and decides how retries, backoff and crashed-worker recovery are implemented.

**Options:**

### Option A: BullMQ + Redis (`bullmq` + `@nestjs/bullmq`)
- Redis-backed job queue; `@nestjs/bullmq` provides `BullModule.forRoot/registerQueue`, `@Processor` / `WorkerHost`, and graceful shutdown of workers and queues.
- **Pros:** official Nest integration for Nest 11; built-in `attempts` + exponential `backoff` (with jitter), stalled-job detection when a worker dies mid-job, `jobId`/deduplication for idempotent enqueue, `removeOnComplete`/`removeOnFail` retention. Matches the separate "Message Queue" container in the C4 diagram and the BullMQ example already in the testing guide.
- **Cons:** adds a Redis service (must run with `maxmemory-policy noeviction`); enqueue is not transactional with the PostgreSQL status update (dual write — see TD-06). Redis 8 is AGPL/RSAL licensed; Valkey is a drop-in BSD alternative if licensing matters.

### Option B: RabbitMQ (AMQP)
- Dedicated message broker; Nest integration via `@nestjs/microservices` RMQ transport or `@golevelup/nestjs-rabbitmq`.
- **Pros:** real broker semantics (acks, routing, exchanges), language-agnostic consumers, mature management UI.
- **Cons:** retry-with-backoff is not built in: it needs dead-letter exchanges + TTL queues (or the delayed-message plugin); the official Nest RMQ transport is RPC/event oriented, not a job queue (no job state, no retention). Heavier service and more plumbing for a single job type.

### Option C: pg-boss (PostgreSQL-backed queue)
- Job queue stored in PostgreSQL tables (already in the stack); `send()` with `retryLimit`, `retryDelay`, `retryBackoff`, `singletonKey`.
- **Pros:** no new infrastructure service; jobs can be inserted inside the same DB transaction as the video status change (`send(..., { db })`), removing the dual-write problem; durability equals the database's.
- **Cons:** no official Nest module (manual provider/lifecycle wiring); polling load lands on the main database; contradicts the separate queue container in the architecture diagram; smaller ecosystem for monitoring.

**Recommendation:** **Option A (BullMQ + Redis)** — it is the only option with a first-party Nest 11 module and with retries, backoff and stalled-job recovery built in, which TD-06 relies on; it keeps the heavy queue traffic off the PostgreSQL instance and matches the queue container already drawn in the architecture. pg-boss is the strong alternative if avoiding a new service matters more than the official integration — its transactional enqueue is a real advantage, while BullMQ needs the mitigation described in TD-06.

**Decision:** A (BullMQ + Redis)
**Libraries:** bullmq, @nestjs/bullmq

---

## TD-02: Upload Protocol for Files up to 10GB (direct-to-storage)

**Scope:** Cross-layer

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** The project plan requires 10GB uploads "sem impacto na performance" and, in _Pontos de Atenção_, the ability to resume after a connection failure. If the file bytes flow through the Nest process, the API's CPU, memory and bandwidth are tied up for the whole upload. The protocol is a handshake that the backend exposes now and the frontend implements later, so it is Cross-layer. Depends on TD-07 (bucket and public endpoint) and feeds TD-08 (part size) and TD-06 (when processing starts).

**Options:**

### Option A: S3 multipart upload with presigned part URLs
- API initiates the multipart upload (`CreateMultipartUpload`), returns presigned `UploadPart` URLs (`@aws-sdk/s3-request-presigner`), the client PUTs each part directly to storage, and the API completes (`CompleteMultipartUpload` with the part ETags) or aborts.
- **Pros:** zero file bytes through the API; S3 allows up to 10,000 parts of 5 MiB–5 GiB, so 10GB fits easily; resumable — the client re-uploads only missing parts (the API can list uploaded parts); parallel part uploads; same code works on MinIO and AWS S3.
- **Cons:** the client owns a multi-step handshake (init → parts → complete); the bucket CORS must expose the `ETag` header to browsers; the API cannot enforce the total size during upload — it must validate at init and verify the final object at completion (TD-08).

### Option B: tus protocol (`@tus/server` + `@tus/s3-store`)
- An open resumable-upload protocol; a tus server mounted in the API receives chunks (`PATCH` with offsets) and writes them to S3 via multipart under the hood.
- **Pros:** standard protocol with mature clients (`tus-js-client`, Uppy) and resume built into the protocol; the client logic is simpler than hand-rolled multipart.
- **Cons:** every byte of the 10GB still flows through the Nest process before reaching storage — the opposite of "without passing the file through the API"; a stateful upload server must be scaled and kept alive; adds a protocol and dependencies that later phases must also learn.

### Option C: Single presigned PUT
- The API presigns one `PutObject` URL and the client uploads the whole file in one request.
- **Pros:** simplest possible flow (one URL, one request); no bytes through the API.
- **Cons:** S3's single PUT is limited to 5 GB, so it cannot satisfy the 10GB requirement; no resume — a dropped connection at 4.9 GB restarts from zero. Disqualified by the requirement.

**Recommendation:** **Option A (S3 multipart with presigned part URLs)** — it is the only option that meets both hard requirements at once (10GB beyond the 5 GB single-PUT ceiling, and no load on the API), and it gives resume for free through the part model; tus is resumable too but routes the full 10GB through Nest, which is the impact the phase must avoid.

**Decision:** A (S3 multipart upload with presigned part URLs)
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

---

## TD-03: Worker Runtime and FFmpeg/FFprobe Invocation

**Scope:** Backend

**Capability:** Transversal — covers: Processamento automático do vídeo após upload (extração de duração e metadados); Geração automática de thumbnail a partir de um frame do vídeo

**Context:** Metadata extraction (`ffprobe`) and thumbnail generation (`ffmpeg`) are CPU-heavy and long-running for large files. The C4 diagram draws the Video Worker as its own container. Two coupled choices: where the consumer runs (a Compose service with FFmpeg installed, or inside the API process) and how the binaries are invoked. `fluent-ffmpeg` — the usual Node wrapper — is deprecated on npm ("Package no longer supported") and its repository is archived. Depends on TD-01.

**Options:**

### Option A: Dedicated worker container (same Nest codebase) + `ffprobe`/`ffmpeg` via `child_process.spawn`
- A second Compose service built from the backend codebase starts a standalone Nest application context (no HTTP server) that registers only the queue processor; the image includes FFmpeg; the processor spawns `ffprobe -print_format json` and `ffmpeg -ss <t> -frames:v 1` directly.
- **Pros:** CPU load is isolated from the API, matching the architecture diagram; reuses entities, config and storage modules (no duplicated code); no unmaintained dependency; `ffprobe`/`ffmpeg` can read the source through a presigned HTTP URL (range requests), avoiding a 10GB download to local disk.
- **Cons:** one more container and entrypoint to maintain; argument building, timeouts and exit-code/stderr handling are written by hand (small, testable surface).

### Option B: In-process worker inside the API container + `child_process.spawn`
- The `@Processor` is registered in the API application itself; FFmpeg is installed in the API image.
- **Pros:** no extra service; simplest wiring and deployment.
- **Cons:** FFmpeg runs on the same container that serves HTTP — a few concurrent 10GB jobs compete for CPU/memory with requests, contradicting "sem impacto na performance"; scaling processing means scaling the API; diverges from the architecture diagram.

### Option C: Dedicated worker container + `fluent-ffmpeg` wrapper
- Same isolated runtime as Option A, but FFmpeg is driven through the `fluent-ffmpeg` fluent API (`ffprobe()`, `screenshots()`).
- **Pros:** less argument plumbing; familiar API with many examples.
- **Cons:** deprecated and archived upstream — no fixes for new FFmpeg versions or security issues; adds an unmaintained dependency (plus `@types/fluent-ffmpeg`) to a greenfield project for a two-command use case.

**Recommendation:** **Option A** — the separate container keeps heavy processing off the API, as the phase and the architecture demand, and invoking the two binaries directly is a small, fully testable surface that avoids taking on an archived library.

**Decision:** A (dedicated worker container + `ffprobe`/`ffmpeg` via `child_process.spawn`)
**Libraries:** —

---

## TD-04: Unique Video URL Identifier Strategy

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Each video needs a short public identifier for its URL that never collides with another video (_Pontos de Atenção_: "URL curta e única"). It is generated at pre-registration (TD-06), so the URL exists before processing ends. Fase 04 introduces **unlisted** videos ("somente via link"), so the identifier must not be guessable or enumerable. The identifier is a contract stored in the DB, exposed in API routes, and used by the frontend later.

**Options:**

### Option A: Random short ID (11-char base62/base64url) + unique constraint + retry on collision
- Generate the ID from `crypto.randomBytes` (no dependency) in a URL-safe alphabet; store it in a column with a unique index; on unique violation, regenerate and retry a bounded number of times.
- **Pros:** short (YouTube-like) URLs; ~64 bits of randomness makes collisions practically impossible and the DB constraint makes them impossible in fact; not enumerable — safe for unlisted videos; decoupled from the internal primary key.
- **Cons:** needs the retry-on-conflict path (rarely exercised, must be tested); an extra indexed column beside the primary key.

### Option B: UUID in the URL (v4 or v7)
- Use the entity's UUID primary key directly as the public identifier.
- **Pros:** zero extra logic or column; uniqueness by construction.
- **Cons:** 36-character URLs fail the "URL curta" requirement; v7 exposes the creation timestamp; couples the public URL to the internal key forever.

### Option C: Hashids/Sqids encoding of a sequential integer ID
- Encode a serial primary key into a short string with a salted alphabet.
- **Pros:** short and collision-free by construction (bijective encoding).
- **Cons:** reversible obfuscation, not secrecy — IDs can be decoded and enumerated, which leaks unlisted videos (Fase 04) and the total video count; requires a serial key alongside the existing UUID pattern; adds a dependency.

**Recommendation:** **Option A** — it is the only option that is both short and non-enumerable, which the unlisted visibility of Fase 04 requires; the unique index turns the collision case into a handled retry instead of a correctness risk, without new dependencies.

**Decision:** A (random 11-char ID + unique constraint + retry on collision)
**Libraries:** —

---

## TD-05: Streaming and Download Delivery

**Scope:** Cross-layer

**Capability:** Transversal — covers: Reprodução via streaming (sem necessidade de download completo); Download do vídeo pelo usuário

**Context:** Playback must start without downloading the whole file, which requires HTTP Range support (`206 Partial Content`) so the player can fetch and seek. The architecture diagram draws `Frontend → Object Storage: Streams`, i.e. bytes go from storage to the browser. Download needs the same file with `Content-Disposition: attachment`. The delivery mode defines the contract the frontend player (Fase 05) consumes. Depends on TD-07 (public endpoint) and TD-06 (only processed videos are deliverable).

**Options:**

### Option A: Short-lived presigned GET URLs served directly by storage
- The API authorizes the request and returns (or redirects `302` to) a presigned `GetObject` URL; the storage answers Range requests with `206` natively. Download uses a second presigned URL with `ResponseContentDisposition=attachment`.
- **Pros:** zero video bytes through the API; Range/seek, caching headers and throughput handled by the storage (and later a CDN); matches the architecture diagram; the same mechanism serves thumbnails.
- **Cons:** URLs are bearer links valid until expiry (keep TTL short); signatures embed the host, so presigning must use the public endpoint (TD-07); access rules are evaluated only at URL issuance.

### Option B: API proxy with Range forwarding
- The API receives the `Range` header, requests the same range from storage and pipes it back (`StreamableFile`, `206`).
- **Pros:** every byte request is authorized; storage stays fully private; stable, permanent API URLs.
- **Cons:** all video traffic flows through Nest — the bandwidth and connection load the phase must avoid; Range/`Content-Range`/`If-Range` edge cases are hand-written; no direct path to a CDN.

### Option C: HLS (FFmpeg-segmented playlist)
- The worker transcodes into `.m3u8` + segments (optionally several bitrates) and the player streams the playlist.
- **Pros:** adaptive bitrate and the most robust playback on poor networks; industry standard for large platforms.
- **Cons:** turns "extract metadata + thumbnail" into full transcoding — processing time and storage multiply; needs an HLS player (hls.js) on the frontend; the original file is still needed for download. Beyond the scope of Fase 03.

**Recommendation:** **Option A** — progressive streaming of the original file over Range requests satisfies "sem download completo" with no transcoding, keeps video bytes off the API and matches the architecture; HLS can be added later as a separate decision without changing the download flow.

**Decision:** A (short-lived presigned GET URLs served directly by storage)
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

**Revisions:**

- 2026-11-12 — Access rule for Fase 03: streaming and download URLs are issued only to the authenticated owner of the video while it is a draft; public/anonymous access arrives with publication in Fase 04. _Rationale:_ resolves AMB-1 of phase-03-videos validation — every Fase 03 video is a draft and the draft → published flow belongs to Fase 04; consistent with the private bucket (TD-07) and the separate editorial state (TD-06).

---

## TD-06: Video Status Lifecycle, Processing Trigger and Failure Handling

**Scope:** Backend

**Capability:** Transversal — covers: Pré-cadastro automático do vídeo como rascunho ao iniciar o upload; Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** The video row is created as a draft when the upload starts, processing starts automatically after the upload finishes, and processing can fail. Fase 04 adds a separate editorial flow ("Fluxo de rascunho → publicação", visibility public/unlisted), so "draft" has two meanings that must not be conflated. The trigger must be reliable even though the DB update and the enqueue are two writes (dual-write with TD-01 Option A). Depends on TD-01, TD-02, TD-03.

**Options:**

### Option A: Single status enum (`draft → processing → ready | failed`) + API-triggered processing
- One column holds everything; the "complete upload" endpoint finalizes the multipart upload, sets `processing` and enqueues the job; queue retries with exponential backoff; after the last attempt the worker sets `failed`.
- **Pros:** simplest schema and state machine for this phase; explicit, testable trigger.
- **Cons:** Fase 04's draft → published flow must reuse or redefine the same column — "ready but unpublished" cannot be expressed without migrating the enum and its meaning.

### Option B: Two orthogonal states (processing `uploading → processing → ready | failed` + editorial state starting as `draft`) + API-triggered processing
- The processing pipeline state is separate from the publication state; Fase 03 only creates the editorial `draft` and drives the processing state. Trigger, retries and terminal `failed` as in Option A; enqueue uses the video ID as the job ID (idempotent) and runs after the DB commit, marking the video `failed` if enqueue itself fails.
- **Pros:** Fase 04 adds publication/visibility without touching the processing pipeline; every combination is expressible (e.g. ready-but-draft); the dual write is bounded and idempotent; BullMQ's stalled-job detection covers worker crashes.
- **Cons:** two fields to keep consistent in queries (e.g. "publishable = ready AND draft"); slightly more up-front modeling.

### Option C: Storage-event-driven trigger (bucket notification on object creation)
- The storage publishes an event when the object is complete (MinIO bucket notifications to Redis/webhook) and that event enqueues processing; state model as in B.
- **Pros:** processing starts even if the client never calls "complete"; decouples the trigger from the API.
- **Cons:** with multipart uploads the object only exists after `CompleteMultipartUpload`, which the API performs anyway — the event adds no information; storage-specific notification config differs between MinIO and S3 (SNS/SQS/EventBridge); harder to test and to reason about.

**Recommendation:** **Option B** — separating processing from publication avoids a schema rework in Fase 04, and the API-driven trigger is the natural completion point of the multipart flow chosen in TD-02; idempotent enqueue after commit plus queue retries and a terminal `failed` state cover every failure path without storage-specific events.

**Decision:** B (two orthogonal states — processing `uploading → processing → ready | failed` + editorial state starting as `draft` — with API-triggered processing)
**Libraries:** —

---

## TD-07: Object Storage Layout, Environment Contract and Internal vs Public Endpoint

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** S3 API with MinIO locally is given by the architecture. Open points: how videos and thumbnails are organized (buckets/prefixes, keyed by what), the canonical env-var set (Joi schema + `compose.yaml` + `.env.example` — cross-component), and the endpoint split. Inside Docker the API reaches storage at the Compose service name (`http://minio:9000`, per `CLAUDE.md`), but presigned URLs (TD-02, TD-05) are used by the browser on the host, and the signature includes the host — a URL signed for `minio:9000` is unusable outside Docker. Note: MinIO's community edition entered maintenance mode (Dec 2025) and stopped publishing official Docker images (Oct 2025); the Compose image must be pinned to a known tag or replaced by an S3-compatible image — this does not change the S3-API decisions below.

**Options:**

### Option A: Single private bucket with key prefixes + dual endpoint (internal for operations, public for presigning)
- One bucket; keys like `videos/{videoId}/original` and `thumbnails/{videoId}/{file}` keyed by the internal video ID; one S3 client on the internal endpoint for server-side operations and one configured with the public endpoint used only to presign URLs.
- **Pros:** single bucket policy/CORS/lifecycle to manage; keys never depend on the public slug (TD-04) and are deleted per video by prefix; presigned URLs work from the browser while server traffic stays on the Docker network; env contract stays small (`S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`).
- **Cons:** two client instances to configure; one bucket means one policy, so different public/private rules require presigning for everything (thumbnails included).

### Option B: Separate buckets per asset type (private `videos`, public-read `thumbnails`) + dual endpoint
- Thumbnails live in a public-read bucket served by plain URL; videos stay private and presigned.
- **Pros:** thumbnails are cacheable, stable URLs with no signing cost — good for listing pages in Fase 07.
- **Cons:** public thumbnails of unlisted or draft videos leak their existence (Fase 04); two buckets to provision, configure and clean up in tests; more env keys.

### Option C: Single private bucket + single endpoint made resolvable from both sides
- Use one hostname for storage everywhere (e.g. map `minio` in the host's hosts file or put a reverse proxy in front), so one client signs and operates.
- **Pros:** one client, one endpoint variable.
- **Cons:** depends on per-machine host configuration or an extra proxy service; fragile for every developer and in CI; violates nothing in the code but moves the problem into the environment.

**Recommendation:** **Option A** — one private bucket with prefixes keyed by the internal video ID keeps policy and cleanup simple and keeps unlisted/draft content private, and the internal/public endpoint split is the standard way to keep server traffic on the Docker network (`minio`, never `localhost`) while issuing URLs the browser can actually use.

**Decision:** A (single private bucket with key prefixes + internal/public endpoints)
**Libraries:** @aws-sdk/client-s3

---

## TD-08: Upload Limits and Policies (size, part size, MIME types, abandoned uploads)

**Scope:** Backend

**Capability:** Transversal — covers: Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance; Pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Context:** With direct-to-storage multipart (TD-02) the API cannot stop a client mid-upload, so limits are enforced at three points: when the upload is initiated (declared size and type), when it is completed (actual object size), and in the worker (`ffprobe` confirms it is a real video). Abandoned uploads leave orphan parts in storage and draft rows in the DB. Values cross components (Joi env schema, DTO validation, storage lifecycle config, worker). Depends on TD-02, TD-06, TD-07.

**Options:**

### Option A: Fixed policy enforced at init, complete and processing + scheduled cleanup
- Max 10 GiB declared at init and re-checked with the final object size at completion; fixed part size (e.g. 64 MiB → at most 160 parts for 10 GiB, well inside S3's 5 MiB–5 GiB and 10,000-part limits); MIME allowlist (`video/mp4`, `video/webm`, `video/quicktime`, `video/x-matroska`) checked at init, with `ffprobe` as the authoritative check (non-video → `failed`); short-lived part URLs re-requestable; a scheduled job aborts multipart uploads still `uploading` after 24h and marks them failed, with the storage's own stale-upload expiry as a backstop.
- **Pros:** predictable part count and memory use on the client; every limit has an enforcement point; storage and DB stay consistent; values live in env/config, so tests can lower them.
- **Cons:** a fixed part size is not optimal for very small files (few parts, little parallelism); the cleanup job is one more scheduled task to run and test.

### Option B: Dynamic part size + broad MIME acceptance + storage-only expiry
- Part size computed from the declared file size (clamped to S3 limits); accept any `video/*` type and rely on `ffprobe`; rely only on the storage's automatic expiry of incomplete multipart uploads.
- **Pros:** less configuration and no scheduled job of our own; maximum format coverage.
- **Cons:** draft rows stay `uploading` forever when the storage silently expires the parts (DB/storage drift); `video/*` admits formats FFmpeg cannot thumbnail, which fail late after a full upload; part-size logic becomes part of the client contract.

**Recommendation:** **Option A** — explicit limits at init, complete and processing give a clear error at the earliest point for each failure, and the scheduled cleanup keeps the DB status consistent with storage, which a storage-only expiry cannot do.

**Decision:** A (fixed policy enforced at init, complete and processing + scheduled cleanup)
**Libraries:** —

---

## TD-09: Test Strategy for Object Storage and Queue

**Scope:** Backend

**Capability:** Transversal — covers: Serviço de armazenamento de arquivos (vídeos e thumbnails); Serviço de processamento em segundo plano (filas)

**Context:** The project's testing philosophy is to not mock what runs in Docker Compose (PostgreSQL and Mailpit are already tested for real). The current testing guide (`.claude/skills/testing-guide-nestjs-project/references/external-systems.md`) says object storage uses a **local filesystem adapter** in tests — this conflicts with the requirement to test against real storage and cannot exercise multipart, presigning or Range behavior at all. The queue section of the guide already assumes a real broker. Tests run inside the `nestjs-api` container with `--runInBand` against shared services. Depends on TD-01, TD-03, TD-07.

**Options:**

### Option A: Real MinIO and Redis from Compose, isolated per suite; update the testing guide
- Integration and e2e tests hit the Compose `minio` and `redis` services by service name; isolation through a test bucket (or per-suite key prefix) emptied in hooks and a per-suite BullMQ queue prefix obliterated after each suite; unit tests mock only the storage/queue ports of the class under test; worker tests use a tiny committed fixture video; the external-systems guide is updated to "storage = real MinIO".
- **Pros:** exercises the real contracts (multipart, presign with the public endpoint, `206` ranges, retries) — the code paths most likely to break; consistent with how PostgreSQL and Mailpit are tested; no new tooling.
- **Cons:** tests need the Compose services up; suites share services, so cleanup discipline is required (same as the DB today); the test container needs FFmpeg for worker tests.

### Option B: Keep the filesystem storage adapter in tests + real Redis
- Follow the current guide: a `local` storage driver in tests, S3 in other environments.
- **Pros:** storage tests run without MinIO and are fast.
- **Cons:** a filesystem cannot reproduce multipart uploads, presigned URLs or Range responses — the core of this phase would be untested; production code gains a driver that only tests use; contradicts the no-mock-of-Compose-services rule.

### Option C: Testcontainers (ephemeral MinIO/Redis per test run)
- Each suite starts its own containers through the Docker API.
- **Pros:** perfect isolation; no shared state between suites.
- **Cons:** tests already run inside a container, so this needs the Docker socket mounted into `nestjs-api` (Docker-in-Docker concerns); much slower startup; duplicates services Compose already provides; new dependency and pattern unlike the existing DB tests.

**Recommendation:** **Option A** — real Compose services are the only way to test the multipart, presign and Range contracts this phase depends on, and they reuse the isolation pattern the project already applies to PostgreSQL and Mailpit; the testing guide's filesystem rule must be corrected as part of the phase.

**Decision:** A (real MinIO and Redis from Compose, isolated per suite; update the testing guide)
**Libraries:** —

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Backend | Queue Technology for Background Video Processing | A (BullMQ + Redis) | A |
| TD-02 | Cross-layer | Upload Protocol for Files up to 10GB | A (S3 multipart with presigned part URLs) | A |
| TD-03 | Backend | Worker Runtime and FFmpeg/FFprobe Invocation | A (dedicated worker container + `child_process`) | A |
| TD-04 | Backend | Unique Video URL Identifier Strategy | A (random 11-char ID + unique index + retry) | A |
| TD-05 | Cross-layer | Streaming and Download Delivery | A (short-lived presigned GET URLs) | A |
| TD-06 | Backend | Video Status Lifecycle, Trigger and Failure Handling | B (processing state separate from editorial draft, API-triggered) | B |
| TD-07 | Backend | Object Storage Layout, Env Contract and Endpoints | A (single private bucket + internal/public endpoints) | A |
| TD-08 | Backend | Upload Limits and Policies | A (fixed limits at init/complete/processing + scheduled cleanup) | A |
| TD-09 | Backend | Test Strategy for Object Storage and Queue | A (real MinIO + Redis from Compose; update testing guide) | A |
