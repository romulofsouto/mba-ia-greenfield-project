# task-video-worker-graceful-stop — Progress

**Status:** completed
**SIs:** 4/4 completed

### SI-1 — Launcher de dev do worker com `node --watch` como processo principal
- **Status:** completed
- **Tests:** no tests (Infra) — checked by running the launcher in a one-off `video-worker` container
- **Observations:**
  - Verified in a one-off container: PID 1 = `node --watch dist-worker/worker/main.js`, `tsc --watch` as a background child, `dist/` untouched; editing `src/worker/maintenance-scheduler.ts` triggered recompilation + `Restarting 'dist-worker/worker/main.js'`; `docker stop` took 0.43 s and the container exited 0.
  - The build strips comments (`removeComments`), so a comment-only edit still triggers a rebuild and restart but leaves no trace in `dist-worker/`.

### SI-2 — Serviço `video-worker` no compose: comando exec-form e `stop_grace_period`
- **Status:** completed
- **Tests:** no tests (Infra) — checked with `docker compose config` and a running service
- **Observations:**
  - `docker compose config` shows `command: [sh, scripts/start-worker-dev.sh]` and `stop_grace_period: 3m20s`; `nestjs-api` config diff before/after is empty; running service has PID 1 = `node --watch dist-worker/worker/main.js`. The `video-worker` service is left running for SI-4.

### SI-3 — Atualizar `nestjs-project/CLAUDE.md` com o novo procedimento do worker
- **Status:** completed
- **Tests:** no tests (documentation only)
- **Observations:**
  - `npm run start:worker:dev` stays in the container-commands list (it still works for manual runs) but is now described as a wrapper over `scripts/start-worker-dev.sh`; the service description names the script, not npm.

### SI-4 — Verificação em runtime da parada limpa do worker
- **Status:** completed
- **Tests:** no tests (runtime check) — all 4 ACs verified on the real `video-worker` service
- **Observations:**
  - Idle stop: 0.53 s, `Exited (0)`, no `npm error` in logs. Nest prints no log line on shutdown, so the exit code is the evidence the shutdown hooks ran.
  - Active-job stop: to keep a job active long enough, a temporary `processing` video row (reusing the existing sample's source object) was enqueued with MinIO paused; `docker compose stop` was issued with the job active (`ffprobe` running), blocked ~8 s until MinIO was unpaused, the job completed (video `ready` with thumbnail, job removed as completed, no stall), and the container exited 0. Temporary row and its thumbnail were deleted afterwards.
  - Edit in `src/worker/maintenance-scheduler.ts` triggered recompilation + worker restart in the running service; edit reverted (clean `git diff src/`). `video-worker` left stopped.
