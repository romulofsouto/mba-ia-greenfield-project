---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.5
target_file: test/videos-upload.e2e-spec.ts
---

# Upload multipart de vídeos — Test Plan

## Application Overview

Os endpoints de upload pré-cadastram o vídeo como rascunho e conduzem um upload multipart direto para o storage (S3/MinIO), sem que os bytes passem pela API. `POST /videos` valida tipo e tamanho declarados, cria a linha `videos` (`processing_status: uploading`, `editorial_status: draft`, `public_id` de 11 caracteres) e inicia o multipart; `POST /videos/:publicId/upload/part-urls` emite URLs assinadas de `UploadPart` com o endpoint público; `GET /videos/:publicId/upload/parts` lista as partes já gravadas, para retomar o upload; `POST /videos/:publicId/upload/complete` fecha o multipart, confere o objeto final, move o vídeo para `processing` e enfileira o job `process-video`; `DELETE /videos/:publicId/upload` aborta. Todas as rotas exigem bearer token, e as que usam `:publicId` só atendem o dono (os demais recebem `404`). Erros seguem o envelope `{ statusCode, error, message }`.

## Test Scenarios

### 1. Pré-cadastro e início do upload (`POST /videos`)

**Setup:** `beforeAll` sobe `AppModule` via `Test.createTestingModule(...).compile()` reproduzindo `main.ts` (`ValidationPipe` com `whitelist`/`forbidNonWhitelisted`/`transform` + `DomainExceptionFilter` + `ValidationExceptionFilter`), com `VIDEO_PART_SIZE_BYTES=5242880` no ambiente do teste para partes pequenas; `beforeEach` roda `cleanAllTables(dataSource)`, cria e confirma um usuário (com canal) e faz login para obter o `access_token`; `afterAll` esvazia o prefixo de chaves da suíte no MinIO (`src/test/minio.ts`), oblitera a fila `video-processing` da suíte (`src/test/redis.ts`) e chama `app.close()`.

#### 1.1. cria-rascunho-e-inicia-multipart

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. POST /videos com `{ filename: "aula.mp4", mime_type: "video/mp4", size_bytes: 104857600 }` e o bearer do dono
    - expect: status `201`
    - expect: `video.public_id` com 11 caracteres de `[A-Za-z0-9_-]`
    - expect: `video.processing_status` = `"uploading"`, `video.editorial_status` = `"draft"`, `video.title` = `"aula"`
    - expect: `upload.part_size` = `5242880` (valor do ambiente de teste) e `upload.part_count` = `ceil(104857600 / 5242880)` = `20`
    - expect: existe uma linha em `videos` com esse `public_id`, `upload_id` não nulo e `channel_id` do canal do usuário

#### 1.2. rejeita-tamanho-e-tipo-fora-da-politica

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. POST /videos com `{ filename: "grande.mp4", mime_type: "video/mp4", size_bytes: 10737418241 }`
    - expect: status `413` com `error: "VIDEO_TOO_LARGE"` no envelope
  2. POST /videos com `{ filename: "doc.pdf", mime_type: "application/pdf", size_bytes: 1024 }`
    - expect: status `415` com `error: "UNSUPPORTED_VIDEO_TYPE"`
  3. POST /videos sem `filename`
    - expect: status `400` (erro de validação)
  4. Consultar a tabela `videos`
    - expect: nenhuma linha criada pelas três chamadas

### 2. Envio de partes e retomada

**Setup:** igual ao grupo 1, mais um vídeo iniciado via `POST /videos` com `size_bytes: 6291456` (2 partes de 5 MiB + 1 MiB). Como as URLs públicas apontam para `S3_PUBLIC_ENDPOINT`, que não é alcançável de dentro do container, as partes são enviadas ao MinIO por um helper de teste com o cliente interno (mesmo `Bucket`/`Key`/`UploadId`/`PartNumber`).

#### 2.1. emite-urls-de-parte-e-valida-numero

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. POST /videos/:publicId/upload/part-urls com `{ part_numbers: [1, 2] }`
    - expect: status `200`
    - expect: `parts` tem 2 itens com `part_number` 1 e 2, e cada `url` tem o host de `S3_PUBLIC_ENDPOINT` e contém `partNumber=` e `uploadId=`
    - expect: `expires_in` = `3600`
  2. POST /videos/:publicId/upload/part-urls com `{ part_numbers: [3] }`
    - expect: status `400` com `error: "INVALID_PART_NUMBER"`

#### 2.2. lista-partes-ja-enviadas

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. Enviar só a parte 1 (5 MiB) pelo helper interno
  2. GET /videos/:publicId/upload/parts
    - expect: status `200`
    - expect: `parts` tem exatamente 1 item, com `part_number: 1`, `etag` não vazio e `size_bytes: 5242880`

### 3. Conclusão do upload (`POST /videos/:publicId/upload/complete`)

**Setup:** igual ao grupo 2, com as partes 1 e 2 já enviadas pelo helper interno e seus ETags capturados.

#### 3.1. conclui-e-enfileira-processamento

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. POST /videos/:publicId/upload/complete com `{ parts: [{ part_number: 1, etag }, { part_number: 2, etag }] }`
    - expect: status `200` com o `VideoResponse`
    - expect: `processing_status` = `"processing"` e `size_bytes` = `6291456`
  2. Consultar a fila `video-processing`
    - expect: existe o job `process-{id}` (id interno do vídeo) com nome `process-video` e payload `{ videoId: <id> }`
  3. Consultar a linha em `videos`
    - expect: `upload_id` nulo e `uploaded_at` preenchido

#### 3.2. etag-invalido-mantem-upload-aberto

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. POST /videos/:publicId/upload/complete com o ETag da parte 2 trocado por `"deadbeef"`
    - expect: status `400` com `error: "UPLOAD_INCOMPLETE"`
  2. GET /videos/:publicId
    - expect: `processing_status` continua `"uploading"`

#### 3.3. falha-de-enfileiramento-marca-falha

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. Num app de teste separado, com `overrideProvider(VideoProcessingProducer)` cujo `enqueue` rejeita (simula o Redis indisponível sem derrubar o serviço compartilhado), concluir um upload válido via POST /videos/:publicId/upload/complete
    - expect: status `503` com `error: "PROCESSING_ENQUEUE_FAILED"`
  2. Consultar a linha em `videos`
    - expect: `processing_status` = `"failed"` e `failure_reason` = `"enqueue_failed"`

### 4. Cancelamento e controle de acesso

**Setup:** igual ao grupo 1, mais um vídeo iniciado pelo usuário A e um segundo usuário B confirmado e logado.

#### 4.1. aborta-upload-e-rejeita-repeticao

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. DELETE /videos/:publicId/upload com o bearer de A
    - expect: status `204` sem corpo
    - expect: a linha em `videos` fica com `processing_status: "failed"`, `failure_reason: "upload_aborted"` e `upload_id` nulo
  2. DELETE /videos/:publicId/upload de novo
    - expect: status `409` com `error: "UPLOAD_NOT_IN_PROGRESS"`

#### 4.2. somente-o-dono-acessa-o-upload

**Covers AC:** #9
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. Com o bearer de B, chamar POST /videos/:publicId/upload/part-urls, GET /videos/:publicId/upload/parts, POST /videos/:publicId/upload/complete e DELETE /videos/:publicId/upload sobre o vídeo de A
    - expect: todas retornam `404` com `error: "VIDEO_NOT_FOUND"`, sem revelar que o vídeo existe
  2. Chamar POST /videos e as mesmas rotas sem `Authorization`
    - expect: todas retornam `401`
  3. Chamar GET /videos/:publicId/upload/parts com um `publicId` malformado (`"x"`) usando o bearer de A
    - expect: `404` com `error: "VIDEO_NOT_FOUND"`
