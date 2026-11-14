---
kind: task
name: task-test-e2e-runinband
test_specs_aware: true
sources_mtime:
  docs/tasks/task-test-e2e-runinband/context.md: "2026-11-14T09:43:51-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-14T08:32:25-03:00"
---

# Task — test:e2e com --runInBand

## Objective

O script npm run test:e2e do nestjs-project não usa --runInBand, mas o nestjs-project/CLAUDE.md afirma que já está configurado e as suítes e2e compartilham o banco. Adicionar --runInBand ao script test:e2e para alinhar código e documentação.

---

## Step Implementations

### SI-1 — Serializar o script test:e2e com --runInBand

**Description:** Adiciona `--runInBand` ao script `test:e2e` do `nestjs-project`, fazendo o código cumprir o que o `nestjs-project/CLAUDE.md` já documenta ("already configured") e evitando que suítes e2e que compartilham o banco de teste rodem em paralelo.

**Technical actions:**

1. Editar `nestjs-project/package.json` — alterar `scripts.test:e2e` de `jest --config ./test/jest-e2e.json` para `jest --config ./test/jest-e2e.json --runInBand`, alinhado ao padrão de isolamento por suíte contra serviços reais do Compose (per `phase-03-videos/TD-09`) e ao script `test:integration`, que já usa `--runInBand`

**Tests:** _(empty — config-only; verified by running the full e2e suite in Deliverables)_

**Dependencies:** none

**Acceptance criteria:**

- `npm pkg get scripts.test:e2e` (no container `nestjs-api`) retorna `"jest --config ./test/jest-e2e.json --runInBand"`
- `npm run test:e2e` (no container `nestjs-api`) executa todas as suítes `*.e2e-spec.ts` em série, num único processo, e termina com exit code 0
- A afirmação do `nestjs-project/CLAUDE.md` de que `npm run test:e2e` já roda com `--runInBand` passa a ser verdadeira sem nenhuma edição no documento

---

<!-- phase-a-complete -->

## Dependency Map

SI-1 (root)

---

## Deliverables

- [ ] SI-1 — Serializar o script test:e2e com --runInBand

**Full test suites:**

- [ ] Backend tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`cd nestjs-project && docker compose exec nestjs-api npm run lint`)
- [ ] Project builds successfully (`cd nestjs-project && docker compose exec nestjs-api npm run build`)
