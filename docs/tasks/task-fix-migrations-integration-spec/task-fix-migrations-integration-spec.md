---
kind: task
name: task-fix-migrations-integration-spec
test_specs_aware: true
sources_mtime:
  docs/tasks/task-fix-migrations-integration-spec/context.md: "2026-11-14T08:42:26-03:00"
  docs/decisions/technical-decisions-phase-01-configuracao-base.md: "2026-11-11T08:00:03-03:00"
  docs/decisions/technical-decisions-phase-02-auth.md: "2026-11-11T08:00:03-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-14T08:32:25-03:00"
  docs/phases/phase-02-auth/context.md: "2026-11-11T08:00:03-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-11-11T08:00:03-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-11-14T08:32:25-03:00"
---

# Fix migrations integration spec

## Objective

Corrigir src/database/migrations.integration-spec.ts do nestjs-project, que falha desde a fase 02: o beforeAll derruba as tabelas mas não o tipo verification_tokens_type_enum, então CreateAuthTokens falha no CREATE TYPE; os DROP rodam em paralelo (Promise.all); e quando o afterAll falha, o destroy() não roda e o Jest não encerra. O spec precisa limpar tabelas e tipos enum de forma sequencial, sempre fechar a conexão e deixar o banco compartilhado migrado ao final. Somente nestjs-project, sem alterar migrations existentes.

---

## Step Implementations

### SI-1 — Reset sequencial do schema e teardown garantido no spec de migrations

**Description:** Reescreve o setup/teardown de `src/database/migrations.integration-spec.ts` para derrubar tabelas e tipos enum descobertos no catálogo, um por vez, registrar todas as migrations existentes e sempre fechar a conexão deixando o banco compartilhado totalmente migrado.

**Technical actions:**

1. Registrar as três migrations existentes no `createTestDataSource` do spec — `CreateUsersAndChannels1775687773260`, `CreateAuthTokens1777579850478` e `CreateVideos1794571199100` (import de `./migrations/1794571199100-CreateVideos`) — sem alterar nenhum arquivo em `src/database/migrations/`; atualizar as asserções do primeiro teste para o conjunto completo (`toHaveLength(3)`; tabelas `channels`, `refresh_tokens`, `users`, `verification_tokens`, `videos`).
2. Substituir o `Promise.all` de `DROP TABLE` no `beforeAll` por um reset sequencial guiado pelo catálogo (per resolução AMB-2 em `validation.md`): consultar `pg_tables` com `schemaname = 'public'` (inclui a tabela `migrations`) e executar `DROP TABLE IF EXISTS "public"."<name>" CASCADE` um a um com `for…of` + `await`; em seguida consultar `pg_type` ⨝ `pg_namespace` com `typtype = 'e'` e `nspname = 'public'` e executar `DROP TYPE IF EXISTS "public"."<name>" CASCADE` um a um. Remover a constante `MANAGED_TABLES` usada no reset (manter apenas as listas usadas nas asserções).
3. Ajustar o segundo teste ao novo "último migration" (`CreateVideos1794571199100`): após `undoLastMigration()`, a tabela `videos` não existe e os tipos `videos_processing_status_enum` / `videos_editorial_status_enum` foram removidos, enquanto as tabelas de auth permanecem.
4. Reescrever o `afterAll` com `try { await dataSource.runMigrations(); } finally { if (dataSource?.isInitialized) await dataSource.destroy(); }` — a re-aplicação deixa o banco compartilhado migrado e o `destroy()` roda mesmo quando `runMigrations` lança (inclusive se o `beforeAll` falhou após `initialize()`).
5. Executar o spec com `--runInBand` (garantia de execução serial já existente — script `test:integration` e `nestjs-project/CLAUDE.md` → "Test execution"; per resolução AMB-1 em `validation.md`), sem alterar scripts nem configuração do Jest.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `migrations.integration-spec.ts` (reset + migrations up/down + teardown) | Integration: real PostgreSQL via `createTestDataSource` | `nestjs-project/src/database/migrations.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- Partindo de um banco com resíduo das fases anteriores (incluindo o tipo `verification_tokens_type_enum` sem a tabela correspondente), o reset deixa o schema `public` sem tabelas e sem tipos enum, e `runMigrations()` aplica as 3 migrations sem erro de `CREATE TYPE`.
- Após `runMigrations()`, as tabelas `channels`, `refresh_tokens`, `users`, `verification_tokens` e `videos` existem no schema `public`.
- `undoLastMigration()` remove a tabela `videos` e os tipos `videos_processing_status_enum` e `videos_editorial_status_enum`, mantendo as tabelas de auth.
- Ao fim do suite, o banco compartilhado contém as 3 migrations registradas na tabela `migrations` e todas as tabelas acima, de modo que os demais suites de integração rodam sem migração adicional.
- Quando a re-aplicação no `afterAll` falha, a conexão é encerrada mesmo assim e o processo do Jest termina sem handles abertos.
- Rodar o suite duas vezes seguidas passa nas duas execuções.

---

<!-- phase-a-complete -->

## Dependency Map

SI-1 (root)

---

## Deliverables

- [ ] SI-1 — Reset sequencial do schema e teardown garantido no spec de migrations

**Full test suites:**

- [ ] Unit + integration tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`cd nestjs-project && docker compose exec nestjs-api npm run lint`)
