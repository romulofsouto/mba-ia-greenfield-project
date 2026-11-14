---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.6
target_file: test/videos-delivery.e2e-spec.ts
---

# Consulta, streaming e download de vídeos — Test Plan

## Application Overview

O dono de um vídeo consulta seu estado e obtém URLs assinadas de curta duração para assistir e baixar o arquivo direto do storage, sem que os bytes passem pela API. `GET /videos/:publicId` devolve o `VideoResponse` (com `thumbnail_url` assinada quando houver thumbnail); `GET /videos/:publicId/stream` e `GET /videos/:publicId/download` devolvem `200 { url, expires_in }` (JSON, não `302`) apenas quando `processing_status` é `ready`. A URL de download carrega `Content-Disposition: attachment` com o nome original. Na Fase 03 todo vídeo é rascunho, então só o dono acessa: outros usuários recebem `404` e chamadas sem token recebem `401`.

## Test Scenarios

### 1. Consulta e entrega ao dono

**Setup:** `beforeAll` sobe `AppModule` via `Test.createTestingModule(...).compile()` reproduzindo `main.ts` (`ValidationPipe` + `DomainExceptionFilter` + `ValidationExceptionFilter`); `beforeEach` roda `cleanAllTables(dataSource)`, cria e confirma o usuário A (com canal) e o usuário B, faz login dos dois e semeia direto no banco e no MinIO (helper `src/test/minio.ts`, prefixo da suíte): um vídeo `ready` de A com objeto `videos/{id}/original` (bytes da fixture `test/fixtures/sample.mp4`), `original_filename: "aula final.mp4"` e `thumbnail_key: null`, e um vídeo `processing` de A. O worker não roda no E2E. `afterAll` esvazia o prefixo e chama `app.close()`.

#### 1.1. consulta-retorna-video-do-dono

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. GET /videos/:publicId do vídeo `ready` com o bearer de A
    - expect: status `200`
    - expect: o corpo tem o `VideoResponse` completo: `public_id`, `title`, `original_filename`, `mime_type`, `size_bytes`, `processing_status: "ready"`, `editorial_status: "draft"`, metadados e `created_at`/`updated_at`
    - expect: `thumbnail_url` = `null`, já que `thumbnail_key` é nulo
    - expect: o corpo não contém `id`, `channel_id`, `upload_id` nem `storage_key`

#### 1.2. stream-retorna-url-assinada-publica

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. GET /videos/:publicId/stream do vídeo `ready` com o bearer de A
    - expect: status `200` com JSON `{ url, expires_in }`, sem header `Location`
    - expect: `url` tem o host de `S3_PUBLIC_ENDPOINT`, aponta para a chave `videos/{id}/original` e traz parâmetros de assinatura (`X-Amz-Signature`, `X-Amz-Expires=900`)
    - expect: `expires_in` = `900`
    - expect: `url` não contém `response-content-disposition`

#### 1.3. download-retorna-url-com-attachment

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. GET /videos/:publicId/download do vídeo `ready` com o bearer de A
    - expect: status `200` com JSON `{ url, expires_in }` e `expires_in` = `900`
    - expect: o parâmetro `response-content-disposition` da `url`, decodificado, é `attachment; filename="aula final.mp4"`

### 2. Vídeo ainda não pronto

**Setup:** igual ao grupo 1.

#### 2.1. stream-e-download-exigem-ready

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. GET /videos/:publicId/stream do vídeo `processing` com o bearer de A
    - expect: status `409` com `error: "VIDEO_NOT_READY"`
  2. GET /videos/:publicId/download do mesmo vídeo
    - expect: status `409` com `error: "VIDEO_NOT_READY"`
  3. GET /videos/:publicId do mesmo vídeo
    - expect: status `200` com `processing_status: "processing"` (a consulta não depende de `ready`)

### 3. Controle de acesso

**Setup:** igual ao grupo 1.

#### 3.1. somente-o-dono-consulta-e-recebe-urls

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-11-12T18:06:43Z

**Steps:**
  1. Com o bearer de B, chamar GET /videos/:publicId, GET /videos/:publicId/stream e GET /videos/:publicId/download sobre o vídeo `ready` de A
    - expect: as três retornam `404` com `error: "VIDEO_NOT_FOUND"`, sem URL no corpo
  2. Chamar as três rotas sem `Authorization`
    - expect: as três retornam `401`
  3. Chamar GET /videos/:publicId com um `publicId` inexistente de 11 caracteres usando o bearer de A
    - expect: `404` com `error: "VIDEO_NOT_FOUND"`
