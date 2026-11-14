# PLANO DE EXECUÇÃO — FASE 03: Upload e Processamento de Vídeos

> Como usar: execute os passos **em ordem**. Cada passo deve ser feito em uma **janela de contexto nova** (`/clear` ou nova sessão do Claude Code na raiz do repo).
> Copie o bloco **"Prompt"** do passo, cole no Claude Code e siga as perguntas da skill.
> Só avance quando o **"Critério para avançar"** estiver cumprido. Marque o checkbox ao concluir.

## Painel de progresso

| # | Passo | Status |
|---|-------|--------|
| 0 | Preparação (git, context7, baseline) | 🟡 em andamento (4/5) — baseline com 2 falhas pré-existentes |
| 1 | `/research phase 03` | 🟡 em andamento (3/4) — falta só a revisão 1.2 |
| 2 | `/plan-context 3` | 🟡 em andamento (1/2) — `context.md` gerado, falta sua revisão |
| 3 | `/plan-validate 3` | ✅ rodada 2: `clean` (0 issues) |
| 4 | `/plan-resolve 3` (⇄ 3 até clean) | ✅ concluído — `clean` e commitado (`a7b8042`) |
| 5 | `/plan-build 3` | 🟡 em andamento (3/5) — plano commitado (`0270b34`), falta sua revisão (5.2/5.3) |
| 6 | `/plan-test-specs 3` (condicional) | ✅ concluído — 2 specs commitadas (`e84a1d4`) |
| 7 | `/implement 3` | ✅ concluído — 10/10 SIs; DoD verificada de novo em 2026-11-14 (task `phase-03-dod-closure`, PR #6) e `progress.md` da fase com `Status: completed` |
| 7B | Correções para a DoD (tasks: migrations, lint, runInBand, `phase-03-dod-closure`, `video-worker-graceful-stop`) + Compose real | ✅ concluído — A ✅ (PR #1) · B ✅ (PR #2) · B' ✅ (PR #3) · C ✅ (PRs #4/#5) · D ⏭️ · E/H ✅ (PR #6) · G ✅ (PRs #7/#8) · F opcional (não feito) |
| 8 | Fechamento (DoD + docs + PRs) | 🟡 em andamento (4/5) — 8.1 ✅ (PR #9) · 8.2 ✅ (PR #10) · 8.3 ✅ checklist (2 lacunas bloqueantes → corrigidas: `main` sincronizada no PR #11; seção de vídeos no `nestjs-project/CLAUDE.md` na `docs/phase-03-videos-docs`) · 8.4 🟡 PR #11 `dev` → `main` feito; falta levar as branches de docs à `dev` e à `main` |

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluído · ⏭️ não se aplica

**Pendências abertas (2026-11-14):**
- Follow-ups da task `phase-03-dod-closure`: ~~a nota "Fora de escopo" do SI-03.3 ainda diz que o `test:e2e` não usa `--runInBand`~~ → corrigida no 8.2 (PR #10); a verificação final da task não rodou `npm run build` (coberto pelo 8.1).
- Follow-ups da etapa C (fora do escopo, registrados em `docs/tasks/task-lint-baseline/progress.md` e no doc de decisões): separar `lint` (checagem) de `lint:fix` — o script ainda junta `--fix` com o gate; trocar `(authService as any).mailService` por `app.get(MailService)` em `auth.service.integration-spec.ts` e `test/auth.e2e-spec.ts`; tipar respostas nos e2e quando existirem DTOs de auth; migrar `tseslint.config` (deprecated) para `defineConfig`; vulnerabilidades pré-existentes do `npm audit`; bug na skill `plan-build` (a Phase B não remove `<!-- phase-a-complete -->` em planos sem Tech Specs — 5 planos antigos ainda têm a sentinela).
- ~~Parada limpa do `video-worker` falha (etapa G)~~ → corrigida em 2026-11-14 na `bugfix/video-worker-graceful-stop` e mergeada na `dev` (PR #8 — `f9bf1e2`).
- Follow-up novo (registrado em `docs/decisions/technical-decisions-video-worker-graceful-stop.md` → Follow-ups): o `nestjs-api` tem o mesmo tipo de problema por outro mecanismo — o PID 1 é `tail -f /dev/null` (CMD do `Dockerfile.dev`) e a API sobe via `docker compose exec`, então `docker compose stop nestjs-api` sempre espera 10 s e mata a API com SIGKILL. Corrigir exige mudar como o serviço é iniciado (um `command:` como o do worker) e o fluxo documentado `docker compose exec nestjs-api npm run start:dev` → task própria.
- ~~Fechamento (8.2): `CLAUDE.md` da raiz + nota do SI-03.3~~ → feito na task `phase-03-docs-closure` (PR #10, mergeado na `dev` — `79f78a0`).
- **Lacunas bloqueantes do 8.3** (critérios de aceite do enunciado):
  1. ~~**Seção de vídeos no CLAUDE.md**~~ → corrigida em 2026-11-14 na `docs/phase-03-videos-docs`: nova seção `## Videos (Phase 03)` no `nestjs-project/CLAUDE.md` (módulos `videos/`, `storage/`, `queue/`, `media/`, `worker/`; os 8 endpoints `/videos`; fluxo de upload multipart presigned; `public_id`; os dois eixos de status; filas `video-processing`/`video-maintenance`; env vars `S3_*`/`REDIS_*`/`VIDEO_*`; testes com MinIO/Redis reais), conferida contra o código.
  2. ~~**`main` defasada**~~ → corrigida pelo PR #11 (`dev` → `main`, `c5d5d62`): `main` idêntica à `dev` em `79f78a0`, `CLAUDE.md` da raiz sem `TBD`.
- **Desvio de Git Flow (8.3):** o PR #4 mergeou `bugfix/lint-baseline` direto na `main` (o PR #5 depois levou a mesma branch à `dev`). Não é commit direto na `main`, mas contraria "bugfix volta para a `dev`"; registrar como desvio conhecido. Demais PRs (#1–#3, #5–#10) seguem o fluxo para a `dev`, sem commits diretos na `dev`.
- Follow-ups novos do 8.3 (só documentação, não bloqueiam o fechamento): ~~checkboxes de `## Deliverables` em `docs/phases/phase-03-videos/phase-03-videos.md` ainda `[ ]`~~ → **não é pendência**: segue a convenção da referência de formato `docs/phases/phase-02-auth/phase-02-auth.md` (22 itens, todos `[ ]`); o `/implement` usa os Deliverables como lista de comandos da verificação final e não os marca — o status fica no `progress.md`; o plano é artefato do `/plan-build` e não se edita à mão. `library-refs.md` da fase diz `@nestjs/bullmq ^12.0.1` / "not installed yet" (instalado `^11.0.5`) → **mantido como está**: o `/plan-resolve` só roda com `validation.md` `dirty` (ou sem `library-refs.md`) e o Step 5 só busca libs ausentes, nunca reescreve a versão de uma entrada existente; atualizar pelo fluxo exigiria a cascata `/decide` (revisão TD-01) → `/plan-context 3` → `/plan-validate 3` → apagar `library-refs.md` → `/plan-resolve 3` → `/plan-build 3` (regerar o plano de uma fase já implementada). A divergência é rastreável ao código (`package.json`) e ao `progress.md` (SI-03.4: 12.x é ESM-only e quebra o Jest); a revisão da TD-01 segue opcional como item **F**; ~~README não auditado~~ → `README.md` atualizado na `docs/phase-03-videos-docs` (arquitetura sem "planejado — Fase 03", serviços MinIO/Redis/worker no "Como rodar", seção "Upload e processamento de vídeos (Fase 03)" com os endpoints, estrutura com `videos/`, `storage/`, `queue/`, `media/`, `worker/` e `phase-03-videos/`, Fase 03 ✅ na tabela de fases, stack com BullMQ/MinIO/FFmpeg).
- Follow-ups novos do 8.2 (fora do escopo, registrados em `docs/tasks/task-phase-03-docs-closure/progress.md`): `docs/diagrams/software-arch.mermaid:13` ainda declara a Message Queue como `"TBD"` → **fora do escopo, por restrição**: o diagrama é a arquitetura-alvo do professor e não deve ser editado; o estado real (BullMQ + Redis) está documentado no `CLAUDE.md` da raiz, no `nestjs-project/CLAUDE.md` e no `README.md`; ~~a frase "This is a monorepo with two main areas" do `CLAUDE.md` lista três itens~~ → corrigida para "three main areas" na `docs/phase-03-videos-docs`.
- Follow-ups novos (fora do escopo, registrados em `docs/tasks/task-fix-migrations-integration-spec/progress.md`): `createTestDataSource` usa `synchronize: true` por padrão, o que cria tabelas sem registrar migrations (o banco tinha `videos` sem a linha `CreateVideos` em `migrations`); os specs de integração usam o mesmo banco `streamtube` da aplicação de dev (avaliar banco de teste separado).
- Revisões antigas ainda abertas: 1.2 revisar as 9 TDs · 2.2 revisar `context.md` · 5.2/5.3 revisar Tech Specs e SIs.

**Próximo passo:** PR `docs/phase-03-videos-docs` → `dev` (leva junto o commit do 8.3, `07d7dc5`) → PR `dev` → `main` (fecha o 8.4). Nenhuma pendência bloqueante restante; o diagrama mermaid fica fora do escopo, os Deliverables seguem a convenção da fase 02 e o `library-refs.md` fica como está (divergência rastreável no `progress.md`). F (revisão da TD-01 via `/decide`) e 8.5 seguem opcionais.

### Histórico
- **2026-11-11** — context7 autenticado via OAuth (plugin `claude-plugins-official/context7`, `/mcp` → Authenticate). Passo 0.3 concluído.
- **2026-11-12** — `next-frontend/package-lock.json` revertido (`git checkout --`). A alteração era só a flag `"dev": true` em `playwright/node_modules/fsevents`, regravada por um `npm install` no container; sem impacto. Passo 0.1 concluído.
- **2026-11-12** — branch `dev` criada a partir da `main` (8459b2f) e enviada para `origin/dev`; `feature/phase-03-videos` criada a partir da `dev` (local). Passo 0.2 concluído.
- **2026-11-12** — `/research phase 03` executado: `docs/decisions/technical-decisions-phase-03-videos.md` criado com TD-01..TD-09 (`**Decision:** _[pending]_`), todos os 9 bullets da Fase 03 citados em `**Capability:**`. Passo 1.1 concluído; falta revisão (1.2), decisões (1.3) e commit (1.4). Obs.: Passo 0.4 (baseline) ainda pendente.
- **2026-11-12** — doc de decisões commitado em `feature/phase-03-videos` (`1c25bc0`), com `**Decision:**` ainda pendentes. Passo 1.4 concluído.
- **2026-11-12** — Baseline (0.4) executada em `feature/phase-03-videos` (`1c25bc0`). **Não está verde** — falhas pré-existentes, nenhuma causada pela fase 03:
  - ✅ e2e: 3 suítes, 52 testes passando · ✅ `tsc --noEmit`: exit 0 · ✅ unit/integration sem o spec de migrations: 22 suítes, 142 testes passando.
  - ❌ `src/database/migrations.integration-spec.ts` falha sempre: o `beforeAll` dropa as tabelas mas não o tipo `verification_tokens_type_enum`, e `CreateAuthTokens` faz `CREATE TYPE` sem `IF NOT EXISTS`. Efeitos colaterais: (1) o `afterAll` falha antes do `destroy()`, deixando a conexão aberta, e o Jest **não encerra** (`npm test` trava); (2) o banco de dev fica **sem as tabelas** (só `migrations` vazia). Banco restaurado manualmente (`DROP TYPE` + `migration:run`). → abrir `bugfix/` a partir da `dev`.
  - ❌ `npm run lint`: 150 erros + 40 warnings (regras `no-unsafe-*`, `unbound-method`, `require-await`), quase todos em testes (`test/auth.e2e-spec.ts` 48, `auth.service.spec.ts` 45, …) e 6 em `channels.service.ts`. → abrir `bugfix/` a partir da `dev`.
  - Até os bugfixes: rodar unit com `npx jest --runInBand --testPathIgnorePatterns migrations.integration-spec` e comparar o lint com esta contagem (190 problemas).
- **2026-11-12** — `/plan-context 3` executado: `docs/phases/phase-03-videos/context.md` gerado (não commitado) — único arquivo produzido pela etapa (pasta `docs/phases/phase-03-videos/` criada); nenhum arquivo versionado foi alterado. Fatia monolítica `phase-03-videos`; 9 TDs indexadas, todas `pending`; os 9 bullets da Fase 03 cobertos em `## Capability Coverage`. Nenhum sinal de UI nos bullets → `## UI Inventory` omitido (a pergunta de inventário não apareceu). Correlator: só `openapi-docs-nestjs` incluído (3 docs de frontend descartados). Herdados: 24 TDs (fases 01, 02-auth, 02-auth-frontend + openapi-docs-nestjs), 6 convenções da fase 01, 6 capacidades adiadas (só informativas). `## Decisions Detail` vazio até as TDs serem decididas. Passo 2.1 concluído; 2.2 (revisão) pendente.
- **2026-11-12** — `/plan-validate 3` rodada 1: `docs/phases/phase-03-videos/validation.md` gerado (não commitado) — **`status: dirty`, 10 issues abertas**: OQ-1..OQ-9 (uma por TD pendente) + AMB-1 (streaming/download não dizem quem acessa um vídeo em rascunho; a publicação é da Fase 04 — decidir na TD-05/TD-06). Nenhum IC/MD/DG/ICC; UI e cross-slice não se aplicam (sem telas, fatia única). Títulos de TD-07/TD-08 corrigidos à mão no arquivo (vinham truncados). Passo 3 concluído (3.1, 3.2) → Passo 4.
- **2026-11-12** — `/plan-resolve 3` rodada 1: as 10 issues resolvidas, todas com a opção recomendada — TD-01 A (BullMQ + Redis), TD-02 A (S3 multipart + presigned), TD-03 A (container dedicado + spawn), TD-04 A (ID aleatório 11 chars), TD-05 A (presigned GET), TD-06 B (dois eixos + gatilho pela API), TD-07 A (bucket privado + 2 endpoints), TD-08 A (limites fixos + limpeza agendada), TD-09 A (MinIO/Redis reais). AMB-1 → revisão na TD-05: só o dono autenticado acessa streaming/download enquanto rascunho; acesso público na Fase 04. Arquivos: doc de decisões (`**Decision:**` + `**Libraries:**`, tabela-resumo, `status: decided` — modificado, não commitado), `context.md` (índice + Decisions Detail + `sources_mtime`), `validation.md` (10 issues `resolved`, `issue_count: 0`, ainda `status: dirty` até revalidar) e `library-refs.md` novo (bullmq 6.7.5, @nestjs/bullmq 12.0.1, @aws-sdk/client-s3 e s3-request-presigner 3.1167.0 — nenhuma instalada ainda). A conferir no `/plan-build`: mecanismo do agendamento da limpeza (TD-08 — candidato: `upsertJobScheduler` do BullMQ) e como passar `concurrency`/`lockDuration` no `@Processor`. Passo 1.3 e Passos 4.1–4.3 concluídos.
- **2026-11-12** — `/plan-validate 3` rodada 2: **`status: clean`, `issue_count: 0`** — nenhum IC/AMB/MD/DG/ICC/OQ novo com as 9 TDs decididas; as 10 issues da rodada 1 seguem como `resolved` no audit trail. Só frontmatter do `validation.md` mudou (status + `sources_mtime`). Observação para o `/plan-build`: o testing guide ainda manda usar "local adapter" para storage, e a TD-09 (MinIO real) prevê corrigi-lo dentro da fase — incluir como passo. Passos 3.1/3.2 (rodada 2) e 4.4 concluídos.
- **2026-11-12** — planejamento commitado em `feature/phase-03-videos` (`a7b8042`): doc de decisões (9 TDs decididas) + `docs/phases/phase-03-videos/` (`context.md`, `validation.md` clean, `library-refs.md`). Este plano segue fora do git (0.5). Passo 4.5 concluído.
- **2026-11-12** — `/plan-build 3` executado (Phase A + B na mesma sessão): `docs/phases/phase-03-videos/phase-03-videos.md` criado (não commitado), `test_specs_aware: true`, sem sentinelas restantes. Tech Specs: Data Model (`Video` com `processing_status` × `editorial_status`, `public_id` 11 chars), API Contracts (8 endpoints em `/videos`, todos autenticados e owner-only — não dono → `404`; stream/download devolvem `200 { url, expires_in }`, não `302`), Authorization Matrix, Error Catalog (8 códigos: `VIDEO_NOT_FOUND`, `VIDEO_TOO_LARGE`, `UNSUPPORTED_VIDEO_TYPE`, `UPLOAD_NOT_IN_PROGRESS`, `INVALID_PART_NUMBER`, `UPLOAD_INCOMPLETE`, `PROCESSING_ENQUEUE_FAILED`, `VIDEO_NOT_READY`), Events/Messages (filas `video-processing` e `video-maintenance` com scheduler horário). 10 SIs: 03.1 infra Redis/MinIO + env · 03.2 StorageModule + correção do testing guide · 03.3 entidade + migração + `public_id` · 03.4 fila + produtor · 03.5 endpoints de upload · 03.6 consulta/stream/download · 03.7 ffprobe/ffmpeg + fixtures · 03.8 worker + serviço `video-worker` · 03.9 limpeza de uploads abandonados · 03.10 OpenAPI + CLAUDE.md. 2 placeholders `**Test Specs:** _pending_` (03.5, 03.6) → Passo 6 obrigatório. Desvio da skill: o doc de decisões foi lido para não inventar env vars/limites (o `context.md` só tem o resumo). A conferir no context7 durante o SI-03.8: opções de worker no `@Processor` e erro não-retentável do BullMQ. Passos 5.1 e 5.4 concluídos; 5.2 respondido com "Continuar agora" sem revisão detalhada.
- **2026-11-12** — plano executável commitado em `feature/phase-03-videos` (`0270b34`): só `docs/phases/phase-03-videos/phase-03-videos.md`. Este plano segue fora do git (0.5). Passo 5.5 concluído.
- **2026-11-12** — `/plan-test-specs 3`: `nestjs-project/specs/videos-upload.plan.md` (SI-03.5, 9 cenários) e `videos-delivery.plan.md` (SI-03.6, 5 cenários); campos `**Test Specs:**` do plano preenchidos. Commitado no preflight do `/implement` (`e84a1d4`). Passos 6.1 e 6.2 concluídos.
- **2026-11-13** — `/implement 3` (modo com pausa), ordem 03.1 → 03.3 → 03.7 → 03.2 → 03.4 → 03.5 → 03.6 → 03.8 → 03.9 → 03.10; os 10 SIs `completed` no `docs/phases/phase-03-videos/progress.md` (detalhes e observações por SI lá). Principais desvios/decisões de implementação:
  - Imagens MinIO oficiais indisponíveis → fork fixado `pgsty/minio` / `pgsty/mc` (permitido pela TD-07); Redis **sem porta no host** (6379 ocupada pelo `eorbis-redis`).
  - `@nestjs/bullmq` 12 é ESM-only (quebra o Jest) → `^11.0.5` + `bullmq ^6.7.6` + `ioredis`; `library-refs.md` não foi alterado.
  - ffmpeg 5.1 adicionado ao `Dockerfile.dev`; fixtures `test/fixtures/sample.mp4` e `not-a-video.mp4`.
  - Worker: `@Processor('video-processing', { concurrency: 1 })`; última tentativa detectada por `attemptsMade + 1 >= attempts` (confirmado no context7/código do BullMQ) → `failed/processing_error`; `not_a_video` via `UnrecoverableError` (sem stream de vídeo ou "Invalid data found" do ffprobe; erro de leitura do MinIO continua retentável).
  - **Fora do plano:** `start:worker:dev` compila em `dist-worker/` (`tsconfig.worker.json`) porque `deleteOutDir: true` faria API e worker apagarem o `dist/` um do outro; `dist-worker` no `.gitignore`/`tsconfig*.json`.
  - Limpeza horária via `upsertJobScheduler` num provider `MaintenanceScheduler` só do worker; testada contra dois boots (1 scheduler).
  - OpenAPI: 8 rotas em `/videos` decoradas; `openapi.json` regenerado (+845 linhas, export estável). `nestjs-project/CLAUDE.md` atualizado (serviços, prontidão de Redis/MinIO, worker).
- **2026-11-13** — Final verification (sem alterar arquivos; lint rodado sem `--fix`):
  - ✅ e2e: 5 suítes, 66/66 · ✅ `tsc --noEmit` · ✅ `npm run build` (worker em `dist/worker/main.js`).
  - ❌ unit/integration: 39/40 suítes, 230/232 testes — só `migrations.integration-spec.ts`. Erro atual: `Entity metadata for Channel#videos was not found` — **causado pela fase** (o SI-03.3 adicionou `Video` a 10 suítes e esqueceu esta); antes da fase já falhava por outro motivo (`CREATE TYPE` do enum de tokens). Correção: incluir `Video` + `CreateVideos1794571199100`, dropar `videos` e os 2 enums, esperar 3 migrations.
  - ❌ lint: 222 erros + 53 warnings (baseline 150 + 40). Os novos estão em arquivos de teste (`no-unsafe-*` sobre `res.body`, 2 `no-unused-vars`, 1 prettier); nenhum em código de produção novo.
  - Follow-ups registrados no `progress.md`: `npm run test:e2e` sem `--runInBand`; schemas de request vazios no `openapi.json` (export via ts-node sem plugin do swagger, afeta também a fase 02); `processed_at` não preenchido em `file_too_large`/`enqueue_failed`; `library-refs.md` sem o downgrade do `@nestjs/bullmq`.
  - `progress.md` segue `Status: in_progress` até a verificação ficar verde. Passo 7: SIs ✅, final verification ❌.
- **2026-11-13** — Roteiro de correção registrado como **Passo 7B**: cada pendência da DoD vira uma task do pipeline (`migrations-spec-fix`, `test:e2e --runInBand`, `lint-baseline` com `/research`, `phase-03-dod`), mais o opcional `/decide` para o `@nestjs/bullmq` 11, a verificação manual do Compose e o `/implement 3` para a final verification. Nada executado ainda.
- **2026-11-14** — Etapa A confirmada no git: a fase foi commitada num commit único (`34ad8d0`, não um por SI) e mergeada na `dev` pelo PR #1 (`d551ff0`). A `bugfix/migrations-spec` saiu dessa `dev`, então já contém a fase 03.
- **2026-11-14** — Etapa B (task `fix-migrations-integration-spec`, slug diferente do sugerido `migrations-spec-fix`) na `bugfix/migrations-spec`, pipeline completo: `/plan-context` (sem decisions doc próprio; correlator: fases 01, 02-auth e 03) → `/plan-validate` `dirty` (AMB-1 banco compartilhado × suítes paralelas; AMB-2 como descobrir o que derrubar) → `/plan-resolve` (AMB-1: banco compartilhado + execução serial com `--runInBand`; AMB-2: descoberta pelo catálogo `pg_tables`/`pg_type`) → `/plan-validate` `clean` → `/plan-build` (1 SI, sem Tech Specs) → `/implement`. O spec agora derruba, um por vez, todas as tabelas e tipos enum do schema `public`; registra as 3 migrations (inclui `CreateVideos`); tem um teste novo que confere o schema vazio após o reset; o `afterAll` usa `try/finally` e só mexe na conexão se ela abriu. Desvio do plano: DataSource com lista de entidades vazia (a lista parcial quebrava no `Channel#videos`). Resultado: 3/3 testes, duas execuções seguidas, Jest encerra sozinho; o banco ficou com as 3 migrations registradas. Como a `dev` já tinha a fase 03, esta task também cobriu o item (1) da etapa E. Final verification da task: unit/integration ✅ 233/233, `tsc` ✅, e2e ❌ 16/66 (falta `--runInBand`, etapa B'), lint ❌ 218 erros (etapa C). Falta commit + merge na `dev`.
- **2026-11-14** — Etapa B mergeada na `dev` pelo PR #2 (`420b765`; commit `39b84a6`). `bugfix/test-e2e-runinband` criada a partir dessa `dev`.
- **2026-11-14** — Etapa B' (task `test-e2e-runinband`) na `bugfix/test-e2e-runinband`: `/plan-context` (sem decisions doc próprio; correlator: `phase-03-videos` confirmado, herdados da fase 02) → `/plan-validate` `clean` direto (0 issues) → `/plan-build` (1 SI, sem Tech Specs, Phase A e B em duas execuções) → `/implement`. Mudança única: `scripts.test:e2e` = `jest --config ./test/jest-e2e.json --runInBand` (o `nestjs-project/CLAUDE.md` já dizia isso; não foi editado). Final verification: unit/integration ✅ 233/233 · e2e ✅ 66/66 em série pelo script, sem aviso de processo aberto · `tsc` ✅ · build ✅ · lint ❌ 218 erros + 53 warnings pré-existentes. O `--fix` do lint voltou a alterar `test/support/video-e2e.ts` (quebra o `tsc`) e `src/videos/videos.service.integration-spec.ts` — revertidos. `progress.md` da task segue `in_progress` só por causa do lint (etapa C). Falta commit + PR → `dev`.
- **2026-11-14** — Etapa B' mergeada na `dev` pelo PR #3 (`5cd67ce`; commit `39075e0`). `bugfix/lint-baseline` criada a partir dessa `dev`.
- **2026-11-14** — Etapa C (task `lint-baseline`) na `bugfix/lint-baseline`, pipeline completo: `/research lint-baseline` (baseline medido sem `--fix`: **222 erros + 53 warnings**, não 150 + 40; 263 dos 275 em specs, 6 em `channels.service.ts`, 6 em helpers de teste) → `/plan-context` (correlator: fases 01, 02-auth e 03) → `/plan-validate` `dirty` (OQ-1..3) → `/plan-resolve` com as recomendadas — TD-01 C (híbrido: corrigir produção, helpers e defeitos reais + override de `no-unsafe-*` só nos specs), TD-02 A (`eslint-plugin-jest`: `jest/unbound-method` no lugar da regra do core nos specs), TD-03 B (`--max-warnings 0`) → `/plan-validate` `clean` → `/plan-build` (6 SIs, sem Tech Specs; Phase A e B em duas execuções) → `/implement`. Mudanças: `eslint-plugin-jest@^29.17.0`; bloco de override no `eslint.config.mjs` para `*.spec.ts`/`*.integration-spec.ts`/`*.e2e-spec.ts`; `channels.service.ts` sem `as any` (estreita `QueryFailedError.driverError`); `test/support/video-e2e.ts` usa `app.get(MailService)` e valida o `access_token` (fim do problema do `--fix` quebrando o `tsc`); `create-test-data-source.ts` sem `Function`; `async` sem `await`, imports não usados e prettier corrigidos em 5 specs; script `lint` com `--max-warnings 0`; `nestjs-project/CLAUDE.md` documenta o gate e o override. Lint: 222/53 → 24/0 após o override → **0/0**. Final verification: unit/integration ✅ 233/233 (40 suítes) · e2e ✅ 66/66 (5 suítes) · `tsc` ✅ · `npm run lint` ✅ exit 0, sem alterações do `--fix`. `progress.md` da task `completed` (6/6). Cobre também o lint dos testes da fase 03 (etapa E). Falta commit + PR → `dev`.
- **2026-11-14** — Etapa C mergeada na `dev`: commit `dff1711` (inclui este plano, então o 0.5 foi feito na prática), PRs #4 e #5 (merge `54df506`). Etapa D dispensada (a feature já estava na `dev` desde o PR #1).
- **2026-11-14** — Etapas E + H como task `phase-03-dod-closure` (no lugar do slug `phase-03-dod`) na `bugfix/phase-03-dod-closure`: `/plan-context` → `/plan-validate` (AMB-1 escopo de `src/worker/*`; AMB-2 erros × warnings — ambas resolvidas por esclarecimento → `clean`) → `/plan-build` (1 SI, só verificação + documentação) → `/implement`. Sem mudança de código. DoD no container: `npm test -- --runInBand` 40/40 suítes, 233/233 · `npm run test:e2e` 5/5, 66/66 · `tsc --noEmit` exit 0 · `eslint --max-warnings 0` exit 0. `docs/phases/phase-03-videos/progress.md` → `Status: completed`, nota do SI-03.3 trocada pela referência ao PR #2 e seção "DoD técnica" adicionada. Commit `b5312b8`, mergeado na `dev` pelo PR #6 (`28e5e01`). Passo 7 concluído; 7B fica só com G (e F opcional). `video-worker` continua sem subir (`docker compose ps`: db, mailpit, minio, nestjs-api, redis).
- **2026-11-14** — Etapa G na `docs/phase-03-compose-verification` (da `dev` em `28e5e01`), sem alterar código. `docker compose up -d video-worker`: compila em `dist-worker/`, `WorkerModule` sobe sem erro. Redis `PONG`, Postgres `accepting connections`, MinIO `healthy`, `minio-init` `Exited (0)`. API em `start:dev` → 200. Fluxo real pelo host com `test/fixtures/sample.mp4` (14 680 B): register → confirm-email (token pelo Mailpit) → login → `POST /videos` → `part-urls` → `PUT` direto no MinIO (ETag) → `complete` (`processing`) → `ready` em ~1 s com `duration_seconds: 2`, 160×120, h264/aac e `thumbnail_url`. Thumbnail 200 `image/jpeg`, stream com `Range: bytes=0-1023` → **206**, download → 200 com `Content-Disposition: attachment; filename="sample.mp4"`. Vídeo de teste `IXOAW90Pu7K`, de um usuário `g-check-*@example.com`, ficou no banco de dev. **Parada limpa ❌:** `docker compose stop video-worker` termina em ~1 s com `Exited (1)` e o SIGTERM não chega ao Node (detalhes em Pendências). G fica aberta até o bugfix.
- **2026-11-14** — Bugfix da parada limpa (task `video-worker-graceful-stop`) na `bugfix/video-worker-graceful-stop`, pipeline completo: `/plan-context` (correlator: fases 03 e 01) → `/plan-validate` `dirty` (MD-1 estratégia de start; AMB-1 `stop_grace_period`) → `/research video-worker-graceful-stop` (TD-01 estratégia de start, TD-02 grace period; achado: o `nest start --watch` não trata SIGTERM e não espera o filho, então tirar só o `npm` não resolve; `node --watch` repassa o sinal e espera, testado) → `/plan-context` → `/plan-validate` (OQ-1/OQ-2) → `/plan-resolve` com as recomendadas — TD-01 B (`tsc --watch` em background + `node --watch` como PID 1), TD-02 B (`stop_grace_period: 200s`, acima dos timeouts de probe 60 s + thumbnail 120 s) → `/plan-validate` `clean` → `/plan-build` (4 SIs, sem Tech Specs) → `/implement`. Mudanças: `scripts/start-worker-dev.sh` novo; `start:worker:dev` chama o script; `compose.yaml` do `video-worker` com `command: ["sh", "scripts/start-worker-dev.sh"]` + `stop_grace_period: 200s` (`nestjs-api` inalterado); `nestjs-project/CLAUDE.md` atualizado. Verificação no serviço real: parada ociosa 0,53 s → `Exited (0)`, sem `npm error`; parada com job ativo (MinIO pausado para segurar o `ffprobe`) esperou ~8 s até o job terminar → vídeo `ready`, job `completed`, sem stall, `Exited (0)` (linha e thumbnail de teste removidas); editar `src/` → recompila e reinicia. DoD no container: unit/integration 40/40, 233/233 · e2e 5/5, 66/66 · `tsc` ✅ · lint ✅. Processador e filas intocados. Etapa G concluída. Falta commit + PR → `dev`.
- **2026-11-14** — `bugfix/video-worker-graceful-stop` commitada (`6edbadb`) e mergeada na `dev` pelo PR #8 (`f9bf1e2`); a verificação do Compose (etapa G) já tinha entrado pelo PR #7 (`0e300c3`). Passo 7B concluído (F opcional, não feito). `main` ainda no PR #4 (`0d34e3c`) — atrás da `dev`. Branch `docs/phase-03-closure` criada da `dev` (`f9bf1e2`) para o Passo 8; 8.4 reescrito (a fase já está na `dev`: o PR final é `docs/phase-03-closure` → `dev` e, depois, `dev` → `main`).
- **2026-11-14** — Passo 8.1 na `docs/phase-03-closure` (código = `dev` em `f9bf1e2`): `docker compose up -d` → 7 serviços, `video-worker` sobe e compila sem erro (`WorkerModule` inicializado, "Found 0 errors"), `minio-init` `Exited (0)`, Redis `PONG`, API 200. `migration:run` → "No migrations are pending". `npm test -- --runInBand` 40/40 suítes, 233/233 · `npm run test:e2e` 5/5, 66/66 · `tsc --noEmit` exit 0 · `npm run lint` exit 0 (o `--fix` não alterou arquivos) · `npm run build` exit 0. Passo 8.1 concluído.
- **2026-11-14** — Roteiro do 8.2 reescrito como task do pipeline (`phase-03-closure-docs`, sem research/test-specs), cobrindo o `CLAUDE.md` da raiz e a nota do SI-03.3 no `progress.md` da fase (subitens 8.2a–8.2e).
- **2026-11-14** — Passo 8.2 como task `phase-03-docs-closure` (slug diferente do sugerido `phase-03-closure-docs`) na `docs/phase-03-closure2` (da `dev` em `55007ca`, já que a `docs/phase-03-closure` foi mergeada no PR #9): `/plan-context` (sem decisions doc próprio; os subagentes correlator e phases-reader foram interrompidos, então `context.md` ficou sem herdados — marcados como "Not collected") → `/plan-validate` `clean` direto (fast path, 0 issues) → `/plan-build` (3 SIs, sem Tech Specs, Phase A e B na mesma execução) → `/implement`. Mudanças: nota do SI-03.3 → `Resolvido (PR #3, commit 39075e0)`; `CLAUDE.md` da raiz — Repository Structure com os módulos reais da API e o `next-frontend/` existente (Next.js 16), Architecture com BullMQ + Redis (filas `video-processing`/`video-maintenance`), container `video-worker` e MinIO (`minio` + `minio-init`), conferidos contra o `compose.yaml`. Só `.md`. DoD no container: unit/integration 40/40, 233/233 · e2e 5/5, 66/66 · `tsc` ✅ · lint ✅. Commit `d3c0e2b`, PR #10 → `dev` aberto.
- **2026-11-14** — PR #10 mergeado na `dev` (`79f78a0`). Passo 8.3 (checklist dos critérios de aceite, só leitura, contra a `dev` em `79f78a0`): **todos os critérios atendidos** — decisions doc `decided` (TD-01..TD-09); pasta da fase completa com `validation.md` `clean`; plano com SI-03.1..03.10, Data Model, API Contracts, Authorization Matrix, Error Catalog, Events/Messages, Dependency Map e Deliverables; limite de 10737418240 bytes + multipart presigned + `draft`/`uploading`; worker grava duração/dimensões/codecs e `thumbnail_key`; `public_id` 11 chars `UNIQUE`; stream (206 + `Content-Range`) e download (`attachment`) via presigned GET; enums de status com transições condicionais; `minio`/`minio-init`/`redis`/`video-worker` no compose; `CreateVideos` com FK `channel_id → channels(id)`; `tsc --noEmit` exit 0 e `eslint --max-warnings 0` (sem `--fix`) exit 0 rodados de novo; testes não reexecutados (os specs de integração limpam o banco de dev) — vale a última execução do 8.1 (233/233, e2e 66/66); `CLAUDE.md` coerente com o compose. Na sequência, conferência contra o enunciado completo do desafio (Git Flow, fork, CLAUDE.md): fork público `romulofsouto/mba-ia-greenfield-project` (parent `devfullcycle`) ✅; workflow research → context → validate ⇄ resolve → build → test-specs → implement com artefatos ✅; módulo segue `Repository<Video>` injetado como `auth/` ✅. **Não atendidos:** (1) falta a seção de vídeos no `nestjs-project/CLAUDE.md` (módulo, endpoints, fila/worker, storage); (2) a `main` está defasada da `dev` (PR #4 levou estado intermediário; `CLAUDE.md` da raiz na `main` ainda com `Message Queue (TBD)`). Desvio de Git Flow: PR #4 `bugfix/lint-baseline` → `main`. Detalhes e correções em "Pendências abertas". Passo 8.3 concluído na `docs/phase-03-acceptance-checklist` — a fase **ainda não** cumpre todos os critérios.
- **2026-11-14** — PR #11 (`dev` → `main`, `c5d5d62`) mergeado: `main` idêntica à `dev`, lacuna 2 do 8.3 resolvida. Na `docs/phase-03-videos-docs` (da `docs/phase-03-acceptance-checklist`): lacuna 1 resolvida com a seção `## Videos (Phase 03)` no `nestjs-project/CLAUDE.md` (cada afirmação conferida contra `src/videos`, `src/storage/storage.keys.ts`, `src/queue/queue.constants.ts`, `src/worker/maintenance-scheduler.ts` e `.env.example`); `CLAUDE.md` da raiz "two" → "three main areas"; `README.md` atualizado para o estado real da Fase 03. Só `.md`; sem impacto em testes/tsc/lint.
- **2026-11-14** — Reavaliação das pendências documentais restantes do 8.3: (1) `software-arch.mermaid` → fora do escopo, por restrição (diagrama da arquitetura-alvo, não editável); (2) checkboxes de Deliverables → não é pendência (a `phase-02-auth.md` deixa os 22 itens `[ ]`; o `/implement` não os marca; plano não se edita à mão); (3) `library-refs.md` com `@nestjs/bullmq ^12.0.1` → mantido: o `/plan-resolve` não reescreve versão de entrada existente e só roda com `validation.md` `dirty` ou sem o arquivo; a cascata necessária regeraria o plano de uma fase implementada; divergência rastreável no `progress.md` (SI-03.4). Nenhuma pendência bloqueante restante.

---

Fluxo oficial do projeto:
`/research → /plan-context → /plan-validate ⇄ /plan-resolve → /plan-build → [/plan-test-specs] → /implement → fechamento`

---

## Status do ambiente (última verificação: 2026-11-14)

| Item | Situação |
|------|----------|
| Containers `db`, `mailpit`, `nestjs-api`, `redis`, `minio`, `video-worker` (+ `minio-init` `Exited (0)`) | ✅ rodando — API em `start:dev` · `video-worker` subido no 8.1 |
| API `http://localhost:3000` | ✅ 200 |
| Migrations | ✅ `CreateUsersAndChannels`, `CreateAuthTokens`, `CreateVideos` (run → revert → run validado no SI-03.3) |
| Suíte de testes (2026-11-14, Passo 8.1, `dev` em `f9bf1e2`) | ✅ unit/integration 233/233 (40 suítes) · e2e 66/66 (5 suítes) · tsc ✅ · lint 0 erros / 0 warnings (`--max-warnings 0`) · build ✅ |
| MCP postgres | ✅ conectado |
| Branch atual | `docs/phase-03-closure2` (da `dev` em `55007ca`; PR #10 aberto). A `docs/phase-03-closure` (8.1, da `dev` em `f9bf1e2`) foi mergeada no PR #9. A `dev` contém a fase 03 (PR #1) e todos os bugfixes da 7B: `migrations-spec` (PR #2), `test-e2e-runinband` (PR #3), `lint-baseline` (PRs #4/#5), `phase-03-dod-closure` (PR #6), verificação do Compose (PR #7), `video-worker-graceful-stop` (PR #8). A `main` está no PR #4 (`0d34e3c`) |
| `next-frontend/package-lock.json` | ✅ revertido (pode voltar após `npm install` no container do front — basta reverter de novo) |
| MCP context7 | ✅ conectado via plugin (OAuth) — tools `mcp__plugin_context7_context7__*` |
| ffmpeg no container | ✅ ffmpeg 5.1 no `Dockerfile.dev` (imagem reconstruída) |
| Artefatos da fase 03 | ✅ tudo commitado (`1c25bc0` … `34ad8d0`) e mergeado na `dev` (`d551ff0`) · task `fix-migrations-integration-spec` mergeada na `dev` (PR #2) · task `test-e2e-runinband` mergeada na `dev` (PR #3) · task `lint-baseline` mergeada (PRs #4/#5) · task `phase-03-dod-closure` mergeada (PR #6) · task `video-worker-graceful-stop` mergeada (PR #8) · este plano versionado desde `dff1711` |

---

## Armadilhas conhecidas (leia antes de começar)

1. **Nome da pasta da fase**: o slug é `phase-03-videos`. A pasta deve ser `docs/phases/phase-03-videos/` (mesmo padrão de `phase-02-auth`). Se alguma skill tentar criar `phase-03-phase-03-videos`, interrompa e corrija.
2. **Pergunta de UI no `/plan-context`**: a heurística detecta "UI" dentro de "arq**ui**vos". Responda **(b) Proceed without inventory (UI↔API sync deferred)** — frontend está fora do escopo.
3. **Testing guide x enunciado**: `testing-guide-nestjs-project/references/external-systems.md` diz "storage = filesystem local" nos testes; o enunciado exige **MinIO real**. Isso precisa virar TD no research e ser corrigido num SI.
4. **MD-N no `/plan-resolve` (phase mode) aborta** e manda rodar `/research` de novo. É o comportamento esperado.
5. **`library-refs.md` obrigatório**: se o validate ficar `clean` sem `library-refs.md`, rode `/plan-resolve 3` mesmo assim (modo library-cache-only), senão o `/plan-build` aborta.
6. **Test Specs pendentes**: se o plano gerado tiver `**Test Specs:** _pending_`, o `/plan-test-specs 3` passa a ser **obrigatório** antes do `/implement`.
7. Todo `npm`/`npx`/teste roda **dentro do container**: `docker compose exec nestjs-api ...`. Hosts sempre pelo nome do serviço (`db`, `minio`, `redis`), nunca `localhost`.
8. Nunca commitar na `main`.

---

## [ ] PASSO 0 — Preparação (você executa no terminal, sem skill)

- [x] **0.1** Descartar alteração fora do escopo *(feito em 2026-11-12)*
- [x] **0.2** Git Flow: criar `dev` (push) e `feature/phase-03-videos` *(feito em 2026-11-12)*
- [x] **0.3** context7 conectado *(feito em 2026-11-11 via plugin + OAuth)*
- [x] **0.4** Baseline da suíte verde (unit, e2e, tsc, lint) *(executada em 2026-11-12 — ⚠️ não verde: spec de migrations + lint pré-existentes; ver Histórico)*
- [x] **0.5** Commitar este plano na branch da feature (opcional) *(entrou no commit `dff1711` da `bugfix/lint-baseline`)*

```bash
cd /home/romulo/Documents/MBA/mba-ia-greenfield-project

# 0.1 descartar alteração fora do escopo
git restore next-frontend/package-lock.json

# 0.2 Git Flow
git checkout main && git pull
git checkout -b dev && git push -u origin dev
git checkout -b feature/phase-03-videos
```

0.3 — ✅ **Concluído.** O context7 está ativo como plugin do Claude Code (`/mcp` → `plugin:context7:context7` → Authenticate).
Não é necessário editar `.mcp.json`. Observação: as skills citam `mcp__context7__query-docs` / `mcp__context7__resolve-library-id`;
no plugin as tools equivalentes são `mcp__plugin_context7_context7__query-docs` / `…resolve-library-id` (não há `allowed-tools` restringindo, então funciona).
Para conferir a qualquer momento: `/mcp` (context7 ✔ connected).

0.4 — Baseline da suíte (deve estar verde antes de começar):
```bash
cd nestjs-project
docker compose exec nestjs-api npm test -- --runInBand
docker compose exec nestjs-api npm run test:e2e
docker compose exec nestjs-api npx tsc --noEmit
docker compose exec nestjs-api npm run lint
```
0.5 — (opcional) versionar este plano:
```bash
git add PLANO_EXECUCAO_FASE3.md
git commit -m "adiciona plano de execução da fase 03"
```
**Critério para avançar:** branch `feature/phase-03-videos` ativa, context7 conectado, baseline verde.

---

## [ ] PASSO 1 — Research → `docs/decisions/technical-decisions-phase-03-videos.md`

- [x] 1.1 Rodar `/research phase 03` com o prompt abaixo *(feito em 2026-11-12)*
- [ ] 1.2 Revisar Scope/Capability das 9 TDs
- [x] 1.3 Preencher `**Decision:**` (ou deixar para o Passo 4) *(feito no Passo 4 em 2026-11-12)*
- [x] 1.4 Commit do doc de decisões *(feito em 2026-11-12 — `1c25bc0`)*

**Prompt** (janela nova):
```
/research phase 03

Salve o documento como docs/decisions/technical-decisions-phase-03-videos.md
(slug phase-03-videos, scope_type: phase, related_phases: [3], fase monolítica, sem covers_capabilities).
Escopo: somente backend (nestjs-project/) + infra Docker. next-frontend/ está fora do escopo desta fase — justifique isso em _Subprojects in scope_.

Consulte as versões instaladas em nestjs-project/package.json e use o context7 para as libs.
As decisões que obrigatoriamente precisam estar cobertas, cada uma com opções, trade-offs e recomendação:
1. Tecnologia da fila (decisão principal de stack; o projeto marca como TBD) — comparar BullMQ+Redis, RabbitMQ e pg-boss.
2. Estratégia de upload de até 10GB sem passar o arquivo pela API — comparar S3 multipart com URLs pré-assinadas, tus e PUT pré-assinado único (considerar o limite de 5GB do PUT único).
3. Como o worker roda (container separado x in-process) e como extrai metadados/gera thumbnail (ffprobe/ffmpeg via child_process x wrapper como fluent-ffmpeg — verificar manutenção).
4. Estratégia de URL única por vídeo (slug curto aleatório x UUID x hashids) e tratamento de colisão.
5. Streaming sem download completo (Range / 206 Partial Content: URL pré-assinada do MinIO x proxy na API x HLS) e download do vídeo.
6. Ciclo de status do vídeo (rascunho → processando → pronto/erro), gatilho do processamento, retries e o que acontece em falha.
7. Organização do object storage (S3/MinIO já é dado): buckets/prefixos de chaves, variáveis de ambiente, endpoint interno (nome do serviço Docker) x endpoint público para URLs pré-assinadas.
8. Limites/políticas: tamanho máximo, tamanho de parte, tipos MIME aceitos, uploads multipart abandonados.
9. Estratégia de testes para storage e fila: MinIO e Redis reais do Compose (o enunciado proíbe mockar o que roda no Compose; o testing guide atual sugere filesystem local — tratar esse conflito).

Aplique o teste (d)+(a) da skill para descartar detalhes de implementação. Deixe **Decision:** como _[pending]_.
```
**Revisão sua:** cada TD tem `**Scope:**` e `**Capability:**` com bullet literal do `docs/project-plan.md` (Fase 03)? Recomendações justificadas pelo contexto do projeto?
Depois preencha os `**Decision:**` (ou deixe o `/plan-resolve` perguntar no Passo 4).
```bash
git add docs/decisions/technical-decisions-phase-03-videos.md
git commit -m "research da fase 03: fila, upload, worker, streaming e ciclo de status"
```
**Critério para avançar:** arquivo criado com todas as 9 decisões.

---

## [ ] PASSO 2 — Contexto → `docs/phases/phase-03-videos/context.md`

- [x] 2.1 Rodar `/plan-context 3` *(feito em 2026-11-12)*
- [ ] 2.2 Revisar frontmatter e seções obrigatórias *(checagem mecânica ok: `kind: phase`, `name: phase-03-videos`, `sources_mtime` com 7 fontes, seções obrigatórias presentes — falta sua leitura)*

**Prompt** (janela nova):
```
/plan-context 3

Observações:
- A pasta da fase deve ser docs/phases/phase-03-videos/ (mesmo padrão de docs/phases/phase-02-auth/).
- Se perguntar sobre screen inventory/UI, a resposta é: proceed without inventory (UI↔API sync deferred) — frontend fora do escopo.
- Se o decisions-correlator sugerir docs ad-hoc, mantenha os relevantes para o backend (ex.: openapi-docs-nestjs).
```
**Revisão sua:** frontmatter `kind: phase`, `name: phase-03-videos`, `sources_mtime`; seções `## Capability Coverage`, `## Decisions Detail`, `## Inherited Conventions` presentes.
**Critério para avançar:** `context.md` gerado na pasta correta.

---

## [x] PASSO 3 — Validação → `docs/phases/phase-03-videos/validation.md`

- [x] 3.1 Rodar `/plan-validate 3` *(feito em 2026-11-12)*
- [x] 3.2 Registrar resultado: `clean` / `dirty` (rodada nº __) *(rodada 1: `dirty` — 9 OQ + 1 AMB · rodada 2: `clean`)*

**Prompt** (janela nova):
```
/plan-validate 3
```
- `status: clean` → vá para o Passo 4 apenas se ainda não existir `library-refs.md` (ver armadilha 5); senão vá ao Passo 5.
- `status: dirty` → Passo 4.

---

## [x] PASSO 4 — Resolução (repetir 3 ⇄ 4 até clean)

- [x] 4.1 Rodar `/plan-resolve 3` *(rodada 1 em 2026-11-12)*
- [x] 4.2 `library-refs.md` gerado *(4 libs via context7)*
- [x] 4.3 Todas as `**Decision:**` preenchidas *(9/9)*
- [x] 4.4 `validation.md` final com `status: clean`, `issue_count: 0` *(rodada 2 em 2026-11-12)*
- [x] 4.5 Commit do planejamento *(feito em 2026-11-12 — `a7b8042`)*

**Prompt** (janela nova):
```
/plan-resolve 3

Use o context7 para todas as bibliotecas decididas e gere docs/phases/phase-03-videos/library-refs.md.
```
- Se abortar por **MD-N** → faça em janela nova:
  ```
  /research <tópico da decisão faltante> com related_phases: [3]
  ```
  (ou peça para complementar o `technical-decisions-phase-03-videos.md`), depois refaça **Passo 2 → Passo 3**.
- Se editar o doc de decisões manualmente → refaça o **Passo 2** (artefatos ficam stale).
- Após cada resolve → volte ao **Passo 3**.

```bash
git add docs/decisions docs/phases/phase-03-videos
git commit -m "planejamento fase 03: contexto, validação clean e library-refs"
```
**Critério para avançar:** `validation.md` com `status: clean`, `issue_count: 0`; `library-refs.md` existe; doc de decisões com todos os `**Decision:**` preenchidos.

---

## [ ] PASSO 5 — Plano executável → `docs/phases/phase-03-videos/phase-03-videos.md`

- [x] 5.1 Rodar `/plan-build 3` *(feito em 2026-11-12)*
- [ ] 5.2 Revisar Technical Specifications na pausa da Phase A *(na pausa você escolheu "Continuar agora" — revisar no arquivo)*
- [ ] 5.3 Conferir SIs, Dependency Map e Deliverables
- [x] 5.4 Verificar `**Test Specs:** _pending_` (define se o Passo 6 é obrigatório) *(2 placeholders — SI-03.5, SI-03.6 → Passo 6 obrigatório)*
- [x] 5.5 Commit do plano *(feito em 2026-11-12 — `0270b34`)*

**Prompt** (janela nova):
```
/plan-build 3

O plano precisa conter:
- Step Implementations SI-03.x, cada uma com Technical actions rastreáveis a phase-03-videos/TD-NN, Tests (sufixos *.spec.ts, *.integration-spec.ts, *.e2e-spec.ts) e Acceptance criteria.
- Technical Specifications: Data Model (tabela videos ligada a channels: id, canal dono, título, status, chaves de storage do arquivo e do thumbnail, duração, metadados, identificador da URL única), API Contracts, Authorization Matrix, Error Catalog e Events/Messages (job da fila: payload, producer, consumer, trigger, semântica de entrega, retries).
- Dependency Map e Deliverables (incluindo npm test, npm run test:e2e, npx tsc --noEmit, npm run lint, npm run build).
- Infra no nestjs-project/compose.yaml: object storage (MinIO), broker da fila e container do worker com FFmpeg.
- Migration <timestamp>-CreateVideos.ts.
- Testes de storage e fila contra MinIO/broker reais do Compose (sem mocks onde dá para testar de verdade).
- Um SI final de documentação: atualizar o testing guide (storage real), CLAUDE.md da raiz, nestjs-project/CLAUDE.md, README.md e docs/diagrams/software-arch.mermaid refletindo o código real.
Reuse os padrões existentes: guard JWT global + @Public(), @CurrentUser(), DomainException + filtro, configs namespaced com Joi, ChannelsService, envelope OpenAPI de erro.
```
- Na pausa da **Phase A** (Technical Specifications), revise e escolha continuar.
- Ao final, verifique se há `**Test Specs:** _pending_` no plano → se sim, faça o Passo 6 (obrigatório).

Fatiamento de referência para conferir (a decisão final é do plano):
1. Dependências + config Joi + compose (MinIO + bucket, broker, worker) + `.env.example`
2. Entidade `Video` + migration + teste de migration
3. Storage (multipart init / URLs das partes / complete / abort / presign GET) — integration com MinIO real
4. Producer da fila — integration com broker real
5. `POST /videos` (pré-cadastro em rascunho + slug único + início do multipart)
6. Conclusão do upload → status processando → enfileira job
7. Worker: ffprobe (duração/metadados) + ffmpeg (thumbnail) → pronto/erro com retry
8. Streaming (206 com Range) + download + thumbnail
9. E2E do fluxo completo
10. Documentação (testing guide, CLAUDE.md, README, diagrama)

```bash
git add docs/phases/phase-03-videos
git commit -m "plano executável da fase 03 com SIs, specs técnicas e dependências"
```
**Critério para avançar:** plano com SIs, as 5 Technical Specs, Dependency Map e Deliverables.

---

## [x] PASSO 6 — Test Specs (opcional; obrigatório se houver `_pending_`)

- [x] 6.1 Rodar `/plan-test-specs 3` (ou marcar ⏭️ se não houver `_pending_`) *(feito em 2026-11-12 — 2 specs)*
- [x] 6.2 Commit das specs *(`e84a1d4`)*

**Prompt** (janela nova):
```
/plan-test-specs 3
```
```bash
git add nestjs-project/specs docs/phases/phase-03-videos
git commit -m "specs de teste da fase 03"
```

---

## [x] PASSO 7 — Implementação SI a SI → código + `progress.md`

- [x] SI-03.1 Infra: Redis, MinIO e contrato de ambiente
- [x] SI-03.2 Implementar StorageModule sobre S3/MinIO
- [x] SI-03.3 Criar entidade Video, migração e identificador público
- [x] SI-03.4 Configurar fila BullMQ e produtor de processamento
- [x] SI-03.5 Endpoints de upload multipart com pré-cadastro em rascunho
- [x] SI-03.6 Endpoints de consulta, streaming e download
- [x] SI-03.7 Implementar extração de metadados e thumbnail com FFmpeg
- [x] SI-03.8 Implementar worker de processamento de vídeo
- [x] SI-03.9 Implementar limpeza agendada de uploads abandonados
- [x] SI-03.10 Documentar API de vídeos e ambiente
- [x] Final verification (suíte completa + tsc + lint + build) *(2026-11-13 não verde; refeita em 2026-11-14 pela task `phase-03-dod-closure`: unit 233/233, e2e 66/66, tsc e lint ✅; build ✅ na B')*

> Nomes atualizados para os SIs reais do plano gerado no Passo 5 (2026-11-12). Ordem sugerida: 03.1 → 03.3 → 03.7 → 03.2 → 03.4 → 03.5 → 03.6 → 03.8 → 03.9 → 03.10.

**Prompt** (janela nova — usar só no início):
```
/implement 3

Modo padrão: pause após cada SI com "Seguir para SI-03.x?".
Todos os comandos npm/npx/testes dentro do container (docker compose exec nestjs-api ...), conforme nestjs-project/CLAUDE.md.
Consulte o context7 / library-refs.md antes de usar cada lib.
```
- A cada pausa: revise o código, rode os testes do SI se quiser conferir e faça o commit:
  ```bash
  git add -A && git commit -m "SI-03.x: <motivo curto da mudança>"
  ```
- Responda "sim" para seguir ao próximo SI.
- **Para continuar em uma janela nova** (recomendado a cada 2–3 SIs para não estourar o contexto):
  ```
  /implement 3
  ```
  A skill lê o `progress.md` e retoma do próximo SI pendente.
- Se o compose mudar (novos serviços), suba de novo: `docker compose up -d --build` e confirme `docker compose ps`.
- No final ela pergunta **"Rodar final verification?"** → responda sim (suíte completa + tsc + lint + build).

**Critério para avançar:** `progress.md` com `Status: completed` e todos os SIs `completed`.

---

## [x] PASSO 7B — Correções para fechar a Definition of Done (pipeline em modo task)

> Origem: final verification de 2026-11-13 (ver Histórico). Bloqueios de reprovação automática: suíte vermelha (`migrations.integration-spec.ts`), lint quebrado (222 erros), `video-worker` nunca subido, CLAUDE.md inconsistente (`test:e2e` sem `--runInBand`; Message Queue "TBD" na raiz).
> Cada pendência vira uma **task** do pipeline (`docs/tasks/task-<slug>/` com context, validation, plano e progress), deixando a IA observável também nas correções. Cada comando de skill em **janela nova** (`/clear`). Se um `validation.md` vier `dirty`: `/plan-resolve <slug>` → `/plan-validate <slug>` até `clean`.

| Etapa | O quê | Branch | Skills |
|---|---|---|---|
| A | Commitar a fase | `feature/phase-03-videos` | git |
| B | Spec de migrations (pré-existente) + `--runInBand` no `test:e2e` | `bugfix/migrations-spec`, `bugfix/test-e2e-runinband` (da `dev`) | context → validate → build → implement |
| C | Lint pré-existente (150 erros) | `bugfix/lint-baseline` (da `dev`) | **research** → context → validate → resolve → build → implement |
| D | Trazer os bugfixes para a feature | `feature/phase-03-videos` | git (`merge dev`) |
| E | O que a fase introduziu (spec de migrations com `videos` + lint dos testes novos) | `feature/phase-03-videos` | context → validate → build → implement |
| F | (opcional) `@nestjs/bullmq` 11 na TD-01 e `library-refs.md` | `feature/phase-03-videos` | **decide** → context 3 → validate 3 → build 3 → test-specs 3 |
| G | Compose real: worker, upload → `ready`, parada limpa | — | manual |
| H | Final verification da fase | `feature/phase-03-videos` | **`/implement 3`** |

- [x] **A** Commitar a fase *(commit único `34ad8d0`, mergeado na `dev` pelo PR #1 — `d551ff0`)*
- [x] **B** `bugfix/migrations-spec` mergeado na `dev` *(PR #2 — `420b765`, em 2026-11-14)*
- [x] **B'** `bugfix/test-e2e-runinband` mergeado na `dev` *(PR #3 — `5cd67ce`, em 2026-11-14)*
- [x] **C** `bugfix/lint-baseline` mergeado na `dev` *(commit `dff1711`, PRs #4/#5 — `54df506`, em 2026-11-14)*
- [x] **D** ⏭️ não se aplica *(a feature já estava na `dev` desde o PR #1; correções saíram direto da `dev`)*
- [x] **E** task `phase-03-dod-closure` implementada e commitada *(itens já resolvidos em B e C; a task só verificou a DoD e fechou o `progress.md` — commit `b5312b8`, PR #6 — `28e5e01`)*
- [ ] **F** (opcional) revisão da TD-01 registrada
- [x] **G** verificação manual do Compose *(2026-11-14: worker sobe, upload real → `ready` com thumbnail, stream 206 e download ✅; parada limpa ✅ após a task `video-worker-graceful-stop` — PRs #7/#8, `f9bf1e2`)*
- [x] **H** final verification verde, `progress.md` com `Status: completed` *(feito pela task `phase-03-dod-closure`, sem rodar `/implement 3`)*

> **Alternativa mais curta:** fazer B e C direto na `feature/phase-03-videos` (tasks separadas, commits separados). Elimina a etapa D e os conflitos; não fere o Git Flow do enunciado, só abre mão da regra "não misturar escopos" do `CLAUDE.md`.

### A — Commitar a fase (terminal)
```bash
cd /home/romulo/Documents/MBA/mba-ia-greenfield-project
git status
# exemplo — repita por SI com os arquivos de cada um (lista em docs/phases/phase-03-videos/progress.md)
git add nestjs-project/compose.yaml nestjs-project/.env.example nestjs-project/package*.json nestjs-project/src/config nestjs-project/src/app.module.ts
git commit -m "SI-03.1: Redis, MinIO e variáveis de ambiente para upload de vídeos"
# ... SI-03.3, 03.7, 03.2, 03.4, 03.5, 03.6, 03.8, 03.9, 03.10
git add docs/phases/phase-03-videos/progress.md .claude/skills/testing-guide-nestjs-project
git commit -m "progresso da fase 03 e testing guide com MinIO/Redis reais"
git status   # deve ficar limpo
```
Ou, numa janela nova: *"Agrupe as mudanças não commitadas por SI conforme docs/phases/phase-03-videos/progress.md e faça um commit por SI na branch atual."*

### B — Spec de migrations pré-existente (task sem research)
```bash
git checkout dev && git pull
git checkout -b bugfix/migrations-spec
```
**B1** (janela nova) — slug sugerido `migrations-spec-fix`; se perguntar de UI: "proceed without inventory":
```
/plan-context "Corrigir src/database/migrations.integration-spec.ts do nestjs-project, que falha desde a fase 02: o beforeAll derruba as tabelas mas não o tipo verification_tokens_type_enum, então CreateAuthTokens falha no CREATE TYPE; os DROP rodam em paralelo (Promise.all); e quando o afterAll falha, o destroy() não roda e o Jest não encerra. O spec precisa limpar tabelas e tipos enum de forma sequencial, sempre fechar a conexão e deixar o banco compartilhado migrado ao final. Somente nestjs-project, sem alterar migrations existentes."
```
**B2** `/plan-validate migrations-spec-fix` (esperado `clean` direto) · **B3** `/plan-build migrations-spec-fix` · **B4**:
```
/implement migrations-spec-fix

Comandos npm/npx/testes dentro do container (docker compose exec nestjs-api ...), conforme nestjs-project/CLAUDE.md.
```
**B5**
```bash
git add -A && git commit -m "corrige spec de migrations que derrubava o banco e travava o Jest"
git push -u origin bugfix/migrations-spec   # PR → dev, merge
```
**B'** — mesma sequência em `bugfix/test-e2e-runinband` (da `dev`), com:
```
/plan-context "O script npm run test:e2e do nestjs-project não usa --runInBand, mas o nestjs-project/CLAUDE.md afirma que já está configurado e as suítes e2e compartilham o banco. Adicionar --runInBand ao script test:e2e para alinhar código e documentação."
```
→ `/plan-validate <slug>` → `/plan-build <slug>` → `/implement <slug>` → commit, push, PR → `dev`.

### C — Lint pré-existente (task com research: a estratégia é uma decisão)
```bash
git checkout dev && git pull
git checkout -b bugfix/lint-baseline
```
**C1** (janela nova):
```
/research lint-baseline

Escopo (ad-hoc, related_phases: []): o npm run lint do nestjs-project tem 150 erros e 40 warnings pré-existentes (no-unsafe-member-access/assignment/argument/call/return, unbound-method, require-await), quase todos em arquivos de teste (test/auth.e2e-spec.ts, auth.service.spec.ts...) e 6 em src/channels/channels.service.ts. A Definition of Done exige npm run lint passando.
Compare opções com trade-offs e recomendação:
1. Corrigir o código: tipar res.body do supertest (helpers/DTOs de resposta), tipar mocks, remover async sem await.
2. Override de regras no eslint.config.mjs só para *.spec.ts / *.integration-spec.ts / *.e2e-spec.ts.
3. Combinação: corrigir produção (channels.service.ts) e testes com tipagem, aceitando override pontual onde a tipagem não agrega.
Consulte a versão instalada do ESLint/typescript-eslint em nestjs-project/package.json e o context7.
Deixe **Decision:** como _[pending]_.
```
**C2** `/plan-context lint-baseline` · **C3** `/plan-validate lint-baseline` (esperado `dirty`) · **C4** `/plan-resolve lint-baseline` (escolher a opção) → repetir C3 até `clean` · **C5** `/plan-build lint-baseline` · **C6**:
```
/implement lint-baseline

Comandos dentro do container. Meça o lint sem --fix (npx eslint "{src,apps,libs,test}/**/*.ts"); o critério é 0 erros.
```
**C7**
```bash
git add -A && git commit -m "zera erros de lint pré-existentes da fase 02"
git push -u origin bugfix/lint-baseline   # PR → dev, merge
```

> **Atualização 2026-11-14:** a `feature/phase-03-videos` já foi mergeada na `dev` (PR #1), então as próximas correções saem direto da `dev` (uma branch por pendência) e a etapa D só é necessária se você voltar a trabalhar na `feature/phase-03-videos`. Na etapa C, meça o lint sem `--fix` (`npx eslint "{src,apps,libs,test}/**/*.ts"`): o `npm run lint` com `--fix` quebra o `tsc` em `test/support/video-e2e.ts`.

### D — Trazer os bugfixes para a feature
```bash
git checkout feature/phase-03-videos
git merge dev
# conflito provável nos specs de auth (fase adicionou Video às entidades; bugfix tipou os mesmos arquivos): manter as duas mudanças
cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit
```

### E — O que a fase introduziu (task na feature)
**E1** (janela nova) — slug sugerido `phase-03-dod`; se o correlator sugerir `lint-baseline`, **incluir**:
```
/plan-context "Fechar a Definition of Done da fase 03 (docs/phases/phase-03-videos/progress.md): (1) src/database/migrations.integration-spec.ts falha com 'Entity metadata for Channel#videos was not found' porque o SI-03.3 adicionou o OneToMany Channel→Video e o spec não registra Video nem a migration CreateVideos1794571199100; o spec deve registrá-las, limpar a tabela videos e os enums videos_processing_status_enum / videos_editorial_status_enum e esperar 3 migrations. (2) Zerar os erros de lint nos arquivos de teste criados pela fase 03 (test/videos-*.e2e-spec.ts, test/support/video-e2e.ts, src/videos/*.spec.ts e *.integration-spec.ts, src/worker/*), seguindo a decisão de lint-baseline. Somente nestjs-project."
```
**E2** `/plan-validate phase-03-dod` (até `clean`) · **E3** `/plan-build phase-03-dod` · **E4** `/implement phase-03-dod` · **E5** `git add -A && git commit -m "fecha DoD da fase 03: spec de migrations com videos e lint dos testes novos"`

### F — (Opcional) `@nestjs/bullmq` 11 rastreável nos artefatos
**F1** (janela nova) — deve cair em **Revision** da TD-01:
```
/decide

Na fase 03, o @nestjs/bullmq 12 é ESM-only e quebra o Jest (CommonJS); foi instalado ^11.0.5 (peer bullmq ^6) com ioredis. Isso muda só o parâmetro de versão da TD-01 (fila BullMQ + Redis), não a opção escolhida.
```
**F2** `/plan-context 3` → `/plan-validate 3` (se `dirty`: `/plan-resolve 3`, que também atualiza o `library-refs.md`) · **F3** `/plan-build 3` (append-mode, edição cirúrgica) · **F4** `/plan-test-specs 3` (re-stamp do `Last sync`, senão o `/implement` aborta STALE) · **F5** `git commit -m "registra @nestjs/bullmq 11 na TD-01 e library-refs"`

### G — Compose real (terminal)
```bash
cd nestjs-project
docker compose up -d --build
docker compose ps                      # video-worker, redis, minio running; minio-init Exited (0)
docker compose exec redis redis-cli ping
docker compose logs video-worker       # worker iniciado, sem erro
docker compose exec -d nestjs-api npm run start:dev
```
Upload real de `test/fixtures/sample.mp4`: `POST /videos` → `part-urls` → `PUT` da parte → `complete` → `GET /videos/:publicId` até `ready` com `thumbnail_url`. Depois `docker compose stop video-worker` deve encerrar limpo. Ou, numa janela nova:
```
Suba a API e o video-worker e faça um upload real de test/fixtures/sample.mp4 pelo fluxo da fase 03 até o vídeo ficar ready com thumbnail; depois pare o video-worker e confirme encerramento limpo. Só verificar, não alterar código.
```

### H — Final verification da fase
**Janela nova:**
```
/implement 3
```
Com 10/10 SIs e `Status: in_progress`, a skill pula direto para a final verification (`npm test`, `test:e2e`, `tsc`, `lint`, `build`) e marca `Status: completed` se tudo passar.
```bash
git add -A && git commit -m "fase 03 concluída: final verification verde"
```
**Critério para avançar:** final verification verde e `progress.md` com `Status: completed` → Passo 8.

---

## [ ] PASSO 8 — Fechamento (Definition of Done + documentação)

- [x] 8.1 Verificação manual (compose, migrations, testes, tsc, lint) *(2026-11-14, + `build` — tudo verde)*
- [x] 8.2 Auditoria de CLAUDE.md / README + nota do SI-03.3 *(2026-11-14, task `phase-03-docs-closure` — PR #10; README não auditado)*
- [x] 8.3 Checklist dos critérios de aceite *(2026-11-14, na `docs/phase-03-acceptance-checklist` — 2 lacunas bloqueantes: seção de vídeos no `nestjs-project/CLAUDE.md` e `main` defasada; desvio de Git Flow no PR #4; ver "Pendências abertas")*
- [ ] 8.4 Push + PR → `dev` e, depois, PR `dev` → `main` *(PR #9 e PR #10 → `dev` mergeados; PR #11 `dev` → `main` mergeado em 2026-11-14 — `c5d5d62`; falta `docs/phase-03-videos-docs` → `dev` → `main`)*
- [ ] 8.5 (opcional) Log da sessão em `_claude-sessions/`

8.1 — Verificação manual (terminal):
```bash
cd nestjs-project
docker compose up -d && docker compose ps     # api, db, mailpit, storage, fila e worker rodando
docker compose exec nestjs-api npm run migration:run
docker compose exec nestjs-api npm test -- --runInBand
docker compose exec nestjs-api npm run test:e2e
docker compose exec nestjs-api npx tsc --noEmit ; echo "exit=$?"
docker compose exec nestjs-api npm run lint
```

8.2 — Auditoria da documentação como **task** do pipeline (`phase-03-closure-docs`), junto com a nota do SI-03.3 no `progress.md` da fase. Sem `/research` (não há decisão técnica) e sem `/plan-test-specs` (só `.md`). Branch: `docs/phase-03-closure`. Cada comando em **janela nova** (`/clear`).

- [x] 8.2a `/plan-context` → `docs/tasks/task-phase-03-docs-closure/context.md` *(slug `phase-03-docs-closure`)*
- [x] 8.2b `/plan-validate` `clean` (⇄ `/plan-resolve` se `dirty`) *(`clean` direto)*
- [x] 8.2c `/plan-build` → `task-phase-03-docs-closure.md` *(3 SIs)*
- [x] 8.2d `/implement` → docs corrigidos + `progress.md` da task *(3/3, `completed`)*
- [x] 8.2e commit na `docs/phase-03-closure2` *(`d3c0e2b`, PR #10)*

**8.2a** — confirmar o slug `phase-03-closure-docs`; se o correlator sugerir `phase-03-videos` ou `test-e2e-runinband`, **incluir** (são as fontes de verdade das notas):
```
/plan-context "Fechamento documental da fase 03, sem alterar código: (1) em docs/phases/phase-03-videos/progress.md, a nota 'Fora de escopo' do SI-03.3 ainda diz que npm run test:e2e não usa --runInBand, mas isso foi resolvido no PR #3 (task test-e2e-runinband) — trocar a nota por uma referência 'Resolvido (PR #3)', no mesmo formato da nota do PR #2 logo acima; (2) atualizar o CLAUDE.md da raiz contra o código real da fase 03: Message Queue 'TBD' → BullMQ + Redis, container video-worker (FFmpeg), MinIO como Object Storage no compose, módulo de vídeos, e next-frontend/ descrito como 'not yet initialized' embora já exista. Só arquivos .md."
```
**8.2b**
```
/plan-validate phase-03-closure-docs
```
Se `dirty`: `/plan-resolve phase-03-closure-docs` → `/plan-validate phase-03-closure-docs` até `clean`.

**8.2c**
```
/plan-build phase-03-closure-docs
```
**8.2d**
```
/implement phase-03-closure-docs
```
**8.2e**
```bash
git add -A && git commit -m "fecha documentação da fase 03: CLAUDE.md da raiz e nota do SI-03.3"
```
**Critério para avançar:** `progress.md` da task com `Status: completed`; `CLAUDE.md` da raiz sem "TBD" e coerente com o compose; nota do SI-03.3 apontando o PR #3.

8.3 — Checklist dos critérios de aceite. **Prompt** (janela nova):
```
Confira item a item os critérios de aceite da Fase 03 contra o repositório (só leitura, sem alterar nada):
decisions doc; pasta docs/phases/phase-03-videos com context, validation (clean), plano, progress e library-refs;
plano com SI-03.x + Data Model/API Contracts/Authorization Matrix/Error Catalog/Events-Messages + Dependency Map + Deliverables;
upload 10GB direto ao storage com rascunho; processamento com duração/metadados e thumbnail; URL única; streaming 206 e download;
ciclo de status no banco; storage, fila e worker no compose; migration CreateVideos ligada a channels; testes verdes;
tsc e lint ok; CLAUDE.md coerente. Liste o que está OK e o que falta.
```

8.4 — Git Flow final:
```bash
# A feature/phase-03-videos já está na dev (PR #1); o fechamento sai da docs/phase-03-closure
git push -u origin docs/phase-03-closure
# Abrir PR docs/phase-03-closure → dev e fazer merge
# Com a dev estável: PR dev → main (nunca commit direto na main)
```

8.5 — (Opcional) Salvar o log da sessão em `_claude-sessions/14-fase03-...txt`, como nas fases anteriores, para deixar a presença da IA observável.

---

## Resumo da cronologia

| # | Skill / ação | Artefato |
|---|--------------|----------|
| 0 | setup manual | branch `dev` + `feature/phase-03-videos`, context7, baseline verde |
| 1 | `/research phase 03` | `docs/decisions/technical-decisions-phase-03-videos.md` |
| 2 | `/plan-context 3` | `docs/phases/phase-03-videos/context.md` |
| 3 | `/plan-validate 3` | `validation.md` |
| 4 | `/plan-resolve 3` (⇄ 3 até clean) | decisões preenchidas + `library-refs.md` |
| 5 | `/plan-build 3` | `phase-03-videos.md` |
| 6 | `/plan-test-specs 3` (condicional) | `nestjs-project/specs/*.plan.md` |
| 7 | `/implement 3` | código + `progress.md` |
| 7B | tasks `fix-migrations-integration-spec`, `test-e2e-runinband`, `lint-baseline`, `phase-03-dod-closure`, `video-worker-graceful-stop` (+ `/decide` opcional) | `docs/tasks/task-*/`, DoD verde, `progress.md` `completed` |
| 8 | verificação + docs + PRs (`docs/phase-03-closure`) | DoD verde, CLAUDE.md atualizado, merge em `dev` → `main` |
