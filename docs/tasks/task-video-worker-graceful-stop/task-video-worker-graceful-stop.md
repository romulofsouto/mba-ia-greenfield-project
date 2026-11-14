---
kind: task
name: task-video-worker-graceful-stop
test_specs_aware: true
sources_mtime:
  docs/tasks/task-video-worker-graceful-stop/context.md: "2026-11-14 13:49:12.067460795 -0300"
  docs/decisions/technical-decisions-video-worker-graceful-stop.md: "2026-11-14 13:48:40.558769869 -0300"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-14 08:32:25.440829027 -0300"
  docs/decisions/technical-decisions-phase-01-configuracao-base.md: "2026-11-11 08:00:03.530651900 -0300"
  docs/phases/phase-03-videos/context.md: "2026-11-14 08:32:25.441103185 -0300"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-11-14 08:32:25.439926464 -0300"
---

# Video worker graceful stop

## Objective

Como iniciar o video-worker em dev para que o SIGTERM do docker compose stop chegue ao processo node, o Nest feche os workers BullMQ e o container saia com código 0, mantendo recompilação ao editar e o build em dist-worker/

---

## Step Implementations

### SI-1 — Launcher de dev do worker com `node --watch` como processo principal

**Description:** Substitui `nest start --watch` por compilação em watch separada + `node --watch` executado via `exec`, para que o processo que recebe o SIGTERM espere o shutdown do Nest e devolva o exit code (per `video-worker-graceful-stop/TD-01`).

**Technical actions:**

1. Criar `nestjs-project/scripts/start-worker-dev.sh` (POSIX `sh`, roda na imagem `node:25.6.0-slim`): limpa `dist-worker/`, faz um build síncrono inicial com `tsc -p tsconfig.worker.json`, sobe a compilação em watch em background (`tsc -p tsconfig.worker.json --watch --preserveWatchOutput`, sem apagar `dist-worker/` a cada início de watch) e termina com `exec node --watch dist-worker/worker/main.js` — o `exec` faz o watcher do node substituir o shell (per `video-worker-graceful-stop/TD-01`).
2. Reescrever o script `start:worker:dev` em `nestjs-project/package.json` para chamar o launcher (`sh scripts/start-worker-dev.sh`), mantendo o nome do script; `start:worker` (`node dist/worker/main`) e `build` ficam inalterados.
3. Manter o build do worker isolado em `dist-worker/` (via `tsconfig.worker.json`), sem tocar no `dist/` da API; o plugin CLI `@nestjs/swagger` não é aplicado pelo `tsc` puro, o que é inofensivo para o worker (não serve OpenAPI) (per `video-worker-graceful-stop/TD-01`).

**Tests:** _(empty — Infra; no testing-guide layer covers start scripts — verified at runtime in SI-4)_

**Dependencies:** none

**Acceptance criteria:**

- `sh scripts/start-worker-dev.sh` executado no container gera `dist-worker/worker/main.js` e deixa o worker consumindo as filas `video-processing` e `video-maintenance`.
- Com o launcher em execução, `ps` no container mostra `node --watch dist-worker/worker/main.js` no lugar do shell que o iniciou (sem `sh -c` nem `npm` entre ele e o app).
- Editar um arquivo em `src/` usado pelo worker regenera o `.js` correspondente em `dist-worker/` e o worker reinicia com o código novo.
- `dist/` (build da API) não é criado nem alterado pelo launcher.

---

### SI-2 — Serviço `video-worker` no compose: comando exec-form e `stop_grace_period`

**Description:** Faz o container do worker iniciar direto pelo launcher (sem `npm` como PID 1) e dá ao shutdown uma janela maior que o pior caso de uma tentativa de processamento (per `video-worker-graceful-stop/TD-01`, `video-worker-graceful-stop/TD-02`).

**Technical actions:**

1. Trocar `command: ["npm", "run", "start:worker:dev"]` do serviço `video-worker` em `nestjs-project/compose.yaml` por exec-form chamando o launcher diretamente (`["sh", "scripts/start-worker-dev.sh"]`), de modo que após o `exec` o PID 1 do container seja o `node --watch` (per `video-worker-graceful-stop/TD-01`).
2. Adicionar `stop_grace_period: 200s` ao serviço `video-worker`, com comentário apontando que o valor cobre `MEDIA_TIMEOUTS_MS.PROBE` (60 s) + `MEDIA_TIMEOUTS_MS.THUMBNAIL` (120 s) de `src/media/media.constants.ts` + margem de upload, e que deve ser revisto se esses timeouts mudarem (per `video-worker-graceful-stop/TD-02`; recuperação por stall continua sendo o último recurso per `phase-03-videos/TD-01`).
3. Não alterar o serviço `nestjs-api` nem os demais serviços (o problema de parada da API é follow-up registrado em `docs/decisions/technical-decisions-video-worker-graceful-stop.md` → Follow-ups).

**Tests:** _(empty — Infra; compose behavior is verified at runtime in SI-4)_

**Dependencies:** SI-1 — o comando do compose chama o launcher criado ali

**Acceptance criteria:**

- `docker compose config video-worker` mostra `command: [sh, scripts/start-worker-dev.sh]` e `stop_grace_period: 3m20s`.
- `docker compose up -d video-worker` sobe o container e `docker compose exec video-worker ps -o pid,args` mostra o PID 1 como `node --watch dist-worker/worker/main.js`.
- `docker compose config nestjs-api` permanece idêntico ao estado anterior à task.

---

### SI-3 — Atualizar `nestjs-project/CLAUDE.md` com o novo procedimento do worker

**Description:** Mantém a documentação do subprojeto coerente com o novo comando e o novo comportamento de parada do `video-worker`.

**Technical actions:**

1. Atualizar a descrição do serviço `video-worker` em `## Development Environment` de `nestjs-project/CLAUDE.md`: o serviço roda `scripts/start-worker-dev.sh` (compilação `tsc --watch` em `dist-worker/` + `node --watch` como PID 1), não mais `npm run start:worker:dev` via npm (per `video-worker-graceful-stop/TD-01`).
2. Atualizar a linha de `npm run start:worker:dev` em `### Container-only commands` para refletir o launcher (mesmo script, ainda gera `dist-worker/`).
3. Documentar o procedimento de parada: `docker compose stop video-worker` envia SIGTERM ao node, o Nest fecha os workers BullMQ e o container sai com `Exited (0)`; com um job ativo a parada pode levar até ~200 s (`stop_grace_period`), e passado esse limite o job volta por stalled-job recovery (per `video-worker-graceful-stop/TD-02`).

**Tests:** _(empty — documentation only)_

**Dependencies:** SI-2 — documenta o comando e o `stop_grace_period` definidos ali

**Acceptance criteria:**

- `nestjs-project/CLAUDE.md` não menciona mais `npm run start:worker:dev` como comando do serviço `video-worker`.
- `nestjs-project/CLAUDE.md` descreve o resultado esperado de `docker compose stop video-worker` (`Exited (0)`) e o limite de ~200 s com job ativo.

---

### SI-4 — Verificação em runtime da parada limpa do worker

**Description:** Prova o critério de runtime do SI-03.8 com o container real: SIGTERM chega ao node, os workers BullMQ fecham, job ativo termina dentro da janela e o container sai com código 0 (per `video-worker-graceful-stop/TD-01`, `video-worker-graceful-stop/TD-02`).

**Technical actions:**

1. Subir a infraestrutura (`docker compose up -d db mailpit redis minio minio-init`) e o worker (`docker compose up -d video-worker`); aguardar o log de bootstrap do Nest.
2. Parada ociosa: `docker compose stop video-worker`, depois `docker compose ps -a video-worker` e `docker compose logs video-worker` para checar exit code e logs (per `video-worker-graceful-stop/TD-01`).
3. Parada com job ativo: subir o worker de novo, colocar um job em `video-processing` (fluxo de upload pela API ou enfileiramento direto de um vídeo já existente no bucket), rodar `docker compose stop video-worker` enquanto o job está ativo e conferir o estado final do job e do vídeo (per `video-worker-graceful-stop/TD-02`; `phase-03-videos/TD-06`).
4. Recompilação: com o worker rodando, editar um arquivo em `src/` usado pelo worker e conferir rebuild em `dist-worker/` + restart do worker nos logs; reverter a edição.

**Tests:** _(empty — runtime check; no testing-guide layer covers compose/start commands per video-worker-graceful-stop/TD-01)_

**Dependencies:** SI-2 — exige o compose atualizado

**Acceptance criteria:**

- `docker compose stop video-worker` com o worker ocioso termina em poucos segundos e `docker compose ps -a video-worker` mostra `Exited (0)`.
- Os logs da parada não contêm `npm error signal SIGTERM` e mostram o encerramento do contexto Nest.
- `docker compose stop video-worker` durante um job de `video-processing` ativo só retorna depois que o job termina; o job fica `completed` (não `stalled`) e o vídeo sai de `processing` para o estado final esperado.
- Editar um arquivo em `src/` com o worker rodando gera rebuild em `dist-worker/` e restart do worker, sem derrubar o container.

---

## Dependency Map

SI-1 (root)
└── SI-2 — depends on SI-1 (compose command calls the launcher)
    ├── SI-3 — depends on SI-2 (documents the new command and grace period)
    └── SI-4 — depends on SI-2 (runtime verification needs the updated compose)

---

## Deliverables

- [ ] SI-1 — Launcher de dev do worker com `node --watch` como processo principal
- [ ] SI-2 — Serviço `video-worker` no compose: comando exec-form e `stop_grace_period`
- [ ] SI-3 — Atualizar `nestjs-project/CLAUDE.md` com o novo procedimento do worker
- [ ] SI-4 — Verificação em runtime da parada limpa do worker

**Full test suites:**

- [ ] Backend tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`docker compose exec nestjs-api npm run lint`)
