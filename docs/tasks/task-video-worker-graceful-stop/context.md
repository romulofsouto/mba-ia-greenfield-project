---
kind: task
name: task-video-worker-graceful-stop
sources_mtime:
  docs/decisions/technical-decisions-video-worker-graceful-stop.md: "2026-11-14 13:48:40.558769869 -0300"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-14 08:32:25.440829027 -0300"
  docs/decisions/technical-decisions-phase-01-configuracao-base.md: "2026-11-11 08:00:03.530651900 -0300"
  docs/phases/phase-03-videos/context.md: "2026-11-14 08:32:25.441103185 -0300"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-11-14 08:32:25.439926464 -0300"
---

# task-video-worker-graceful-stop — Context

## Scope

> Como iniciar o video-worker em dev para que o SIGTERM do docker compose stop chegue ao processo node, o Nest feche os workers BullMQ e o container saia com código 0, mantendo recompilação ao editar e o build em dist-worker/

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| video-worker-graceful-stop/TD-01 | ad-hoc | Backend | Dev start strategy for the video-worker (signal delivery to… | decided | B (separate compile-watch + `node --watch` as main process) | — |
| video-worker-graceful-stop/TD-02 | ad-hoc | Backend | Stop grace period for the video-worker (active job vs. stop… | decided | B (grace period ≈200 s, derived from media timeouts) | — |

_Source files:_

- video-worker-graceful-stop — docs/decisions/technical-decisions-video-worker-graceful-stop.md (scope_type: ad-hoc, related_phases: [])

## Decisions Detail

### video-worker-graceful-stop/TD-01

**Recommendation:** it is the only option without a new dependency that actually waits for the node process to finish its shutdown and passes its exit code to the container, which is the acceptance criterion. Option A was checked against the installed Nest CLI code and cannot meet the criterion. Verification is a documented runtime check, because no test layer in the testing guide covers compose/start commands: start the worker, run `docker compose stop video-worker`, then confirm `docker compose ps -a` shows `Exited (0)`, and confirm that the logs show the Nest shutdown with no `npm error signal SIGTERM`, and that an edit under `src/` still triggers a rebuild into `dist-worker/` and a worker restart. The `nestjs-api` start/stop problem is recorded as a follow-up (see findings).
**Libraries:** —

### video-worker-graceful-stop/TD-02

**Recommendation:** the task's goal is that the active job is not interrupted, and only a window derived from the existing per-attempt timeouts guarantees that. The longer stop happens only while a job is running, and an idle worker still stops in about 200 ms.
**Libraries:** —

## Inherited Decisions Detail

### phase-03-videos/TD-01

**Recommendation:** it is the only option with a first-party Nest 11 module and with retries, backoff and stalled-job recovery built in, which TD-06 relies on; it keeps the heavy queue traffic off the PostgreSQL instance and matches the queue container already drawn in the architecture. pg-boss is the strong alternative if avoiding a new service matters more than the official integration — its transactional enqueue is a real advantage, while BullMQ needs the mitigation described in TD-06.
**Libraries:** bullmq, @nestjs/bullmq

### phase-03-videos/TD-02

**Recommendation:** it is the only option that meets both hard requirements at once (10GB beyond the 5 GB single-PUT ceiling, and no load on the API), and it gives resume for free through the part model; tus is resumable too but routes the full 10GB through Nest, which is the impact the phase must avoid.
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

### phase-03-videos/TD-03

**Recommendation:** the separate container keeps heavy processing off the API, as the phase and the architecture demand, and invoking the two binaries directly is a small, fully testable surface that avoids taking on an archived library.
**Libraries:** —

### phase-03-videos/TD-04

**Recommendation:** it is the only option that is both short and non-enumerable, which the unlisted visibility of Fase 04 requires; the unique index turns the collision case into a handled retry instead of a correctness risk, without new dependencies.
**Libraries:** —

### phase-03-videos/TD-05

**Recommendation:** progressive streaming of the original file over Range requests satisfies "sem download completo" with no transcoding, keeps video bytes off the API and matches the architecture; HLS can be added later as a separate decision without changing the download flow.
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

**Revisions:**
- 2026-11-12 — Access rule for Fase 03: streaming and download URLs are issued only to the authenticated owner of the video while it is a draft; public/anonymous access arrives with publication in Fase 04. _Rationale:_ resolves AMB-1 of phase-03-videos validation — every Fase 03 video is a draft and the draft → published flow belongs to Fase 04; consistent with the private bucket (TD-07) and the separate editorial state (TD-06).

### phase-03-videos/TD-06

**Recommendation:** separating processing from publication avoids a schema rework in Fase 04, and the API-driven trigger is the natural completion point of the multipart flow chosen in TD-02; idempotent enqueue after commit plus queue retries and a terminal `failed` state cover every failure path without storage-specific events.
**Libraries:** —

### phase-03-videos/TD-07

**Recommendation:** one private bucket with prefixes keyed by the internal video ID keeps policy and cleanup simple and keeps unlisted/draft content private, and the internal/public endpoint split is the standard way to keep server traffic on the Docker network (`minio`, never `localhost`) while issuing URLs the browser can actually use.
**Libraries:** @aws-sdk/client-s3

### phase-03-videos/TD-08

**Recommendation:** explicit limits at init, complete and processing give a clear error at the earliest point for each failure, and the scheduled cleanup keeps the DB status consistent with storage, which a storage-only expiry cannot do.
**Libraries:** —

### phase-03-videos/TD-09

**Recommendation:** real Compose services are the only way to test the multipart, presign and Range contracts this phase depends on, and they reuse the isolation pattern the project already applies to PostgreSQL and Mailpit; the testing guide's filesystem rule must be corrected as part of the phase.
**Libraries:** —

### phase-01-configuracao-base/TD-01

**Recommendation:** Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem: the factory function can be imported as a plain function by `data-source.ts` while also serving as a DI injection token inside NestJS. Building a custom module recreates solved functionality; third-party packages carry maintenance risk.
**Libraries:** @nestjs/config

### phase-01-configuracao-base/TD-02

**Recommendation:** First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring. Handles string-to-number coercion natively. Using a different tool for env validation vs. request validation is reasonable — env config is validated once at startup, DTOs are validated per-request. Zod is elegant but adds a third validation paradigm to the project.
**Libraries:** joi

### phase-01-configuracao-base/TD-03

**Recommendation:** The project roadmap explicitly calls for auth, email, and storage in upcoming phases. Namespaced configs provide clear file boundaries per domain, typed injection via `ConfigType<typeof databaseConfig>`, and natural scalability. The `registerAs()` factory is dual-purpose: DI token inside NestJS and plain importable function for `data-source.ts`.
**Libraries:** —

### phase-01-configuracao-base/TD-04

**Recommendation:** Natural outcome of choosing `@nestjs/config` with `registerAs`. The factory is already callable by design. `data-source.ts` imports it, calls `dotenv.config()`, then calls the factory. Zero duplication, minimal code, no extra abstraction.
**Libraries:** —

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, validationOptions: { allowUnkno... _(from phase 01)_
- Config is injected into modules via `ConfigType<typeof xxxConfig>` and `@Inject(xxxConfig.KEY)`; the same factory is importable as a plain function f... _(from phase 01)_
- `data-source.ts` loads `.env` via `import 'dotenv/config'` at the top, then imports `databaseConfig` and calls it as a plain function. _(from phase 01)_
- Database connection parameters (host, port, etc.) are sourced from a single `databaseConfig` factory — never duplicated between `AppModule` and `data-... _(from phase 01)_
- `TypeOrmModule.forRootAsync` is used (not `forRoot`), with `imports: [ConfigModule]`, `inject: [databaseConfig.KEY]`, `useFactory` returning options inc... _(from phase 01)_

## Inherited Deferred Capabilities

_No inherited deferred capabilities._

## Non-UI / Deferred Capabilities

_None._

## Testing Requirements

### nestjs-project

| Artifact type | Required layers |
|---------------|-----------------|
| Entity (`*.entity.ts`) | Integration: constraints, defaults, `select: false` |
| Service with branching + DB | Unit: branch logic (mock repo) + Integration: DB contract |
| Service with DB only (no branching) | Integration: DB contract |
| Service with configured lib (JWT, cache) | Unit: real lib with test config |
| Service with side-effect dep (email, storage, queue) | Integration: real Compose service — Mailpit (email), MinIO with per-suite key prefix (storage), Redis with per-suite BullMQ prefix (queue) |
| Module with configured imports | Unit: compilation test |
| Controller | E2E only — do NOT write unit tests |
| DTO | E2E: one validation wiring test per endpoint |
| Guard (delegates to service for business logic) | E2E + Unit if complex internal logic |
| Guard (simple, delegates to Passport) | E2E only |
| Strategy (Passport) | E2E via guard |
| Pipe (custom transformation/validation) | Unit |
| Interceptor (response transform, logging) | Unit and/or E2E |
| Exception Filter | Unit + E2E |
| Middleware | E2E |
