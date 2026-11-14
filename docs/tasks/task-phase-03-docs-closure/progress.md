# task-phase-03-docs-closure — Progress

**Status:** completed
**SIs:** 3/3 completed

### SI-1 — Atualizar a nota de `--runInBand` do SI-03.3 no progress da fase 03
- **Status:** completed
- **Tests:** no tests
- **Observations:** none

### SI-2 — Atualizar a seção Repository Structure do CLAUDE.md da raiz
- **Status:** completed
- **Tests:** no tests
- **Observations:**
  - A frase introdutória da seção ("This is a monorepo with two main areas:") lista três bullets (`nestjs-project/`, `docs/`, `next-frontend/`); não foi alterada por estar fora das ações do SI — ajuste textual fica como follow-up.
  - Módulos listados não incluem `common`, `config`, `database`, `swagger` e `test` de `nestjs-project/src/`, por serem infraestrutura/suporte e não módulos de domínio.

### SI-3 — Atualizar a seção Architecture do CLAUDE.md da raiz com os containers da fase 03
- **Status:** completed
- **Tests:** no tests
- **Observations:**
  - `docs/diagrams/software-arch.mermaid:13` ainda declara a Message Queue como `"TBD"`; o diagrama ficou fora do escopo desta task (só `CLAUDE.md` e `progress.md`) — atualizar em task separada para não divergir do `CLAUDE.md`.
