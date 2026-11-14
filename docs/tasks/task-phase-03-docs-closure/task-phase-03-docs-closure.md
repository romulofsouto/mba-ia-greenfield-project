---
kind: task
name: task-phase-03-docs-closure
test_specs_aware: true
sources_mtime:
  docs/tasks/task-phase-03-docs-closure/context.md: "2026-11-14 14:26:49.172961858 -0300"
---

# Fechamento documental da fase 03

## Objective

Fechamento documental da fase 03, sem alterar código: (1) em docs/phases/phase-03-videos/progress.md, a nota 'Fora de escopo' do SI-03.3 ainda diz que npm run test:e2e não usa --runInBand, mas isso foi resolvido no PR #3 (task test-e2e-runinband) — trocar a nota por uma referência 'Resolvido (PR #3)', no mesmo formato da nota do PR #2 logo acima; (2) atualizar o CLAUDE.md da raiz contra o código real da fase 03: Message Queue 'TBD' → BullMQ + Redis, container video-worker (FFmpeg), MinIO como Object Storage no compose, módulo de vídeos, e next-frontend/ descrito como 'not yet initialized' embora já exista. Só arquivos .md.

---

## Step Implementations

### SI-1 — Atualizar a nota de `--runInBand` do SI-03.3 no progress da fase 03

**Description:** Trocar a nota "Fora de escopo" do SI-03.3 em `docs/phases/phase-03-videos/progress.md`, que ficou desatualizada após o PR #3 (task `test-e2e-runinband`), por uma referência de resolução no mesmo formato da nota do PR #2 logo acima.

**Technical actions:**

1. Em `docs/phases/phase-03-videos/progress.md` (bloco do SI-03.3), substituir o bullet `- Fora de escopo: \`npm run test:e2e\` (...) não usa \`--runInBand\` (...)` por `- Resolvido (PR #3, commit \`39075e0\`): \`npm run test:e2e\` agora roda \`jest --config ./test/jest-e2e.json --runInBand\` (task \`test-e2e-runinband\`), alinhado ao que o \`nestjs-project/CLAUDE.md\` documenta.` — mesmo formato `Resolvido (PR #N, commit \`hash\`): ...` da nota do PR #2 imediatamente acima.

**Tests:** _(empty — documentation-only; no code artifacts)_

**Dependencies:** none

**Acceptance criteria:**

- `grep -n 'Fora de escopo' docs/phases/phase-03-videos/progress.md` não retorna mais a nota sobre `--runInBand` no bloco do SI-03.3.
- O bloco do SI-03.3 contém um bullet `Resolvido (PR #3, commit \`39075e0\`)` logo após o bullet `Resolvido (PR #2, commit \`39b84a6\`)`.
- O comando citado na nota bate com o script `test:e2e` de `nestjs-project/package.json` (`jest --config ./test/jest-e2e.json --runInBand`).
- Nenhuma outra linha de `progress.md` é alterada (`git diff --stat` mostra só esse arquivo com 1 linha trocada).

---

### SI-2 — Atualizar a seção Repository Structure do CLAUDE.md da raiz

**Description:** Fazer `## Repository Structure` do `CLAUDE.md` da raiz refletir os subprojetos e módulos que existem de fato ao fim da fase 03 — `next-frontend/` já está inicializado e o `nestjs-project/` tem módulo de vídeos e worker.

**Technical actions:**

1. No bullet `nestjs-project/`, trocar a lista genérica de módulos ("users, channels, videos, comments, etc.") pelos módulos reais de `nestjs-project/src/` — `auth`, `users`, `channels`, `videos`, `media`, `storage`, `queue`, `worker`, `mail` — sem citar módulos que ainda não existem (ex.: `comments`).
2. Substituir o bullet `` `next-frontend/` (Next.js) — not yet initialized `` por uma descrição do subprojeto existente: frontend Next.js (App Router em `app/`, `components/`, `lib/`, `hooks/`), com `compose.yaml` próprio e convenções no `next-frontend/CLAUDE.md`.

**Tests:** _(empty — documentation-only; no code artifacts)_

**Dependencies:** none

**Acceptance criteria:**

- `grep -n 'not yet initialized' CLAUDE.md` não retorna nenhuma linha.
- Cada módulo citado no bullet `nestjs-project/` corresponde a um diretório existente em `nestjs-project/src/`, e nenhum módulo inexistente é citado.
- O bullet `next-frontend/` aponta para `next-frontend/CLAUDE.md` e descreve o subprojeto como existente.
- Só a seção `## Repository Structure` muda neste SI.

---

### SI-3 — Atualizar a seção Architecture do CLAUDE.md da raiz com os containers da fase 03

**Description:** Fazer os containers em `## Architecture (C4 Container Diagram)` do `CLAUDE.md` da raiz baterem com `nestjs-project/compose.yaml` e as dependências reais da fase 03 — fila definida (BullMQ + Redis), worker como container próprio e MinIO como Object Storage.

**Technical actions:**

1. Trocar `**Message Queue** (TBD)` por `**Message Queue** (BullMQ + Redis)` — serviço `redis` no compose (`--maxmemory-policy noeviction`), filas `video-processing` e `video-maintenance`; a API publica jobs e o worker os consome.
2. Atualizar `**Video Worker** (FFmpeg)` para citar o container `video-worker` do compose (mesma imagem e volume da API, sem porta HTTP, código em `nestjs-project/src/worker/`), que consome as filas BullMQ, processa com FFmpeg e atualiza DB e storage.
3. Atualizar `**Object Storage** (S3/MinIO)` para indicar MinIO no compose — serviço `minio` (API S3 acessada via `@aws-sdk/client-s3`) + `minio-init`, que cria o bucket `S3_BUCKET` — guardando vídeos e thumbnails.

**Tests:** _(empty — documentation-only; no code artifacts)_

**Dependencies:** none

**Acceptance criteria:**

- `grep -n 'TBD' CLAUDE.md` não retorna nenhuma linha.
- Cada nome de serviço citado na seção Architecture (`redis`, `video-worker`, `minio`, `minio-init`) existe como serviço em `nestjs-project/compose.yaml`.
- Cada fila citada (`video-processing`, `video-maintenance`) existe como nome de fila no código de `nestjs-project/src/`.
- A seção continua apontando para `docs/diagrams/software-arch.mermaid` como diagrama completo.
- Só a seção `## Architecture (C4 Container Diagram)` muda neste SI.

---

<!-- phase-a-complete -->

## Dependency Map

SI-1 (root, independent)
SI-2 (root, independent)
SI-3 (root, independent)

---

## Deliverables

- [ ] SI-1 — Atualizar a nota de `--runInBand` do SI-03.3 no progress da fase 03
- [ ] SI-2 — Atualizar a seção Repository Structure do CLAUDE.md da raiz
- [ ] SI-3 — Atualizar a seção Architecture do CLAUDE.md da raiz com os containers da fase 03
- [ ] `git diff --name-only` lista apenas arquivos `.md` (`CLAUDE.md`, `docs/phases/phase-03-videos/progress.md`, artefatos em `docs/tasks/task-phase-03-docs-closure/`)

**Full test suites:**

- [ ] Backend tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`cd nestjs-project && docker compose exec nestjs-api npm run lint`)
