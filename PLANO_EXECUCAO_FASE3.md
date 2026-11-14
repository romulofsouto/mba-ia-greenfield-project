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
| 7 | `/implement 3` | 🟡 em andamento — 10/10 SIs implementados e testados; final verification **não verde** (spec de migrations + lint); nada commitado |
| 7B | Correções para a DoD (tasks: migrations, lint, runInBand, `phase-03-dod`) + Compose real + `/implement 3` | 🟡 em andamento — A ✅ (PR #1) · B ✅ (PR #2) · B' implementada (task `test-e2e-runinband`), falta commit/PR → `dev` |
| 8 | Fechamento (DoD + docs + PRs) | ⬜ pendente |

Legenda: ⬜ pendente · 🟡 em andamento · ✅ concluído · ⏭️ não se aplica

**Pendências abertas (2026-11-14):**
- **Final verification não verde** (rodada na `bugfix/test-e2e-runinband` em 2026-11-14): ✅ unit/integration 233/233 (40 suítes) · ✅ `npm run test:e2e` 66/66 (5 suítes, em série pelo script) · ✅ `tsc` · ✅ build · ❌ lint 218 erros + 53 warnings, todos pré-existentes e fora das tasks B/B' (etapa C).
- **`npm run lint` usa `--fix` e quebra o `tsc`:** remove o `as any` de `test/support/video-e2e.ts:52` (acesso a `mailService` privado → TS2341) e reformata `src/videos/videos.service.integration-spec.ts`. Revertido com `git checkout`. Na etapa C, medir o lint sem `--fix`.
- **Critérios de runtime do SI-03.8 não verificados:** o `video-worker` nunca foi ligado (`docker compose ps`, upload real → `ready`, parada limpa).
- Fechamento: `CLAUDE.md` da raiz (Message Queue "TBD" → BullMQ/Redis, worker, MinIO, módulo de vídeos).
- Follow-ups novos (fora do escopo, registrados em `docs/tasks/task-fix-migrations-integration-spec/progress.md`): `createTestDataSource` usa `synchronize: true` por padrão, o que cria tabelas sem registrar migrations (o banco tinha `videos` sem a linha `CreateVideos` em `migrations`); os specs de integração usam o mesmo banco `streamtube` da aplicação de dev (avaliar banco de teste separado).
- Revisões antigas ainda abertas: 0.5 commitar este plano (opcional) · 1.2 revisar as 9 TDs · 2.2 revisar `context.md` · 5.2/5.3 revisar Tech Specs e SIs.

**Próximo passo:** commitar a task na `bugfix/test-e2e-runinband` e abrir PR → `dev` (B') → C (lint, a partir da `dev`) → E reduzida (só lint dos testes da fase) → (F) → G → H (`/implement 3`) → Passo 8. Uma branch nova da `dev` por pendência.

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

---

Fluxo oficial do projeto:
`/research → /plan-context → /plan-validate ⇄ /plan-resolve → /plan-build → [/plan-test-specs] → /implement → fechamento`

---

## Status do ambiente (última verificação: 2026-11-13)

| Item | Situação |
|------|----------|
| Containers `db`, `mailpit`, `nestjs-api`, `redis`, `minio` (+ `minio-init`) | ✅ rodando — `nestjs-api` ocioso; a API sobe com `docker compose exec -d nestjs-api npm run start:dev` · `video-worker` definido no compose mas **nunca ligado** (`docker compose up -d video-worker`) |
| API `http://localhost:3000` | ✅ 200 |
| Migrations | ✅ `CreateUsersAndChannels`, `CreateAuthTokens`, `CreateVideos` (run → revert → run validado no SI-03.3) |
| Suíte de testes (2026-11-14, `bugfix/test-e2e-runinband`) | ⚠️ unit/integration ✅ 233/233 · e2e ✅ 66/66 pelo script · tsc ✅ · build ✅ · lint ❌ 218 erros + 53 warnings |
| MCP postgres | ✅ conectado |
| Branch atual | `bugfix/test-e2e-runinband` (da `dev` em `420b765`, que já tem a fase 03 e a etapa B); `feature/phase-03-videos` mergeada na `dev` pelo PR #1, `bugfix/migrations-spec` pelo PR #2 |
| `next-frontend/package-lock.json` | ✅ revertido (pode voltar após `npm install` no container do front — basta reverter de novo) |
| MCP context7 | ✅ conectado via plugin (OAuth) — tools `mcp__plugin_context7_context7__*` |
| ffmpeg no container | ✅ ffmpeg 5.1 no `Dockerfile.dev` (imagem reconstruída) |
| Artefatos da fase 03 | ✅ tudo commitado (`1c25bc0` … `34ad8d0`) e mergeado na `dev` (`d551ff0`) · task `fix-migrations-integration-spec` mergeada na `dev` (PR #2) · task `test-e2e-runinband` (`package.json` + `docs/tasks/task-test-e2e-runinband/`) não commitada |

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
- [ ] **0.5** Commitar este plano na branch da feature (opcional)

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

## [ ] PASSO 7 — Implementação SI a SI → código + `progress.md`

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
- [ ] Final verification (suíte completa + tsc + lint + build) *(rodada em 2026-11-13: e2e/tsc/build ✅; unit ❌ spec de migrations; lint ❌ — ver Histórico)*

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

## [ ] PASSO 7B — Correções para fechar a Definition of Done (pipeline em modo task)

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
- [ ] **B'** `bugfix/test-e2e-runinband` mergeado na `dev` *(task `test-e2e-runinband` implementada e verificada em 2026-11-14 — e2e 66/66 pelo script; falta commit + PR)*
- [ ] **C** `bugfix/lint-baseline` mergeado na `dev`
- [ ] **D** `dev` mergeada na `feature/phase-03-videos` (conflitos resolvidos, `tsc` ok)
- [ ] **E** task `phase-03-dod` implementada e commitada *(item (1), spec de migrations com `videos`, já resolvido na etapa B — sobra só o lint dos testes da fase)*
- [ ] **F** (opcional) revisão da TD-01 registrada
- [ ] **G** verificação manual do Compose
- [ ] **H** `/implement 3` → final verification verde, `progress.md` com `Status: completed`

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

- [ ] 8.1 Verificação manual (compose, migrations, testes, tsc, lint)
- [ ] 8.2 Auditoria de CLAUDE.md / README
- [ ] 8.3 Checklist dos critérios de aceite
- [ ] 8.4 Push + PR `feature/phase-03-videos` → `dev` (merge)
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

8.2 — Auditoria da documentação. **Prompt** (janela nova):
```
Revise o CLAUDE.md da raiz e o nestjs-project/CLAUDE.md (e README.md) contra o código real da Fase 03:
módulo de vídeos, endpoints, fila/worker, storage, serviços do compose, variáveis de ambiente e verificação de readiness.
Corrija qualquer referência a arquivo ou comportamento inexistente e acrescente o que faltar. Não altere código.
```
```bash
git add -A && git commit -m "atualiza CLAUDE.md e docs com a seção de vídeos da fase 03"
```

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
git push -u origin feature/phase-03-videos
# Abrir PR feature/phase-03-videos → dev e fazer merge
# Quando dev estiver estável: PR dev → main (nunca commit direto na main)
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
| 7B | tasks `migrations-spec-fix`, `lint-baseline`, `phase-03-dod` (+ `/decide` opcional) → `/implement 3` | `docs/tasks/task-*/`, DoD verde, `progress.md` `completed` |
| 8 | verificação + docs + PRs | DoD verde, CLAUDE.md atualizado, merge em `dev` |
