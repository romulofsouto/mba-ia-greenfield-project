# CLAUDE.md

## Environment Startup Verification

**Default behavior:** starting the environment means starting **only infrastructure services** (database, mail, etc.) — **never** start the NestJS application server unless the user explicitly asks to run/serve the project (e.g., "rode o projeto", "suba o servidor", "run the app").

After starting infrastructure, always confirm the containers are up before proceeding:

```bash
docker compose ps   # all services must show status "running"
```

Then verify each infrastructure service is actually ready to accept connections — not just running:

- **PostgreSQL:** `docker compose exec db pg_isready -U streamtube` — expect `accepting connections`
- **Redis:** `docker compose exec redis redis-cli ping` — expect `PONG`
- **MinIO:** `docker compose ps minio` shows `healthy` (healthcheck `curl -f http://localhost:9000/minio/health/live` inside the container); `docker compose ps -a minio-init` shows `Exited (0)` once the bucket `S3_BUCKET` exists. Console at http://localhost:9001 (login `S3_ACCESS_KEY` / `S3_SECRET_KEY`)

Only start the NestJS dev server (`npm run start:dev`) when the user **explicitly** asks to run the application — never as part of "start the environment". The same applies to the `video-worker` service: start infrastructure with `docker compose up -d db mailpit redis minio minio-init`, and start the worker only on request with `docker compose up -d video-worker`.

## Development Environment

This project runs inside Docker. Always use the container for development:

```bash
# Start containers
docker compose up -d

# Install dependencies (first time only)
docker compose exec nestjs-api npm install

# Run the dev server (watch mode)
docker compose exec nestjs-api npm run start:dev
```

Services:
- `nestjs-api` — NestJS API, port `3000`
- `video-worker` — video processing worker (same image and volume as the API, no HTTP port); consumes the `video-processing` and `video-maintenance` queues. It runs `scripts/start-worker-dev.sh`: `tsc --watch` compiles into `dist-worker/` and `node --watch` (PID 1) restarts the worker on changes. `docker compose stop video-worker` sends SIGTERM to that node process, Nest closes the BullMQ workers and the container exits with `Exited (0)` — immediately when idle, or after the active job finishes, up to `stop_grace_period` (200s); past that the container is killed and the job comes back through BullMQ stalled-job recovery
- `db` — PostgreSQL 17, port `5432`, database `streamtube`, user/password `streamtube`
- `redis` — Redis 8 for the BullMQ queues; no host port (reach it as `redis:6379` from the containers)
- `minio` — S3-compatible object storage; API port `9000`, console port `9001`
- `minio-init` — one-shot job that creates the `S3_BUCKET` bucket, then exits
- `mailpit` — SMTP `1025`, web UI `8025`

All verification and teardown commands run on the **host machine**:

```bash
# Verify NestJS is running (expect 200 + "Hello World!")
curl http://localhost:3000

# Verify PostgreSQL is ready (runs inside the db container)
docker compose exec db pg_isready -U streamtube

# Verify Redis and MinIO are ready
docker compose exec redis redis-cli ping
docker compose ps minio minio-init

# Check container logs
docker compose logs nestjs-api
docker compose logs video-worker
docker compose logs db

# Tear down the entire environment
docker compose down
```

## Commands

**Strict rule:** every `npm`, `npx`, `node`, `tsc`, and test command runs **inside the container**, never on the host. Running on the host causes env-var divergence (`DB_HOST` resolves to `localhost` instead of the Compose service), uses a different Node version, and produces results that do not reflect what runs in CI/prod.

### Container-only commands (always prefix with `docker compose exec nestjs-api`)

```bash
npm run start:dev                        # Dev server with hot-reload
npm run build                            # Compile to dist/
npm run start:prod                       # Run compiled build
npm run start:worker:dev                 # Worker with hot-reload via scripts/start-worker-dev.sh (the video-worker service runs the script directly; builds to dist-worker/)
npm run start:worker                     # Run compiled worker (dist/worker/main)
npm run openapi:export                   # Regenerate openapi.json

npm test                                 # Unit tests
npm run test:watch                       # Unit tests in watch mode
npm run test:cov                         # Coverage report
npm run test:e2e                         # End-to-end tests (always with --runInBand)

npx tsc --noEmit                         # Type-check (required before declaring a task done)
npm run lint                             # ESLint with auto-fix; fails on any error or warning (--max-warnings 0)
npm run format                           # Prettier formatting
```

### Host-only commands (Docker / connectivity probes)

```bash
docker compose ps
docker compose logs nestjs-api
docker compose exec db pg_isready -U streamtube
docker compose exec redis redis-cli ping
curl http://localhost:3000
```

### Test execution

Integration and e2e suites share a single test database. They **must** be run with `--runInBand`:

```bash
docker compose exec nestjs-api npm test -- --runInBand
docker compose exec nestjs-api npm run test:e2e   # already configured
```

Parallel execution causes FK violations, deadlocks, and cross-suite contamination because suites truncate or seed shared tables concurrently.

During active development, run only the tests related to the file being changed (`npm test -- path/to/file.spec.ts`). Before declaring a task done, run the full suite — see the global `CLAUDE.md` → "Definition of Done (Technical)".

## Long-running Processes

Commands that never exit (dev server, watch modes) must be run in background in the Bash tool — otherwise the agent blocks indefinitely waiting for the process to return.

This applies to: `start:dev`, `start:prod`, `start:worker`, `start:worker:dev`, `test:watch`, and any other persistent process.

## Test Type Selection

Choose the suffix by what the test really does, not by where the code under test lives. The suffix is a contract that drives Jest config (`testRegex`, parallelism), CI steps, and reader expectations.

| Suffix                  | Purpose                                                              | DB / external I/O | Location                     |
|-------------------------|----------------------------------------------------------------------|-------------------|------------------------------|
| `*.spec.ts`             | **Unit** — pure logic, all collaborators mocked                      | Forbidden         | Next to the source file      |
| `*.integration-spec.ts` | **Integration** — exercises real DB, real repositories, real modules | Required          | Next to the source file      |
| `*.e2e-spec.ts`         | **End-to-end** — full HTTP cycle via `supertest`                     | Required          | `nestjs-project/test/`       |

A test that constructs a `TypeOrmModule.forRoot`, opens a connection, or hits the `db` service **must** be `*.integration-spec.ts`, never `*.spec.ts`. A test that boots the full Nest application and makes HTTP calls **must** be `*.e2e-spec.ts`.

Conventions for **how to write** each kind of test (mocking patterns, AAA structure, override strategies for global guards, etc.) live in `.claude/rules/nestjs-testing.md` and load when you edit a test file.

## Jest Configuration

These settings are required in `package.json` (jest config) and `test/jest-e2e.json` for the project's tests to work correctly:

- `setupFiles: ["dotenv/config"]` — without this, `.env` is not loaded inside the Jest process. `DB_HOST`, `JWT_SECRET`, etc. fall back to undefined or to the host's `localhost`, breaking container-to-container DNS.
- `testRegex: '.*\\.(spec|integration-spec)\\.ts$'` — covers both unit (`*.spec.ts`) and integration (`*.integration-spec.ts`) suffixes.

Do not add new test-file suffixes; if a new test type is needed, update the regex deliberately.

## Environment File Conventions

`.env` is parsed by both Docker Compose and `dotenv` — values containing shell-special characters (`<`, `>`, `|`, `&`, spaces) **must be quoted** or rewritten:

```dotenv
# Wrong — the unquoted angle brackets are shell redirection syntax and break parsing
MAIL_FROM=StreamTube <noreply@streamtube.local>

# Right — quote the value
MAIL_FROM="StreamTube <noreply@streamtube.local>"
```

Whenever possible, prefer storing only the bare address in `.env` and composing display names in code (e.g., in `mail.config.ts`) so the file stays shell-safe.

## Build Assets

`tsc` (and therefore `nest build`) only emits compiled `.ts` files to `dist/`. Any non-TypeScript runtime asset — Handlebars templates (`.hbs`), JSON fixtures, static config files, etc. — must be declared in `nest-cli.json` under `compilerOptions.assets` (with `watchAssets: true` for dev). Without that, the file exists in `src/` but is missing in `dist/` and runtime fails only after build.

## Architecture

NestJS with standard module structure. Source lives in `src/`, compiled output in `dist/`.

- Each domain feature gets its own module (e.g., `UsersModule`, `VideosModule`) registered in `AppModule`
- Controllers handle HTTP routing; Services hold business logic; both are scoped to their module

## Videos (Phase 03)

Plan and specs: `docs/phases/phase-03-videos/phase-03-videos.md`; decisions: `docs/decisions/technical-decisions-phase-03-videos.md`.

Modules:
- `src/videos/` — `VideosModule`: `Video` entity, `VideosController` (`/videos`), `VideosService`, `VideoProcessingProducer`. Also holds the processors `VideoProcessingProcessor` and `UploadCleanupProcessor` (+ `UploadCleanupService`), which are provided **only** by `WorkerModule`
- `src/storage/` — `StorageModule`/`StorageService` over `@aws-sdk/client-s3` (MinIO locally): two clients, internal endpoint (`S3_ENDPOINT`) for operations and public endpoint (`S3_PUBLIC_ENDPOINT`) for presigned URLs given to the client. Single private bucket; keys from `storage.keys.ts`: `videos/<id>/original` and `thumbnails/<id>/default.jpg` (internal `id`, never the `public_id`)
- `src/queue/` — `QueueModule` (BullMQ via `@nestjs/bullmq`); queue/job names and job options in `queue.constants.ts`
- `src/media/` — `MediaProbeService` (`ffprobe`) and `ThumbnailService` (`ffmpeg`), run via `child_process.spawn` with timeouts (`run-process.ts`, `media.constants.ts`)
- `src/worker/` — worker entrypoint (`main.ts`, Nest application context without HTTP), `WorkerModule` and `MaintenanceScheduler`

Endpoints (all authenticated and owner-only — another user's video returns `404 VIDEO_NOT_FOUND`):

| Method | Path | Result |
|--------|------|--------|
| POST | `/videos` | `201` — creates the video as draft and starts the multipart upload |
| POST | `/videos/:publicId/upload/part-urls` | `200` — presigned `UploadPart` URLs |
| GET | `/videos/:publicId/upload/parts` | `200` — parts already uploaded (resume) |
| POST | `/videos/:publicId/upload/complete` | `200` — completes the upload and enqueues processing |
| DELETE | `/videos/:publicId/upload` | `204` — aborts the upload |
| GET | `/videos/:publicId` | `200` — video details (with presigned `thumbnail_url` when available) |
| GET | `/videos/:publicId/stream` | `200 { url, expires_in }` — presigned GET; storage answers `Range` with `206` |
| GET | `/videos/:publicId/download` | `200 { url, expires_in }` — presigned GET with `Content-Disposition: attachment` |

Flow:
- **Upload (up to 10GB):** the file never passes through the API. `POST /videos` validates size/MIME, creates the S3 multipart upload and inserts the row; the client uploads the parts straight to MinIO using the presigned URLs and calls `complete`. On completion the API checks the real object size (`headObject`), sets `processing_status = processing` and enqueues `process-video`
- **Unique URL:** `public_id` — random 11-char base64url, `UNIQUE` index, retried on collision (`public-id.util.ts`)
- **Status:** two independent axes on `videos` — `processing_status` (`uploading → processing → ready | failed`) and `editorial_status` (`draft`; publishing arrives in Phase 04). Transitions are conditional `UPDATE … WHERE processing_status = <expected>`. `failure_reason` values are in `FAILURE_REASONS` (`videos.constants.ts`)
- **Processing (worker):** `ffprobe` extracts duration, dimensions, codecs and format; `ffmpeg` extracts a frame from the middle of the video as the thumbnail and uploads it to storage; then the video becomes `ready`. A file that is not a video fails immediately (`not_a_video`, `UnrecoverableError`); other errors are retried and become `processing_error` on the last attempt. A re-delivered job for a video that is no longer `processing` is a no-op

Queues (Redis, BullMQ; producers in the API, processors only in `video-worker`):
- `video-processing` → job `process-video` (`{ videoId }`, job id `process-<videoId>`), 3 attempts with exponential backoff, worker concurrency `1`
- `video-maintenance` → job `cleanup-abandoned-uploads`, scheduled hourly (`0 * * * *`) by `MaintenanceScheduler` via `upsertJobScheduler`; aborts uploads stuck in `uploading` for longer than `VIDEO_UPLOAD_ABANDON_AFTER_HOURS` and marks them `failed/upload_abandoned`

Environment (`.env.example`; validated in `src/config/env.validation.ts`):
- Storage: `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`
- Queue: `REDIS_HOST`, `REDIS_PORT`
- Videos: `VIDEO_MAX_SIZE_BYTES` (10GB), `VIDEO_PART_SIZE_BYTES`, `VIDEO_ALLOWED_MIME_TYPES`, `VIDEO_UPLOAD_URL_TTL_SECONDS`, `VIDEO_DELIVERY_URL_TTL_SECONDS`, `VIDEO_UPLOAD_ABANDON_AFTER_HOURS`

Tests use the real MinIO and Redis from Compose (no storage/queue mocks in integration/e2e). Helpers: `src/test/minio.ts`, `src/test/redis.ts`, `src/test/video-app-config.ts`, `test/support/video-e2e.ts`; video fixtures in `test/fixtures/`.

## Code Conventions

- **TypeScript:** `nodenext` module resolution, `ES2023` target, `strictNullChecks` on, `noImplicitAny` off
- **Decorators:** `emitDecoratorMetadata` + `experimentalDecorators` enabled — required for NestJS DI
- **Prettier:** single quotes, trailing commas everywhere
- **ESLint:** `no-explicit-any` allowed; `no-floating-promises` and `no-unsafe-argument` are warnings, but `npm run lint` runs with `--max-warnings 0`, so any warning fails the Definition of Done
- **ESLint in test files** (`*.spec.ts`, `*.integration-spec.ts`, `*.e2e-spec.ts`): the `no-unsafe-*` rules are off (supertest types `res.body` as `any`; specs build partial mocks) and `@typescript-eslint/unbound-method` is replaced by `jest/unbound-method`, which allows `expect(obj.method)`. Shared helpers (`test/support/`, `src/test/`) are not covered by this override and keep the full rule set

## REST Conventions

This is a RESTful API. All endpoints must follow standard REST conventions — correct HTTP methods, proper status codes, plural resource nouns, and consistent URL structure. Details are enforced via rules on controller files.
