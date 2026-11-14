# phase-03-videos — Progress

**Status:** completed
**SIs:** 10/10 completed

### SI-03.1 — Infra: Redis, MinIO e contrato de ambiente
- **Status:** completed
- **Tests:** 12/12 passing (env.validation.integration-spec.ts)
- **Observations:**
  - Libs instaladas: `bullmq` ^6.7.6, `@nestjs/bullmq` ^12.0.1, `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` ^3.1168.0 — mesmos majors de `library-refs.md`.
  - `minio/minio` e `quay.io/minio/minio` não estão mais disponíveis nos registries; usado o fork comunitário `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` + `pgsty/mc:RELEASE.2026-11-12T00-00-00Z` (tags fixas), conforme TD-07 ("pinned tag or S3-compatible image").
  - `redis` sem porta publicada no host: a 6379 do host já estava ocupada por outro container fora do projeto; a API e o worker usam a rede do Compose (`redis:6379`).
  - CORS do MinIO via `MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:3001` (porta do `next-frontend`); MinIO expõe `ETag` por padrão.
  - Credenciais do MinIO (`MINIO_ROOT_USER/PASSWORD`) e o bucket do `minio-init` vêm de `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET` do `.env` (interpolação do Compose).

### SI-03.3 — Criar entidade Video, migração e identificador público
- **Status:** completed
- **Tests:** 34/34 passing (video.entity.integration-spec.ts, public-id.util.spec.ts + 6 suítes existentes que passaram a incluir `Video` na lista de entidades); e2e existente 52/52 passing
- **Observations:**
  - Migração gerada via CLI: `src/database/migrations/1794571199100-CreateVideos.ts`; validada com `migration:run` → `migration:revert` (tabela e os dois enums removidos) → `migration:run`.
  - O `@OneToMany` inverso em `Channel` obriga `Video` a estar no metadata de todo DataSource que carrega `Channel`: `Video` foi adicionado ao `ALL_ENTITIES` das 10 suítes existentes, `cleanAllTables` passou a apagar `videos` antes de `channels`, e um `VideosModule` mínimo (só `TypeOrmModule.forFeature([Video])`) foi criado e registrado no `AppModule` já neste SI — o SI-03.5 o estende.
  - `size_bytes` (bigint) usa transformer string→number; seguro porque o valor é limitado por `VIDEO_MAX_SIZE_BYTES`.
  - Resolvido (PR #2, commit `39b84a6`): `src/database/migrations.integration-spec.ts` agora registra as 3 migrations (incluindo `CreateVideos1794571199100`) e limpa a tabela `videos` e os enums `videos_processing_status_enum` / `videos_editorial_status_enum`; passa isoladamente (3/3) e na suíte completa.
  - Fora de escopo: `npm run test:e2e` (`jest --config ./test/jest-e2e.json`) não usa `--runInBand`, embora o `nestjs-project/CLAUDE.md` diga que já está configurado — as suítes e2e rodaram em workers paralelos.

### SI-03.7 — Implementar extração de metadados e thumbnail com FFmpeg
- **Status:** completed
- **Tests:** 9/9 passing (media-probe.service.integration-spec.ts, media-probe.service.spec.ts, thumbnail.service.integration-spec.ts)
- **Observations:**
  - `ffmpeg` 5.1.9 (Debian bookworm) instalado em `Dockerfile.dev`; imagem do `nestjs-api` reconstruída.
  - Fixtures: `test/fixtures/sample.mp4` (14 KB, 2 s, 160x120, h264 + aac, gerada com `testsrc`/`sine`) e `test/fixtures/not-a-video.mp4` (texto).
  - `spawn` encapsulado em `src/media/run-process.ts` (sem shell, timeout com `SIGKILL`), compartilhado pelos dois serviços; erros `MediaProcessError` / `MediaTimeoutError` em `src/media/media.errors.ts` e timeouts padrão em `media.constants.ts`.
  - Para `not-a-video.mp4` o `ffprobe` sai com código 1 ("Invalid data found"), então `probe` rejeita com `MediaProcessError` em vez de devolver `has_video_stream: false`; o SI-03.8 precisa tratar essa rejeição como `not_a_video`.

### SI-03.2 — Implementar StorageModule sobre S3/MinIO
- **Status:** completed
- **Tests:** 8/8 passing (storage.module.spec.ts, storage.service.integration-spec.ts — MinIO real)
- **Observations:**
  - Os dois `S3Client` usam `requestChecksumCalculation`/`responseChecksumValidation: 'WHEN_REQUIRED'` (confirmado no context7): desde a v3.729 o SDK embute checksum CRC32 por padrão, o que entraria nas URLs assinadas de `UploadPart` e obrigaria o navegador a enviá-lo.
  - Helpers de chave em `src/storage/storage.keys.ts`; `presignUploadPart` também aceita `endpoint: 'internal'`, usado só pelos testes (URL pública não é alcançável de dentro do container).
  - `src/test/minio.ts`: `createStorageTestingModule`, `MinioTestBucket` (prefixo `test/<uuid>/` por suíte + `track(prefix)` + `cleanup()`) e `uploadPartInternally`.
  - Testing guide corrigido: `references/external-systems.md` (seções de storage e fila), linha "Service with side-effect dep" e "Worth testing" do `SKILL.md` §2/§3 e as duas menções a "local adapter" em `artifacts/services.md` — esta última além do que o SI lista, para o guia não se contradizer.
  - O guia já cita `src/test/redis.ts`, criado no SI-03.4.

### SI-03.4 — Configurar fila BullMQ e produtor de processamento
- **Status:** completed
- **Tests:** 5/5 passing (queue.module.spec.ts, video-processing.producer.integration-spec.ts — Redis real)
- **Observations:**
  - **Divergência de versão vs `library-refs.md`:** `@nestjs/bullmq` 12.0.1 é publicado só como ESM (`"type": "module"`) e não carrega no Jest/ts-jest (CommonJS). Fixado em `^11.0.5`, a última 11.x, que é CommonJS e já declara peer `bullmq ^6.0.0`; a API usada (`forRootAsync`, `registerQueue(Async)`, `@InjectQueue`, `@Processor`/`WorkerHost`) é a mesma. `library-refs.md` não foi editado para não invalidar o `sources_mtime` do plano.
  - `bullmq` 6 tornou `ioredis` peer opcional: adicionado `ioredis ^5.11.1` como dependência direta.
  - `QueueModule` = conexão raiz (`BullModule.forRootAsync`) + `registerProducerQueue(name)` (API: conexão com `enableOfflineQueue: false`, recomendado pelo BullMQ para produtores em rotas HTTP) e `registerConsumerQueue(name)` (worker: conexão raiz, que espera reconexão). `defaultJobOptions` de `video-processing` em `queue.constants.ts`.
  - Limitação do BullMQ (documentada): se o Redis já estiver fora quando a fila é criada, `add` espera a primeira conexão indefinidamente; a falha rápida vale depois que a conexão foi estabelecida. No Compose a API só sobe com `redis` saudável, então o teste do critério "Redis parado" derruba a conexão de uma fila já conectada (`waitUntilReady` + `disconnect`) e verifica a rejeição em < 1 s.
  - `src/test/redis.ts`: `createTestQueuePrefix()` e `obliterateQueues()`; os testes usam `BullModule.forRoot({ connection, prefix })` + `QueueModule.registerProducerQueue`.

### SI-03.5 — Endpoints de upload multipart com pré-cadastro em rascunho
- **Status:** completed
- **Tests:** 27/27 passing (videos.service.spec.ts 19, videos.service.integration-spec.ts, videos.module.spec.ts, channels.service.integration-spec.ts); e2e 9/9 passing (test/videos-upload.e2e-spec.ts, derivado de `specs/videos-upload.plan.md`)
- **Observations:**
  - Transições de status usam `UPDATE ... WHERE processing_status = 'uploading'` e conferem `affected`, para que um complete/abort concorrente vire `UPLOAD_NOT_IN_PROGRESS` em vez de sobrescrever o estado.
  - O multipart é criado antes do INSERT; se o INSERT falhar (inclusive após as 5 tentativas de `public_id`), o upload é abortado no storage (compensação).
  - `file_too_large` e `enqueue_failed` não preenchem `processed_at` (o Data Model o reserva para o fim do processamento); só o SI-03.9 o define para `upload_abandoned`, como o plano pede.
  - Erros de part list do S3 mapeados para `UPLOAD_INCOMPLETE`: `InvalidPart`, `InvalidPartOrder`, `EntityTooSmall` (`videos.constants.ts`).
  - Response DTOs (`VideoResponse` etc.) já têm `@ApiProperty`, como exige `nestjs-dtos.md`; os decorators de operação do controller (`@ApiTags`, `@ApiResponse`…) ficam para o SI-03.10, conforme o plano — `nestjs-controllers.md` considera o controller incompleto até lá.
  - Helpers de teste novos: `src/test/video-app-config.ts` (part size de 5 MiB + override do token de config compartilhada do BullMQ para prefixo por suíte) e `test/support/video-e2e.ts` (bootstrap igual ao `main.ts`, throttler, register→confirm→login).
  - Cenário 3.2 da spec lê o status via `GET /videos/:publicId`, que só existe no SI-03.6; por ora o teste confere a linha no banco — trocar pelo GET no SI-03.6.
  - Fix loop (1 tentativa): o teste de controle de acesso criava as requisições supertest antes de aguardá-las; cada uma abre um servidor efêmero que já estava fechado quando era enviada (`ECONNREFUSED`). Passou a criar cada requisição dentro do loop.

### SI-03.6 — Endpoints de consulta, streaming e download
- **Status:** completed
- **Tests:** 27 unit (videos.service.spec.ts) + 4 integration (videos.service.integration-spec.ts) + 1 module passing; e2e videos-delivery 5/5 + videos-upload 9/9 passing
- **Observations:**
  - `thumbnail_url` is presigned (public endpoint, TTL `VIDEO_DELIVERY_URL_TTL_SECONDS`) by a private `toResponse` in `VideosService`, used by `findOwned` and `completeUpload`; `initiateUpload` keeps `null` (no thumbnail can exist yet).
  - The delivery integration suite overrides the `storage` config provider so `publicEndpoint = endpoint` (`http://minio:9000`): the public URL is unreachable from the container, and this lets the test fetch the exact URL the service returns (206 + `Content-Range` for `Range: bytes=0-1023`; `Content-Disposition: attachment; filename="aula final.mp4"` on download). Setting `process.env` before compile does not work because `.env` is only loaded by `ConfigModule.forRoot`.
  - E2E scenario 3.2 of `videos-upload` now reads the status via `GET /videos/:publicId`, as the spec states (pending item from SI-03.5 closed).
  - Controller OpenAPI decorators for the 3 new routes remain for SI-03.10, like the upload routes; `DeliveryUrlResponse` already has `@ApiProperty`.
  - No fix-loop attempts.

### SI-03.8 — Implementar worker de processamento de vídeo
- **Status:** completed
- **Tests:** 8 unit (video-processing.processor.spec.ts) + 3 integration (video-processing.processor.integration-spec.ts, real PostgreSQL + MinIO + ffmpeg) + 1 module (worker.module.spec.ts) passing; videos.module.spec.ts still passing
- **Observations:**
  - context7 confirmed: `UnrecoverableError` moves the job to failed without retries; BullMQ retries while `attemptsMade + 1 < attempts` (`job.js` in bullmq 6.7.6), so the last attempt is detected inside `process()` as `attemptsMade + 1 >= attempts` and the video is marked `failed/processing_error` before rethrowing (deterministic, no async `failed` event handler). `@Processor(name, { concurrency: 1 })` passes worker options (closes the gap recorded in library-refs.md).
  - `not_a_video` covers both "no video stream" and an ffprobe `MediaProcessError` whose stderr contains "Invalid data found when processing input"; other probe errors (e.g. MinIO 403/connection) stay retryable, so a storage hiccup does not permanently fail the video.
  - Every status write in the processor is conditional on `processing_status = processing`, and a re-delivered job for a non-`processing` video is a logged no-op (idempotency AC).
  - `WorkerModule` registers entities `[Video, Channel, User]` explicitly (Video's relation chain) instead of `autoLoadEntities`; only the worker registers the processor, so the API has no consumer.
  - **Out-of-plan addition:** `nest-cli.json` has `deleteOutDir: true`, so two `nest start --watch` processes on the shared volume would delete each other's `dist/`. `start:worker:dev` builds with `tsconfig.worker.json` (outDir `dist-worker`); `dist-worker` was added to `.gitignore`, `tsconfig.build.json` and the root `tsconfig.json` excludes. `start:worker` (prod) runs `dist/worker/main` from the normal build. Build layout verified (`dist-worker/worker/main.js`).
  - The `video-worker` container was **not started** (nestjs-project/CLAUDE.md: never start app processes unless asked). The runtime ACs (`docker compose ps`, end-to-end upload → `ready`, clean `docker compose stop video-worker`) remain to be checked manually or in final verification.
  - No fix-loop attempts.
### SI-03.9 — Implementar limpeza agendada de uploads abandonados
- **Status:** completed
- **Tests:** 3 integration (upload-cleanup.service.integration-spec.ts, real PostgreSQL + MinIO) + 1 integration (worker-scheduler.integration-spec.ts, real Redis) passing; worker.module.spec.ts still passing
- **Observations:**
  - The `onApplicationBootstrap` upsert lives in a dedicated `MaintenanceScheduler` provider (`src/worker/maintenance-scheduler.ts`) registered only in `WorkerModule`, so scheduling stays out of the processors and the API.
  - `sweep(now)` updates conditionally on `processing_status = uploading` (a video completed/aborted concurrently is left alone) and isolates per-video failures: `NoSuchUpload` is ignored, any other error is logged and the video is retried on the next hourly run, without stopping the sweep.
  - `UploadCleanupService` and `UploadCleanupProcessor` live in `src/videos/` (per plan) but are provided only by `WorkerModule`.
  - No fix-loop attempts.
### SI-03.10 — Documentar API de vídeos e ambiente
- **Status:** completed
- **Tests:** 10/10 passing (openapi-export.integration-spec.ts, incl. the new 8-endpoint `/videos` check); swagger.e2e-spec.ts 6/6 still passing
- **Observations:**
  - The plan names the envelope `ApiErrorEnvelopeDto`; the existing class is `ApiErrorEnvelope` (`src/common/openapi/api-error-envelope.dto.ts`), used as-is. A local `ApiError(status, description)` helper wraps `@ApiResponse` with the envelope `$ref`; the 401 and `@ApiBearerAuth('access-token')` are declared once at class level.
  - `openapi.json` regenerated with `npm run openapi:export` (+845 lines); a second export produced no diff. **Not committed** (commits only on request).
  - **Out-of-scope (pre-existing):** request DTO schemas in `openapi.json` have empty `properties` — e.g. `CreateVideoDto`, and also the existing `LoginDto`/`RegisterDto` from phase 02 — because `openapi:export` runs through ts-node without the `@nestjs/swagger` CLI plugin (`src/metadata.ts` is a stub). `/api/docs` served by the compiled app is unaffected. Separate task.
  - `nestjs-project/CLAUDE.md`: services list (`video-worker`, `redis`, `minio`, `minio-init`, `mailpit`), readiness checks (`redis-cli ping`, MinIO healthcheck / `minio-init` exit), MinIO console on 9001, worker scripts and the infra-only startup command. The root `CLAUDE.md` (Message Queue "TBD") stays for the fechamento step, as agreed.
  - No fix-loop attempts.

## DoD técnica — verificação final (2026-11-14, task `phase-03-dod-closure`)

Executada no container `nestjs-api`, após PR #2 (migrations spec) e PR #5 (`lint-baseline`):

- `npm test -- --runInBand`: 40/40 suítes, 233/233 testes passando (inclui `src/database/migrations.integration-spec.ts`)
- `npm run test:e2e`: 5/5 suítes, 66/66 testes passando (inclui `test/videos-upload.e2e-spec.ts` e `test/videos-delivery.e2e-spec.ts`)
- `npx tsc --noEmit`: exit 0
- `npx eslint "{src,apps,libs,test}/**/*.ts" --max-warnings 0`: exit 0, sem erros nem warnings
