---
kind: phase
name: phase-03-videos
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-11-12T12:51:32-03:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-11-12T12:51:21-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-12T12:49:46-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-11-11T08:00:03-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Deliver the backend foundation for videos — object storage for videos and thumbnails, a background processing queue with a dedicated FFmpeg worker, direct-to-storage multipart upload of files up to 10GB with automatic draft pre-registration, automatic metadata extraction and thumbnail generation, a unique short URL per video, and owner-only streaming and download — so that "upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas" hold end to end.

---

## Step Implementations

### SI-03.1 — Infra: Redis, MinIO e contrato de ambiente

**Description:** Sobe os serviços de fila e de armazenamento no Compose e fixa o contrato de variáveis de ambiente (Joi + `.env.example` + configs namespaced) que todos os SIs seguintes consomem.

**Technical actions:**

1. Instalar no container `bullmq`, `@nestjs/bullmq`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (`docker compose exec nestjs-api npm install ...`) e registrar as versões instaladas em `package.json`; reconferir `docs/phases/phase-03-videos/library-refs.md` se algum major divergir (per `phase-03-videos/TD-01`, `phase-03-videos/TD-02`)
2. Adicionar a `nestjs-project/compose.yaml` os serviços `redis` (imagem com tag fixa, `--maxmemory-policy noeviction`, healthcheck `redis-cli ping`) e `minio` (imagem com tag fixa — a edição comunitária não publica mais imagens oficiais, portanto nunca `latest`; portas 9000/9001; healthcheck) + serviço one-shot `minio-init` com `mc` em tag fixa criando o bucket `S3_BUCKET` com `--ignore-existing`; CORS do MinIO liberando a origem do frontend e expondo `ETag`; `nestjs-api` passa a depender de `redis` e `minio` saudáveis (per `phase-03-videos/TD-01`, `phase-03-videos/TD-07`)
3. Estender `src/config/env.validation.ts` com `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` (per `phase-03-videos/TD-07`), `REDIS_HOST` (default `redis`), `REDIS_PORT` (default 6379), `VIDEO_MAX_SIZE_BYTES` (default 10737418240), `VIDEO_PART_SIZE_BYTES` (default 67108864, mínimo 5242880), `VIDEO_ALLOWED_MIME_TYPES` (default `video/mp4,video/webm,video/quicktime,video/x-matroska`), `VIDEO_UPLOAD_URL_TTL_SECONDS` (default 3600), `VIDEO_DELIVERY_URL_TTL_SECONDS` (default 900), `VIDEO_UPLOAD_ABANDON_AFTER_HOURS` (default 24) (per `phase-03-videos/TD-08`)
4. Atualizar `.env.example` e `.env` com os valores de desenvolvimento — `S3_ENDPOINT=http://minio:9000` (nome do serviço Compose, nunca `localhost`), `S3_PUBLIC_ENDPOINT=http://localhost:9000` (usado só para assinar URLs que o navegador do host consome), `REDIS_HOST=redis` (per `phase-03-videos/TD-07`)
5. Criar `src/config/storage.config.ts`, `src/config/queue.config.ts` e `src/config/video.config.ts` com `registerAs` (parse de inteiros, booleano de `S3_FORCE_PATH_STYLE`, lista de MIME types) e carregá-los em `ConfigModule.forRoot({ load })` do `AppModule` (per `phase-01-configuracao-base/TD-01`, `phase-01-configuracao-base/TD-03`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `envValidationSchema` | Integration: novas chaves obrigatórias rejeitadas quando ausentes; defaults aplicados | `src/config/env.validation.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose ps` mostra `redis` e `minio` como `running (healthy)` e `minio-init` encerrado com código 0
- `docker compose exec redis redis-cli ping` responde `PONG`
- O bucket `S3_BUCKET` existe no MinIO após `docker compose up -d`, e um segundo `up` não falha por bucket já existente
- A aplicação recusa iniciar sem `S3_BUCKET` definido, citando a variável na mensagem de validação
- Sem as variáveis `VIDEO_*` no ambiente, os limites efetivos são 10 GiB, 64 MiB por parte, os 4 MIME types da allowlist e expiração de 24h

---

### SI-03.2 — Implementar StorageModule sobre S3/MinIO

**Description:** Entrega o serviço de armazenamento de arquivos (vídeos e thumbnails) com os dois clientes S3 — interno para operações, público só para assinar URLs — e corrige o guia de testes para storage real.

**Technical actions:**

1. Criar `src/storage/storage.module.ts` com dois providers `S3Client` (tokens `S3_INTERNAL_CLIENT` e `S3_PUBLIC_CLIENT`) construídos de `storageConfig` com `forcePathStyle`, `region` e `credentials`; o público usa `S3_PUBLIC_ENDPOINT` e nunca executa operações, só `getSignedUrl` (per `phase-03-videos/TD-07`)
2. Criar `src/storage/storage.service.ts` com `createMultipartUpload`, `presignUploadPart`, `listParts`, `completeMultipartUpload`, `abortMultipartUpload`, `headObject`, `putObject`, `deletePrefix` e `presignGetObject(key, { expiresIn, downloadFilename?, endpoint: 'public' | 'internal' })` — `downloadFilename` vira `ResponseContentDisposition: attachment; filename="..."`; chaves `videos/{id}/original` e `thumbnails/{id}/default.jpg` montadas por helpers puros (per `phase-03-videos/TD-02`, `phase-03-videos/TD-05`, `phase-03-videos/TD-07`)
3. Criar `src/test/minio.ts` — helper de testes que gera um prefixo de chaves por suíte e o esvazia em `afterAll` via `deletePrefix`, usando o bucket real do Compose (per `phase-03-videos/TD-09`)
4. Corrigir `.claude/skills/testing-guide-nestjs-project/references/external-systems.md` e a linha "Service with side-effect dep (email, storage)" de `SKILL.md` §3: storage = MinIO real do Compose com isolamento por prefixo, sem adapter de filesystem; fila = Redis real com prefixo BullMQ por suíte (per `phase-03-videos/TD-09`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `StorageModule` | Unit: compilation test | `src/storage/storage.module.spec.ts` |
| `StorageService` | Integration (MinIO real): multipart completo (create → upload de 2 partes via URL assinada com o endpoint interno → complete → head), `listParts`, abort, presign de GET com `Range` retornando `206`, `Content-Disposition` de download, URL pública com host de `S3_PUBLIC_ENDPOINT`, `deletePrefix` | `src/storage/storage.service.integration-spec.ts` |

**Dependencies:** SI-03.1 — serviço `minio`, bucket e `storageConfig` precisam existir

**Acceptance criteria:**

- Um upload multipart de 2 partes feito por URLs assinadas termina com um objeto cujo `ContentLength` é a soma das partes
- Uma URL de `UploadPart` ou `GetObject` assinada para o navegador tem o host de `S3_PUBLIC_ENDPOINT`, nunca `minio:9000`
- Um `GET` com `Range: bytes=0-99` numa URL de streaming assinada retorna `206` com exatamente 100 bytes
- A URL de download assinada responde com `Content-Disposition: attachment; filename="<nome original>"`
- `abortMultipartUpload` faz `listParts` do mesmo `UploadId` falhar com `NoSuchUpload`
- `deletePrefix('videos/{id}/')` remove todos os objetos sob o prefixo e nenhum fora dele

---

### SI-03.3 — Criar entidade Video, migração e identificador público

**Description:** Modela o vídeo com os dois estados ortogonais e o `public_id` curto e único, base de toda a persistência da fase.

**Technical actions:**

1. Criar `src/videos/entities/video.entity.ts` exatamente com os campos, enums (`videos_processing_status_enum`, `videos_editorial_status_enum`), índices e relação de `### Data Model → Video`; adicionar `@OneToMany(() => Video)` inverso em `Channel` (per `phase-03-videos/TD-06`, `phase-03-videos/TD-04`)
2. Gerar a migração `CreateVideos` em `src/database/migrations/` (`npm run migration:generate`) e revisar o SQL: enums, FK para `channels`, índice único em `public_id`, índice em `channel_id` e índice composto (`processing_status`, `created_at`); `down` reverte tudo
3. Criar `src/videos/public-id.util.ts` — `generatePublicId()` com `crypto.randomBytes` codificado em base64url e cortado em 11 caracteres; sem dependência nova (per `phase-03-videos/TD-04`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Video` | Integration: unicidade de `public_id`, defaults `uploading`/`draft`, FK para `channels`, `size_bytes` bigint acima de 2^32 | `src/videos/entities/video.entity.integration-spec.ts` |
| `generatePublicId` | Unit: 11 caracteres no alfabeto `[A-Za-z0-9_-]`, valores distintos em chamadas sucessivas | `src/videos/public-id.util.spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `npm run migration:run` cria a tabela `videos`, e `migration:revert` a remove junto com os dois tipos enum
- Inserir dois vídeos com o mesmo `public_id` falha por violação de unicidade
- Um vídeo inserido só com os campos obrigatórios fica com `processing_status = 'uploading'` e `editorial_status = 'draft'`
- Inserir um vídeo com `channel_id` inexistente falha por violação de FK
- `size_bytes = 10737418240` é persistido e lido sem perda de precisão

---

### SI-03.4 — Configurar fila BullMQ e produtor de processamento

**Description:** Entrega o serviço de processamento em segundo plano do lado do produtor: conexão Redis, filas registradas e enfileiramento idempotente do job `process-video`.

**Technical actions:**

1. Criar `src/queue/queue.module.ts` com `BullModule.forRootAsync({ inject: [queueConfig.KEY], useFactory })` montando `connection: { host, port }` de `queueConfig`, e `src/queue/queue.constants.ts` com os nomes `video-processing`, `video-maintenance` e os jobs `process-video`, `cleanup-abandoned-uploads` (per `phase-03-videos/TD-01`)
2. Registrar a fila `video-processing` com `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: true, removeOnFail: 100 }` (per `### Events/Messages → video-processing`, `phase-03-videos/TD-06`)
3. Criar `src/videos/video-processing.producer.ts` — `enqueue(videoId)` faz `queue.add('process-video', { videoId }, { jobId: \`process-${videoId}\` })` via `@InjectQueue('video-processing')`; nenhum `@Processor` é registrado no módulo da API (per `phase-03-videos/TD-03`, `phase-03-videos/TD-06`)
4. Criar `src/test/redis.ts` — helper que define um `prefix` BullMQ único por suíte e faz `queue.obliterate({ force: true })` + `close()` em `afterAll` (per `phase-03-videos/TD-09`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `QueueModule` | Unit: compilation test | `src/queue/queue.module.spec.ts` |
| `VideoProcessingProducer` | Integration (Redis real): job criado com `jobId` determinístico e payload `{ videoId }`; segundo `enqueue` do mesmo vídeo não cria job novo; opções de retry aplicadas | `src/videos/video-processing.producer.integration-spec.ts` |

**Dependencies:** SI-03.1 — serviço `redis` e `queueConfig` precisam existir

**Acceptance criteria:**

- `enqueue(videoId)` deixa na fila `video-processing` um job `process-video` com id `process-{videoId}` e payload `{ "videoId": "<uuid>" }`
- Chamar `enqueue` duas vezes para o mesmo vídeo enquanto o job existe resulta em um único job na fila
- O job criado carrega `attempts: 3` e backoff exponencial de 10000 ms
- Com o Redis parado, `enqueue` rejeita com erro em vez de ficar pendurado indefinidamente

---

### SI-03.5 — Endpoints de upload multipart com pré-cadastro em rascunho

**Route:** POST /videos, POST /videos/:publicId/upload/part-urls, GET /videos/:publicId/upload/parts, POST /videos/:publicId/upload/complete, DELETE /videos/:publicId/upload
**Test Specs:** see `nestjs-project/specs/videos-upload.plan.md`
**Authorization:** Authenticated (criação no próprio canal); Owner nas rotas com `:publicId` — per `### Authorization Matrix`

**Description:** Entrega o upload de até 10GB direto para o storage e o pré-cadastro automático do vídeo como rascunho ao iniciar o upload, disparando o processamento ao concluir.

**Technical actions:**

1. Adicionar `ChannelsService.findByUserId(userId)` e exportar `ChannelsService` de `ChannelsModule`, para que o módulo de vídeos resolva o canal do dono sem acessar o repositório de outro domínio
2. Criar `src/videos/videos.exceptions.ts` com `VideoNotFoundException`, `VideoTooLargeException`, `UnsupportedVideoTypeException`, `UploadNotInProgressException`, `InvalidPartNumberException`, `UploadIncompleteException`, `ProcessingEnqueueFailedException` — `errorCode` e HTTP exatamente como em `### Error Catalog` — e os DTOs `CreateVideoDto`, `PartUrlsDto`, `CompleteUploadDto` + `VideoResponse` mapper conforme `### API Contracts` e `#### Validation Rules — videos` (per `phase-02-auth/TD-06`, `phase-02-auth/TD-07`)
3. Criar `src/videos/videos.service.ts` com `initiateUpload` (allowlist + limite → `generatePublicId` com retry limitado em violação de unicidade → `createMultipartUpload` → grava `upload_id`), `issuePartUrls`, `listUploadedParts`, `completeUpload` (`completeMultipartUpload` → `headObject` → acima do limite: `deletePrefix` + `failed`/`file_too_large`; senão commit `processing` + `uploaded_at` + `size_bytes` real, **depois** `VideoProcessingProducer.enqueue`; falha de enqueue → `failed`/`enqueue_failed`) e `abortUpload` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-04`, `phase-03-videos/TD-06`, `phase-03-videos/TD-08`)
4. Criar `src/videos/videos.controller.ts` com as cinco rotas de `### API Contracts` (status `201`, `200`, `200`, `200`, `204`), `@CurrentUser()` para o `sub` e busca por `publicId` restrita ao dono (não dono → `VIDEO_NOT_FOUND`)
5. Criar `src/videos/videos.module.ts` (`TypeOrmModule.forFeature([Video])`, `StorageModule`, `QueueModule` + `registerQueue('video-processing')`, `ChannelsModule`) e registrá-lo no `AppModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` (upload) | Unit: ramos de allowlist/limite, retry de `public_id` em colisão, `file_too_large`, `enqueue_failed`, `UPLOAD_NOT_IN_PROGRESS`, `INVALID_PART_NUMBER` (storage, producer e repo mockados) | `src/videos/videos.service.spec.ts` |
| `VideosService` (upload) | Integration (PostgreSQL + MinIO + Redis reais): fluxo init → partes → complete gravando `processing` e job enfileirado; abort deixando `failed`/`upload_aborted` | `src/videos/videos.service.integration-spec.ts` |
| `VideosModule` | Unit: compilation test | `src/videos/videos.module.spec.ts` |
| `ChannelsService.findByUserId` | Integration: retorna o canal do usuário e `null` para usuário sem canal | `src/channels/channels.service.integration-spec.ts` |

**Dependencies:** SI-03.2 — StorageService; SI-03.3 — entidade e `generatePublicId`; SI-03.4 — produtor da fila

**Acceptance criteria:**

- `POST /videos` com `{ filename: "aula.mp4", mime_type: "video/mp4", size_bytes: 104857600 }` retorna `201` com `video.public_id` de 11 caracteres, `video.processing_status: "uploading"`, `video.editorial_status: "draft"`, `video.title: "aula"`, `upload.part_size: 67108864` e `upload.part_count: 2`
- `POST /videos` com `size_bytes: 10737418241` retorna `413` com `error: "VIDEO_TOO_LARGE"`, e com `mime_type: "application/pdf"` retorna `415` com `error: "UNSUPPORTED_VIDEO_TYPE"`; nenhum vídeo é criado
- `POST /videos/:publicId/upload/part-urls` com `{ part_numbers: [1, 2] }` retorna `200` com duas URLs no host de `S3_PUBLIC_ENDPOINT` e `expires_in: 3600`; com `part_numbers: [3]` num upload de 2 partes retorna `400` com `error: "INVALID_PART_NUMBER"`
- Depois de enviar a parte 1, `GET /videos/:publicId/upload/parts` lista só `part_number: 1` com seu `etag`
- `POST /videos/:publicId/upload/complete` com todas as partes e ETags retorna `200` com `processing_status: "processing"` e `size_bytes` real, e a fila `video-processing` passa a ter o job `process-{id}`
- `POST /videos/:publicId/upload/complete` com um ETag errado retorna `400` com `error: "UPLOAD_INCOMPLETE"` e o vídeo continua `uploading`
- Com o Redis indisponível, `POST /videos/:publicId/upload/complete` retorna `503` com `error: "PROCESSING_ENQUEUE_FAILED"` e o vídeo fica `failed` com `failure_reason: "enqueue_failed"`
- `DELETE /videos/:publicId/upload` retorna `204` e o vídeo fica `failed` com `failure_reason: "upload_aborted"`; repetir a chamada retorna `409` com `error: "UPLOAD_NOT_IN_PROGRESS"`
- Qualquer rota com `:publicId` chamada por outro usuário autenticado retorna `404` com `error: "VIDEO_NOT_FOUND"`, e sem token retorna `401`

---

### SI-03.6 — Endpoints de consulta, streaming e download

**Route:** GET /videos/:publicId, GET /videos/:publicId/stream, GET /videos/:publicId/download
**Test Specs:** see `nestjs-project/specs/videos-delivery.plan.md`
**Authorization:** Owner — per `### Authorization Matrix` (somente o dono enquanto rascunho)

**Description:** Entrega a reprodução via streaming sem download completo e o download do vídeo pelo dono, por URLs assinadas de curta duração servidas direto pelo storage.

**Technical actions:**

1. Adicionar a `VideosService` `findOwned(publicId, userId)`, `getStreamUrl` e `getDownloadUrl` — ambos exigem `processing_status = 'ready'` (`VideoNotReadyException`, `409 VIDEO_NOT_READY`) e assinam `GetObject` de `videos/{id}/original` com o endpoint público e TTL `VIDEO_DELIVERY_URL_TTL_SECONDS`; o download passa `downloadFilename = original_filename` (per `phase-03-videos/TD-05` e sua revisão de 2026-11-12, `phase-03-videos/TD-07`)
2. Preencher `thumbnail_url` no mapper `VideoResponse` com `presignGetObject(thumbnail_key)` quando `thumbnail_key` existir, senão `null` (per `phase-03-videos/TD-05`, `phase-03-videos/TD-07`)
3. Adicionar as três rotas GET ao `VideosController`, respondendo `200` com `VideoResponse` ou `{ url, expires_in }` (JSON, não `302`, conforme `### API Contracts`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` (entrega) | Unit: `VIDEO_NOT_READY` para `uploading`/`processing`/`failed`, `thumbnail_url` nulo sem `thumbnail_key`, nome de arquivo do download | `src/videos/videos.service.spec.ts` |
| `VideosService` (entrega) | Integration (PostgreSQL + MinIO reais): URL de stream de um vídeo `ready` atende `Range` com `206`; URL de download traz `Content-Disposition: attachment` | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.5 — controller, módulo, exceções e mapper `VideoResponse`

**Acceptance criteria:**

- `GET /videos/:publicId` pelo dono retorna `200` com o `VideoResponse`, incluindo `processing_status` atual e `thumbnail_url: null` enquanto não houver thumbnail
- `GET /videos/:publicId/stream` de um vídeo `ready` retorna `200` com `url` no host de `S3_PUBLIC_ENDPOINT` e `expires_in: 900`
- Um `GET` com `Range: bytes=0-1023` na `url` de stream retorna `206` com `Content-Range` e 1024 bytes, sem baixar o arquivo inteiro
- `GET /videos/:publicId/download` retorna uma `url` cuja resposta traz `Content-Disposition: attachment; filename="<original_filename>"`
- `GET /videos/:publicId/stream` ou `/download` de um vídeo `processing` retorna `409` com `error: "VIDEO_NOT_READY"`
- As três rotas retornam `404` com `error: "VIDEO_NOT_FOUND"` para outro usuário autenticado e `401` sem token

---

### SI-03.7 — Implementar extração de metadados e thumbnail com FFmpeg

**Description:** Encapsula `ffprobe` e `ffmpeg` em serviços pequenos e testáveis, chamados por `child_process.spawn`, que o worker usa para extrair duração/metadados e gerar a thumbnail.

**Technical actions:**

1. Instalar `ffmpeg` em `nestjs-project/Dockerfile.dev` (`apt install -y ffmpeg`), já que os testes rodam no `nestjs-api` e o worker usa a mesma imagem (per `phase-03-videos/TD-03`, `phase-03-videos/TD-09`)
2. Criar `src/media/media-probe.service.ts` — `probe(source)` executa `ffprobe -v error -print_format json -show_format -show_streams <source>` por `spawn`, com timeout, falha em exit code ≠ 0 com o stderr, e devolve `{ duration_seconds, width, height, video_codec, audio_codec, format_name, has_video_stream }` (per `phase-03-videos/TD-03`)
3. Criar `src/media/thumbnail.service.ts` — `extractFrame(source, atSeconds)` executa `ffmpeg -ss <t> -i <source> -frames:v 1 -q:v 2 <tmp>.jpg` por `spawn`, com timeout, devolve o caminho do JPEG temporário e o apaga se falhar; `src/media/media.module.ts` exporta os dois (per `phase-03-videos/TD-03`)
4. Gerar e commitar `test/fixtures/sample.mp4` (poucos KB, ~2 s, com áudio, via `ffmpeg -f lavfi testsrc/sine`) e `test/fixtures/not-a-video.mp4` (bytes de texto com extensão de vídeo) (per `phase-03-videos/TD-09`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `MediaProbeService` | Integration (binário real): metadados da fixture; `has_video_stream: false`/erro para `not-a-video.mp4` | `src/media/media-probe.service.integration-spec.ts` |
| `MediaProbeService` | Unit: montagem de argumentos, timeout, exit code ≠ 0, JSON sem stream de vídeo (`spawn` mockado) | `src/media/media-probe.service.spec.ts` |
| `ThumbnailService` | Integration (binário real): JPEG válido extraído da fixture; arquivo temporário removido em falha | `src/media/thumbnail.service.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose exec nestjs-api ffprobe -version` e `ffmpeg -version` executam com sucesso após o rebuild da imagem
- `probe` na fixture `sample.mp4` retorna `duration_seconds` ≈ 2, `width`/`height` da fixture, `video_codec` e `audio_codec` preenchidos e `has_video_stream: true`
- `probe` em `not-a-video.mp4` resulta em erro ou `has_video_stream: false`, nunca em metadados inventados
- `extractFrame` na fixture produz um arquivo cujos primeiros bytes são a assinatura JPEG (`FF D8 FF`)
- Um processo que excede o timeout é encerrado e a chamada rejeita com erro de timeout

---

### SI-03.8 — Implementar worker de processamento de vídeo

**Description:** Entrega o processamento automático após o upload — duração, metadados e thumbnail — num container de worker dedicado, separado da API.

**Technical actions:**

1. Criar `src/videos/video-processing.processor.ts` — `@Processor('video-processing')` estendendo `WorkerHost`; `process(job)` ignora o vídeo se não estiver `processing`, assina GET interno de `videos/{id}/original`, chama `MediaProbeService.probe` (sem stream de vídeo → falha não-retentável, `failed`/`not_a_video`), `ThumbnailService.extractFrame` em `min(1, duration/2)` s, `putObject` em `thumbnails/{id}/default.jpg` e grava metadados, `thumbnail_key`, `ready` e `processed_at` (per `### Events/Messages → video-processing`, `phase-03-videos/TD-03`, `phase-03-videos/TD-06`, `phase-03-videos/TD-08`)
2. Tratar a falha definitiva: quando o job falha na última tentativa (`attemptsMade >= attempts`) ou de forma não-retentável, o vídeo vai para `failed`/`processing_error` (ou `not_a_video`) com `processed_at`; confirmar no context7 o mecanismo de erro não-retentável do BullMQ e como passar `concurrency: 1` pelo `@Processor` (lacuna registrada em `library-refs.md`) (per `phase-03-videos/TD-01`, `phase-03-videos/TD-06`)
3. Criar `src/worker/worker.module.ts` (Config, TypeORM, `StorageModule`, `MediaModule`, `QueueModule` + filas, processors) e `src/worker/main.ts` com `NestFactory.createApplicationContext(WorkerModule)` + `enableShutdownHooks()` para que `worker.close()` rode em SIGTERM; scripts `start:worker` e `start:worker:dev` no `package.json` (per `phase-03-videos/TD-03`)
4. Adicionar o serviço `video-worker` ao `compose.yaml` — mesma imagem/volume do `nestjs-api`, comando `npm run start:worker:dev`, sem porta HTTP, dependente de `db`, `redis` e `minio` saudáveis (per `phase-03-videos/TD-03`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoProcessingProcessor` | Integration (PostgreSQL + MinIO + ffmpeg reais, fixture enviada ao bucket): fixture válida → `ready` com metadados e thumbnail no storage; `not-a-video.mp4` → `failed`/`not_a_video`; vídeo que não está `processing` é ignorado | `src/videos/video-processing.processor.integration-spec.ts` |
| `VideoProcessingProcessor` | Unit: falha na última tentativa → `processing_error`; falha intermediária não altera o status (serviços mockados) | `src/videos/video-processing.processor.spec.ts` |
| `WorkerModule` | Unit: compilation test | `src/worker/worker.module.spec.ts` |

**Dependencies:** SI-03.4 — fila e constantes; SI-03.5 — fluxo que coloca o vídeo em `processing`; SI-03.7 — serviços de mídia

**Acceptance criteria:**

- `docker compose ps` mostra `video-worker` em execução, e `nestjs-api` não registra nenhum consumidor da fila `video-processing`
- Concluir o upload da fixture `sample.mp4` leva o vídeo a `processing_status: "ready"` com `duration_seconds`, `width`, `height` e `video_codec` preenchidos e `processed_at` definido
- Após o processamento, existe o objeto `thumbnails/{id}/default.jpg` no bucket e `GET /videos/:publicId` passa a trazer `thumbnail_url` não nulo
- Concluir o upload de `not-a-video.mp4` leva o vídeo a `failed` com `failure_reason: "not_a_video"` sem novas tentativas
- Um job que falha nas 3 tentativas deixa o vídeo `failed` com `failure_reason: "processing_error"`
- Reentregar o job de um vídeo já `ready` não altera a linha nem a thumbnail
- `docker compose stop video-worker` encerra o processo de forma limpa, sem deixar o job ativo travado em `stalled` além do intervalo padrão

---

### SI-03.9 — Implementar limpeza agendada de uploads abandonados

**Description:** Fecha a política de limites com o job horário que aborta uploads multipart parados há mais de 24h e marca os vídeos como falhos, mantendo banco e storage consistentes.

**Technical actions:**

1. Registrar a fila `video-maintenance` no `WorkerModule` e, no `onApplicationBootstrap` do worker, chamar `queue.upsertJobScheduler('cleanup-abandoned-uploads', { pattern: '0 * * * *' }, { name: 'cleanup-abandoned-uploads' })` (idempotente a cada boot) (per `### Events/Messages → video-maintenance`, `phase-03-videos/TD-08`)
2. Criar `src/videos/upload-cleanup.service.ts` — `sweep(now)` seleciona vídeos `uploading` com `created_at` anterior a `now - VIDEO_UPLOAD_ABANDON_AFTER_HOURS`, chama `abortMultipartUpload` ignorando `NoSuchUpload`, limpa `upload_id` e grava `failed`/`upload_abandoned` + `processed_at` (per `phase-03-videos/TD-08`)
3. Criar `src/videos/upload-cleanup.processor.ts` — `@Processor('video-maintenance')` estendendo `WorkerHost`, delegando o job `cleanup-abandoned-uploads` para `UploadCleanupService.sweep` (per `phase-03-videos/TD-01`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `UploadCleanupService` | Integration (PostgreSQL + MinIO reais): upload real iniciado com `created_at` retroativo é abortado e marcado; upload recente e vídeos `processing`/`ready` são ignorados; `NoSuchUpload` não interrompe a varredura | `src/videos/upload-cleanup.service.integration-spec.ts` |
| Agendador `cleanup-abandoned-uploads` | Integration (Redis real): após o bootstrap existe um único job scheduler com o padrão `0 * * * *`, mesmo após dois boots | `src/worker/worker-scheduler.integration-spec.ts` |

**Dependencies:** SI-03.8 — `WorkerModule` e entrypoint do worker

**Acceptance criteria:**

- Um vídeo `uploading` criado há mais de 24h fica `failed` com `failure_reason: "upload_abandoned"` e `upload_id` nulo após a varredura, e `listParts` do seu `UploadId` passa a falhar com `NoSuchUpload`
- Um vídeo `uploading` criado há menos de 24h e vídeos `processing`, `ready` ou `failed` não são alterados pela varredura
- Uma varredura sobre um vídeo cujo multipart já expirou no storage ainda o marca `failed`/`upload_abandoned`
- Reiniciar o `video-worker` não duplica o agendamento: a fila `video-maintenance` mantém um único scheduler `cleanup-abandoned-uploads`

---

### SI-03.10 — Documentar API de vídeos e ambiente

**Description:** Mantém o contrato OpenAPI exportado e a documentação de ambiente em dia com os endpoints, serviços Compose e o worker introduzidos na fase.

**Technical actions:**

1. Decorar `VideosController` com `@ApiTags('videos')`, `@ApiBearerAuth()`, `@ApiOperation` por rota, `@ApiResponse` por status de `### API Contracts` usando o envelope `ApiErrorEnvelopeDto` para os erros de `### Error Catalog`, e `@ApiParam('publicId')` (per `openapi-docs-nestjs/TD-01` e sua revisão de 2026-05-12)
2. Regenerar e commitar `nestjs-project/openapi.json` com `npm run openapi:export` (per `openapi-docs-nestjs/TD-02`)
3. Atualizar `nestjs-project/CLAUDE.md` — lista de serviços (`redis`, `minio`, `minio-init`, `video-worker`), checagens de prontidão (`redis-cli ping`, healthcheck do MinIO), console do MinIO na porta 9001 e o comando do worker

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `exportSpec` | Integration: o documento gerado contém os 8 endpoints de `/videos`, cada um com `summary` não vazio, requisito de segurança `access-token` e resposta 401 referenciando `ApiErrorEnvelope` | `src/openapi-export.integration-spec.ts` |

**Dependencies:** SI-03.5, SI-03.6 — rotas de vídeo existentes; SI-03.8 — serviço `video-worker` a documentar

**Acceptance criteria:**

- Com `SWAGGER_ENABLED=true`, `/api/docs` lista os 8 endpoints sob a tag `videos`, cada um com seus status de sucesso e de erro
- As respostas de erro de `/videos` no `openapi.json` referenciam o schema do envelope `{ statusCode, error, message }`
- `npm run openapi:export` não produz diff em `openapi.json` após o commit
- `nestjs-project/CLAUDE.md` descreve como verificar a prontidão de `redis` e `minio` e como subir o `video-worker`

---

## Technical Specifications

### Data Model

#### Video

Table `videos`. Processing state and editorial state are two orthogonal columns *(per phase-03-videos/TD-06)*; Fase 03 only ever writes `editorial_status = 'draft'` — Fase 04 extends the enum with publication/visibility values.

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, generated (`uuid_generate_v4()`) — internal key, never exposed in routes; keys storage objects *(per phase-03-videos/TD-07)* |
| public_id | varchar(11) | unique, not null — random URL-safe 11-char ID from `crypto.randomBytes`, regenerated on unique violation (bounded retry) *(per phase-03-videos/TD-04)* |
| channel_id | uuid | FK → `channels.id`, not null — owner is `channels.user_id` |
| title | varchar(100) | not null — defaults to the original filename without extension at pre-registration; editable in Fase 04 |
| original_filename | varchar(255) | not null — used for the download `Content-Disposition` filename |
| mime_type | varchar(100) | not null — declared at init, must be in the allowlist *(per phase-03-videos/TD-08)* |
| size_bytes | bigint | not null — declared size at init, replaced by the real object size (`HeadObject.ContentLength`) at completion |
| processing_status | enum `videos_processing_status_enum` (`uploading`, `processing`, `ready`, `failed`) | not null, default `uploading` *(per phase-03-videos/TD-06)* |
| editorial_status | enum `videos_editorial_status_enum` (`draft`) | not null, default `draft` *(per phase-03-videos/TD-06)* |
| upload_id | varchar(255) | nullable — S3 multipart `UploadId`; set at init, cleared after complete/abort *(per phase-03-videos/TD-02)* |
| storage_key | varchar(255) | not null — `videos/{id}/original` |
| thumbnail_key | varchar(255) | nullable — `thumbnails/{id}/default.jpg`, set by the worker |
| duration_seconds | double precision | nullable — from `ffprobe` `format.duration` |
| width | integer | nullable — first video stream |
| height | integer | nullable — first video stream |
| video_codec | varchar(50) | nullable — first video stream `codec_name` |
| audio_codec | varchar(50) | nullable — first audio stream `codec_name` (null when there is no audio) |
| format_name | varchar(100) | nullable — `ffprobe` `format.format_name` |
| failure_reason | varchar(255) | nullable — machine-readable reason when `processing_status = 'failed'` (`upload_aborted`, `upload_abandoned`, `file_too_large`, `enqueue_failed`, `not_a_video`, `processing_error`) |
| uploaded_at | timestamp | nullable — set when the multipart upload completes |
| processed_at | timestamp | nullable — set when processing reaches `ready` or `failed` |
| created_at | timestamp | default now() |
| updated_at | timestamp | default now(), auto-updated |

**Relations:** `Channel` has many `Video` (one-to-many, `videos.channel_id`); `Video` many-to-one `Channel`.
**Indexes:** unique on `public_id`; index on `channel_id`; index on (`processing_status`, `created_at`) for the abandoned-upload sweep *(per phase-03-videos/TD-08)*.
**Storage keys:** one private bucket (`S3_BUCKET`), prefixes keyed by the internal `id` — `videos/{id}/original` and `thumbnails/{id}/default.jpg`; per-video deletion is by prefix *(per phase-03-videos/TD-07)*.
**Migration:** `CreateVideos` (TypeORM migration in `src/database/migrations/`, same style as `CreateAuthTokens`).

### API Contracts

All endpoints require `Authorization: Bearer <access_token>` (global `JwtAuthGuard`, no `@Public()`). Paths address a video by its `public_id` *(per phase-03-videos/TD-04)*; the internal `id` never appears in the API. Field names are snake_case, matching the existing auth responses. Error bodies use the inherited envelope `{ statusCode, error, message }` *(per phase-02-auth/TD-07)*. A video owned by another user answers `404 VIDEO_NOT_FOUND` (existence is not leaked).

**`VideoResponse`** (shared response shape):
- public_id: string (11 chars)
- title: string
- original_filename: string
- mime_type: string
- size_bytes: number
- processing_status: `uploading` | `processing` | `ready` | `failed`
- editorial_status: `draft`
- duration_seconds: number | null
- width: number | null
- height: number | null
- video_codec: string | null
- audio_codec: string | null
- format_name: string | null
- thumbnail_url: string | null — short-lived presigned GET (public endpoint) when `thumbnail_key` is set, else null *(per phase-03-videos/TD-05, phase-03-videos/TD-07)*
- failure_reason: string | null
- created_at: string (ISO-8601)
- updated_at: string (ISO-8601)

#### POST /videos (SI-03.5)

Pre-registers the video as a draft and initiates the multipart upload *(per phase-03-videos/TD-02, phase-03-videos/TD-06, phase-03-videos/TD-08)*.

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer <access_token>

**Request body:**
- filename: string, required — 1–255 characters
- mime_type: string, required — must be in `VIDEO_ALLOWED_MIME_TYPES` (default `video/mp4`, `video/webm`, `video/quicktime`, `video/x-matroska`)
- size_bytes: integer, required — ≥ 1 and ≤ `VIDEO_MAX_SIZE_BYTES` (default 10 GiB = 10737418240)

**Response 201:**
- video: `VideoResponse` (`processing_status: 'uploading'`, `editorial_status: 'draft'`)
- upload: object
  - part_size: number — `VIDEO_PART_SIZE_BYTES` (default 64 MiB = 67108864)
  - part_count: number — `ceil(size_bytes / part_size)` (≤ 160 at the defaults)

**Error responses:**
- 400 validation error: when the body fails schema validation
- 401 Unauthorized: missing/invalid access token
- 413 VIDEO_TOO_LARGE: when `size_bytes` exceeds `VIDEO_MAX_SIZE_BYTES`
- 415 UNSUPPORTED_VIDEO_TYPE: when `mime_type` is not in the allowlist

---

#### POST /videos/:publicId/upload/part-urls (SI-03.5)

Issues (or re-issues) short-lived presigned `UploadPart` URLs, signed with the **public** endpoint *(per phase-03-videos/TD-02, phase-03-videos/TD-07, phase-03-videos/TD-08)*.

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer <access_token>

**Request body:**
- part_numbers: integer[], required — 1–100 items, unique, each in `1..part_count`

**Response 200:**
- parts: `{ part_number: number, url: string }[]`
- expires_in: number — seconds (`VIDEO_UPLOAD_URL_TTL_SECONDS`, default 3600)

**Error responses:**
- 400 validation error: when the body fails schema validation
- 400 INVALID_PART_NUMBER: when a part number is outside `1..part_count`
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND: unknown `publicId` or not owned by the caller
- 409 UPLOAD_NOT_IN_PROGRESS: `processing_status` is not `uploading`

---

#### GET /videos/:publicId/upload/parts (SI-03.5)

Lists the parts already stored, so a client can resume after a connection failure (`ListParts`) *(per phase-03-videos/TD-02)*.

**Request headers:**
- Authorization: Bearer <access_token>

**Response 200:**
- parts: `{ part_number: number, etag: string, size_bytes: number }[]`

**Error responses:**
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND
- 409 UPLOAD_NOT_IN_PROGRESS

---

#### POST /videos/:publicId/upload/complete (SI-03.5)

Completes the multipart upload, verifies the final object, moves the video to `processing` and enqueues processing after the DB commit *(per phase-03-videos/TD-02, phase-03-videos/TD-06, phase-03-videos/TD-08)*.

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer <access_token>

**Request body:**
- parts: `{ part_number: integer, etag: string }[]`, required — 1–10000 items, `part_number` ascending and unique, `etag` non-empty

**Response 200:** `VideoResponse` with `processing_status: 'processing'` and the real `size_bytes`.

**Error responses:**
- 400 validation error: when the body fails schema validation
- 400 UPLOAD_INCOMPLETE: storage rejects the part list (missing/invalid part or ETag); the upload stays `uploading` so the client can retry
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND
- 409 UPLOAD_NOT_IN_PROGRESS
- 413 VIDEO_TOO_LARGE: final object size exceeds `VIDEO_MAX_SIZE_BYTES` — the object is deleted and the video set to `failed` (`file_too_large`)
- 503 PROCESSING_ENQUEUE_FAILED: the upload completed but the job could not be enqueued — the video is set to `failed` (`enqueue_failed`)

---

#### DELETE /videos/:publicId/upload (SI-03.5)

Cancels an in-progress upload (`AbortMultipartUpload`) and sets the video to `failed` (`upload_aborted`) *(per phase-03-videos/TD-02, phase-03-videos/TD-08)*.

**Request headers:**
- Authorization: Bearer <access_token>

**Response 204:** No content.

**Error responses:**
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND
- 409 UPLOAD_NOT_IN_PROGRESS

---

#### GET /videos/:publicId (SI-03.6)

Owner view of a video, used to poll the processing status *(per phase-03-videos/TD-05 revision 2026-11-12 — owner-only while draft)*.

**Request headers:**
- Authorization: Bearer <access_token>

**Response 200:** `VideoResponse`.

**Error responses:**
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND

---

#### GET /videos/:publicId/stream (SI-03.6)

Returns a short-lived presigned `GetObject` URL (public endpoint) for progressive playback; the storage serves `Range` requests with `206` *(per phase-03-videos/TD-05, phase-03-videos/TD-07)*. JSON (not a `302`) because an owner-only request carries a bearer header that a `<video src>` cannot send.

**Request headers:**
- Authorization: Bearer <access_token>

**Response 200:**
- url: string
- expires_in: number — seconds (`VIDEO_DELIVERY_URL_TTL_SECONDS`, default 900)

**Error responses:**
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND
- 409 VIDEO_NOT_READY: `processing_status` is not `ready`

---

#### GET /videos/:publicId/download (SI-03.6)

Same as stream, with `ResponseContentDisposition: attachment; filename="<original_filename>"` on the presigned URL *(per phase-03-videos/TD-05)*.

**Request headers:**
- Authorization: Bearer <access_token>

**Response 200:**
- url: string
- expires_in: number — seconds (`VIDEO_DELIVERY_URL_TTL_SECONDS`)

**Error responses:**
- 401 Unauthorized
- 404 VIDEO_NOT_FOUND
- 409 VIDEO_NOT_READY

---

#### Validation Rules — videos

- `filename`: required string, 1–255 characters
- `mime_type`: required string; allowlist enforced in the service from config (domain error `UNSUPPORTED_VIDEO_TYPE`), not by a static decorator
- `size_bytes`: required integer ≥ 1; upper bound enforced in the service from config (domain error `VIDEO_TOO_LARGE`)
- `part_numbers`: required array of 1–100 unique integers ≥ 1; upper bound `part_count` enforced in the service (`INVALID_PART_NUMBER`)
- `parts`: required array of 1–10000 `{ part_number: integer ≥ 1, etag: non-empty string }`
- `publicId` path param: 11 characters from the URL-safe alphabet; malformed values answer `404 VIDEO_NOT_FOUND`

### Authorization Matrix

Every Fase 03 video is a draft, so access is owner-only *(per phase-03-videos/TD-05 revision 2026-11-12)*; ownership = `videos.channel_id → channels.user_id = JWT sub`. Non-owners get `404`, not `403`.

| Endpoint | Anonymous | Authenticated | Owner |
|----------|-----------|---------------|-------|
| POST /videos | ✗ | ✓ (creates in own channel) | — |
| POST /videos/:publicId/upload/part-urls | ✗ | ✗ | ✓ |
| GET /videos/:publicId/upload/parts | ✗ | ✗ | ✓ |
| POST /videos/:publicId/upload/complete | ✗ | ✗ | ✓ |
| DELETE /videos/:publicId/upload | ✗ | ✗ | ✓ |
| GET /videos/:publicId | ✗ | ✗ | ✓ |
| GET /videos/:publicId/stream | ✗ | ✗ | ✓ |
| GET /videos/:publicId/download | ✗ | ✗ | ✓ |

### Error Catalog

Envelope inherited from phase-02-auth/TD-07: `{ statusCode, error, message }`, raised as `DomainException` subclasses mapped by `DomainExceptionFilter`.

| errorCode | HTTP | Trigger |
|-----------|------|---------|
| VIDEO_NOT_FOUND | 404 | `publicId` unknown, malformed, or owned by another user |
| VIDEO_TOO_LARGE | 413 | Declared `size_bytes` at init, or real object size at completion, exceeds `VIDEO_MAX_SIZE_BYTES` |
| UNSUPPORTED_VIDEO_TYPE | 415 | Declared `mime_type` outside `VIDEO_ALLOWED_MIME_TYPES` |
| UPLOAD_NOT_IN_PROGRESS | 409 | Upload operation on a video whose `processing_status` is not `uploading` |
| INVALID_PART_NUMBER | 400 | Requested part number outside `1..part_count` |
| UPLOAD_INCOMPLETE | 400 | Storage rejects `CompleteMultipartUpload` (missing part, wrong ETag, invalid order) |
| PROCESSING_ENQUEUE_FAILED | 503 | Upload completed but enqueueing the processing job failed; video set to `failed` |
| VIDEO_NOT_READY | 409 | Stream/download requested while `processing_status` is not `ready` |

### Events/Messages

Queue broker: Redis (Compose service `redis`), BullMQ via `@nestjs/bullmq` `BullModule.forRootAsync` *(per phase-03-videos/TD-01)*. Producers are registered in the API; processors are registered **only** in the worker application context (Compose service `video-worker`) *(per phase-03-videos/TD-03)*.

#### Queue `video-processing` — job `process-video`

**Payload:**

```json
{ "videoId": "uuid" }
```

**Producer:** `VideoProcessingProducer` in the API, called by `VideosService.completeUpload` **after** the DB commit that sets `processing_status = 'processing'`; `jobId: process-{videoId}` makes the enqueue idempotent; an enqueue failure sets the video to `failed` (`enqueue_failed`) *(per phase-03-videos/TD-06)*.
**Consumer:** `VideoProcessingProcessor` (`@Processor('video-processing')`, extends `WorkerHost`) in the worker container *(per phase-03-videos/TD-03)*. Steps: skip unless the row is `processing` (idempotent re-delivery) → presign an internal-endpoint GET URL for `videos/{id}/original` → `ffprobe -print_format json -show_format -show_streams <url>` via `child_process.spawn` → no video stream ⇒ non-retryable failure (`not_a_video`) *(per phase-03-videos/TD-08)* → `ffmpeg -ss <t> -i <url> -frames:v 1` to a temp JPEG (t = min(1s, duration/2)) → upload to `thumbnails/{id}/default.jpg` → set metadata, `thumbnail_key`, `processing_status = 'ready'`, `processed_at`.
**Trigger:** successful `POST /videos/:publicId/upload/complete`.
**Delivery semantics:** at-least-once; `attempts: 3`, `backoff: { type: 'exponential', delay: 10000 }`; after the last attempt the video is set to `failed` (`processing_error`); stalled-job recovery uses BullMQ defaults with automatic lock renewal (no `skipLockRenewal`); worker `concurrency: 1` *(per phase-03-videos/TD-01, phase-03-videos/TD-06)*.

#### Queue `video-maintenance` — job `cleanup-abandoned-uploads`

**Payload:**

```json
{}
```

**Producer:** job scheduler `cleanup-abandoned-uploads` registered at worker boot with `queue.upsertJobScheduler('cleanup-abandoned-uploads', { pattern: '0 * * * *' }, { name: 'cleanup-abandoned-uploads' })` (idempotent upsert) *(per phase-03-videos/TD-08)*.
**Consumer:** `UploadCleanupProcessor` (`@Processor('video-maintenance')`) in the worker container. Selects videos with `processing_status = 'uploading'` and `created_at` older than `VIDEO_UPLOAD_ABANDON_AFTER_HOURS` (default 24), calls `AbortMultipartUpload` (ignoring `NoSuchUpload`), clears `upload_id` and sets `failed` (`upload_abandoned`).
**Trigger:** hourly cron.
**Delivery semantics:** at-least-once; the sweep is idempotent (it only touches rows still `uploading`).

---

## Dependency Map

```
SI-03.1 (root — Compose redis/minio, env contract, configs)
├── SI-03.2 — depends on SI-03.1 (minio, bucket e storageConfig)
│   └── SI-03.5 — depends on SI-03.2 + SI-03.3 + SI-03.4 (upload usa storage, entidade e produtor)
│       ├── SI-03.6 — depends on SI-03.5 (controller, módulo, exceções e mapper)
│       │   └── SI-03.10 — depends on SI-03.5 + SI-03.6 + SI-03.8 (rotas e worker a documentar)
│       └── SI-03.8 — depends on SI-03.4 + SI-03.5 + SI-03.7 (worker consome a fila do fluxo de upload)
│           ├── SI-03.9 — depends on SI-03.8 (scheduler e processor no WorkerModule)
│           └── SI-03.10 — (see above)
└── SI-03.4 — depends on SI-03.1 (redis e queueConfig)
    └── SI-03.5 — (see above)
SI-03.3 (root, independent — entidade Video, migração, public_id)
└── SI-03.5 — (see above)
SI-03.7 (root, independent — ffprobe/ffmpeg e fixtures)
└── SI-03.8 — (see above)
```

Suggested order: SI-03.1 → SI-03.3 → SI-03.7 → SI-03.2 → SI-03.4 → SI-03.5 → SI-03.6 → SI-03.8 → SI-03.9 → SI-03.10.

---

## Deliverables

- [ ] SI-03.1 — Infra: Redis, MinIO e contrato de ambiente
- [ ] SI-03.2 — Implementar StorageModule sobre S3/MinIO
- [ ] SI-03.3 — Criar entidade Video, migração e identificador público
- [ ] SI-03.4 — Configurar fila BullMQ e produtor de processamento
- [ ] SI-03.5 — Endpoints de upload multipart com pré-cadastro em rascunho
- [ ] SI-03.6 — Endpoints de consulta, streaming e download
- [ ] SI-03.7 — Implementar extração de metadados e thumbnail com FFmpeg
- [ ] SI-03.8 — Implementar worker de processamento de vídeo
- [ ] SI-03.9 — Implementar limpeza agendada de uploads abandonados
- [ ] SI-03.10 — Documentar API de vídeos e ambiente

**Full test suites:**

- [ ] Backend tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`cd nestjs-project && docker compose exec nestjs-api npm run lint`)
- [ ] Project builds successfully (`cd nestjs-project && docker compose exec nestjs-api npm run build`) — includes the worker entrypoint in `dist/`
