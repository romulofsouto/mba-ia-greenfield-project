---
kind: task
name: task-phase-03-dod-closure
test_specs_aware: true
sources_mtime:
  docs/tasks/task-phase-03-dod-closure/context.md: "2026-11-14 10:59:50.745460919 -0300"
  docs/decisions/technical-decisions-lint-baseline.md: "2026-11-14 10:53:50.111513581 -0300"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-14 08:32:25.440829027 -0300"
  docs/phases/phase-02-auth/context.md: "2026-11-11 08:00:03.533289033 -0300"
  docs/phases/phase-02-auth-frontend/context.md: "2026-11-11 08:00:03.532395252 -0300"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-11-14 08:32:25.439926464 -0300"
---

# Fechar a Definition of Done da Fase 03

## Objective

Fechar a Definition of Done da fase 03 (docs/phases/phase-03-videos/progress.md): (1) src/database/migrations.integration-spec.ts falha com 'Entity metadata for Channel#videos was not found' porque o SI-03.3 adicionou o OneToMany Channel→Video e o spec não registra Video nem a migration CreateVideos1794571199100; o spec deve registrá-las, limpar a tabela videos e os enums videos_processing_status_enum / videos_editorial_status_enum e esperar 3 migrations. (2) Zerar os erros de lint nos arquivos de teste criados pela fase 03 (test/videos-*.e2e-spec.ts, test/support/video-e2e.ts, src/videos/*.spec.ts e *.integration-spec.ts, src/worker/*), seguindo a decisão de lint-baseline. Somente nestjs-project.

---

## Step Implementations

### SI-1 — Registrar a DoD verificada e fechar a fase 03

**Description:** As duas correções do escopo já estão em `dev` — o `migrations.integration-spec.ts` (PR #2, commit `39b84a6`) e o lint dos arquivos da fase 03 (PR #5, `lint-baseline`). Este SI verifica de novo a DoD técnica e fecha `docs/phases/phase-03-videos/progress.md`, sem mudança de código.

**Technical actions:**

1. Rodar a DoD técnica completa dentro do container `nestjs-api`: `npm test -- --runInBand`, `npm run test:e2e`, `npx tsc --noEmit` e `npx eslint "{src,apps,libs,test}/**/*.ts" --max-warnings 0` (sem `--fix`, para não reescrever arquivos durante a verificação) (per `lint-baseline/TD-03`).
2. Confirmar que `src/database/migrations.integration-spec.ts` registra as 3 migrations (incluindo `CreateVideos1794571199100`), limpa a tabela `videos` e os enums `videos_processing_status_enum` / `videos_editorial_status_enum` e passa isoladamente.
3. Atualizar `docs/phases/phase-03-videos/progress.md`: trocar `**Status:** in_progress` por `**Status:** completed` e substituir a nota "Fora de escopo (tarefa separada)" do SI-03.3 por uma referência à correção já entregue (PR #2), registrando os resultados da DoD (contagem de suítes/testes, `tsc` e `eslint` com exit 0).

**Tests:** _(empty — verificação e documentação; nenhum artefato testável é criado ou alterado)_

**Dependencies:** none

**Acceptance criteria:**

- `npm test -- --runInBand` no container `nestjs-api` termina com todas as suítes unit + integration passando, incluindo `src/database/migrations.integration-spec.ts`
- `npm run test:e2e` termina com todas as suítes e2e passando (`test/videos-upload.e2e-spec.ts` e `test/videos-delivery.e2e-spec.ts` incluídas)
- `npx tsc --noEmit` sai com código 0
- ESLint com `--max-warnings 0` sobre `src/`, `test/` (incluindo todo `src/worker/`, produção e testes) sai com código 0, sem erros nem warnings
- `docs/phases/phase-03-videos/progress.md` mostra `**Status:** completed` e não aponta mais o `migrations.integration-spec.ts` como pendência

---

## Dependency Map

SI-1 (root)

---

## Deliverables

- [ ] SI-1 — Registrar a DoD verificada e fechar a fase 03

**Full test suites:**

- [ ] Backend tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`cd nestjs-project && docker compose exec nestjs-api npm run lint`)
