---
scope_type: ad-hoc
related_phases: []
status: decided
date: 2026-11-14
scope_description: "Como iniciar o video-worker em dev para que o SIGTERM do docker compose stop chegue ao processo node, o Nest feche os workers BullMQ e o container saia com código 0, mantendo recompilação ao editar e o build em dist-worker/"
---

# Technical Decisions — Video worker graceful stop

_Subprojects in scope:_

- `nestjs-project/` — `compose.yaml` (`video-worker` service), `package.json` scripts and the worker build config. Worker code (`src/worker/main.ts` already calls `app.enableShutdownHooks()`), processors and queues stay unchanged.
- `next-frontend/` — no open decision; process startup of the backend worker does not touch the frontend.

**Findings that frame the decisions** (verified against installed versions: `@nestjs/cli` 11.0.16, Node 25.6.0 in `Dockerfile.dev`, Docker Compose v5.0.2):

- `nest start --watch` (`@nestjs/cli/actions/start.action.js`) registers **no** SIGTERM/SIGINT handler. It kills its child only from `process.on('exit')`, which does not run when the process dies from a signal, and even then `treeKillSync` sends the signal and returns without waiting. So whenever the Nest CLI watcher is the process that receives the stop signal, it exits right away, and the container ends (SIGKILL to everything left in the PID namespace) while the app is still shutting down. Removing the `npm` wrapper alone does not fix this. As PID 1, a process with no handler also *ignores* SIGTERM, so Docker waits for the grace period and then SIGKILLs it (`Exited (137)`).
- `node --watch` forwards SIGTERM to its child, **waits for the child to exit** and exits with the child's code. Checked on this machine: the child drained for 2 s after SIGTERM, then the watcher exited `0` after ~2.0 s.
- Worst-case length of one `video-processing` attempt: probe timeout 60 s + thumbnail timeout 120 s (`src/media/media.constants.ts`), plus the thumbnail upload. Compose stop timeout defaults to 10 s.
- `nestjs-api` is **not** on the same chain at container level. It has no `command:`, so PID 1 is `tail -f /dev/null` (`Dockerfile.dev` `CMD`), and the API is started by hand with `docker compose exec nestjs-api npm run start:dev`. On `docker compose stop`, `tail` (PID 1, no handler) ignores SIGTERM, and after 10 s everything is SIGKILLed. That is a different mechanism with a different fix. The API also holds no long-running jobs (it only enqueues), so this is a follow-up and not part of this document.

---

## TD-01: Dev start strategy for the video-worker (signal delivery to the node process)

**Scope:** Backend

**Trigger:** `docker compose stop video-worker` must deliver SIGTERM to the worker's node process and let `enableShutdownHooks()` close the BullMQ workers before the container exits, without losing recompile-on-edit or the separate `dist-worker/` build (SI-03.8 runtime criterion, phase 03 step G).

**Context:** The current chain `npm (PID 1) → sh -c → nest start --watch → sh -c → node dist-worker/worker/main` loses the signal at the `npm`/`sh` layer. Per the findings above, the Nest CLI watcher also exits immediately on SIGTERM. So any option that keeps `nest start --watch` as the process receiving the stop signal cannot wait for an active job. The choice touches `compose.yaml`, the `start:worker:dev` script and the worker build config together, which is why it is a cross-file decision and not an implementation detail.

**Options:**

### Option A: Exec-form `nest start --watch` directly, plus `init: true`
- `command:` calls the Nest CLI binary directly (no `npm`), with `--no-shell`; `init: true` puts Docker's tini at PID 1 to forward signals.
- **Pros:** Smallest diff; keeps the current `nest start --watch` workflow and its single process.
- **Cons:** Does not meet the goal. tini forwards SIGTERM to the Nest CLI, which dies at once without waiting. tini then exits and the kernel SIGKILLs the node process mid-shutdown. Exit code and job drain are not guaranteed, so this only shortens the chain.

### Option B: Separate compile-watch and run-watch, with `node --watch` as the main process
- The container starts the worker compile in watch mode in the background (for example `nest build --watch` with the worker tsconfig, or `tsc --watch -p tsconfig.worker.json`, after a first synchronous build). It then `exec`s `node --watch dist-worker/worker/main.js`, so node's watcher becomes PID 1. Wired as one script (e.g. a rewritten `start:worker:dev`) invoked in exec form from `compose.yaml`.
- **Pros:** Uses the only watcher with verified signal forwarding plus waiting, and its exit code becomes the container's. SIGTERM reaches the Nest app, `enableShutdownHooks()` closes BullMQ, and the container exits `0`. Recompile-on-edit is preserved: the compiler rewrites `dist-worker/` and `node --watch` restarts on the changed modules. No new dependency.
- **Cons:** Two processes in one container, with a small shell launcher. The compile step must not wipe `dist-worker/` on every watch start (`deleteOutDir: true` in `nest-cli.json` applies to `nest build`), or node restarts on half-written output. If `tsc` is used instead of `nest build`, the `@nestjs/swagger` CLI plugin is skipped, which is harmless for the worker (it serves no OpenAPI) but should be noted. The compiler and node logs interleave.

### Option C: Process manager / supervisor (nodemon or similar) as PID 1
- Add a dev dependency (e.g. `nodemon`) that watches `src/` or `dist-worker/`, runs the build and restarts node, configured with a signal setting so it forwards SIGTERM and waits.
- **Pros:** One tool covers watch, rebuild and restart, with mature signal handling.
- **Cons:** New dependency for something Node 25 already provides (`node --watch`). Another config file and set of behaviors to learn. No advantage over B for this single entrypoint.

**Recommendation:** Option B — it is the only option without a new dependency that actually waits for the node process to finish its shutdown and passes its exit code to the container, which is the acceptance criterion. Option A was checked against the installed Nest CLI code and cannot meet the criterion. Verification is a documented runtime check, because no test layer in the testing guide covers compose/start commands: start the worker, run `docker compose stop video-worker`, then confirm `docker compose ps -a` shows `Exited (0)`, and confirm that the logs show the Nest shutdown with no `npm error signal SIGTERM`, and that an edit under `src/` still triggers a rebuild into `dist-worker/` and a worker restart. The `nestjs-api` start/stop problem is recorded as a follow-up (see findings).

**Decision:** B (separate compile-watch + `node --watch` as main process)

---

## TD-02: Stop grace period for the video-worker (active job vs. stop latency)

**Scope:** Backend

**Trigger:** The task requires the worker to "esperar o job ativo dentro do stop_grace_period", but the Compose default is 10 s, while one `video-processing` attempt can take up to ~180 s of FFmpeg timeouts plus the thumbnail upload (resolves AMB-1 of the task validation).

**Context:** Depends on TD-01: a grace period only matters once SIGTERM actually reaches the node process. When the period runs out, Docker SIGKILLs the container and the active job comes back only through BullMQ stalled-job recovery (inherited phase-03-videos/TD-01), with an extra delay and an attempt that may count as stalled. The value sits in `compose.yaml` and must match the processing timeouts in `src/media/media.constants.ts`. If those timeouts change, this value must be revisited.

**Options:**

### Option A: Keep the Compose default (10 s)
- No `stop_grace_period`; short jobs (maintenance, small videos) drain, long ones are SIGKILLed and recovered via stall.
- **Pros:** Fast `docker compose stop` / `down` in dev; nothing to keep in sync.
- **Cons:** Does not honor "esperar o job ativo" for real videos; a long attempt is lost and repeated after the stall interval.

### Option B: Grace period sized to the worst-case attempt (≈ 200 s)
- `stop_grace_period` set just above probe + thumbnail timeouts plus upload margin (e.g. `200s`), with a comment pointing to `MEDIA_TIMEOUTS_MS`.
- **Pros:** An active attempt always gets to finish or hit its own timeout before SIGKILL, so the stall path is only a last resort. The value can be traced to existing constants.
- **Cons:** Stopping a busy worker can take up to ~3 min (no wait when idle). The value must be kept in sync with the media timeouts.

### Option C: Moderate fixed window (e.g. 60 s)
- A middle value covering typical dev videos but not the worst case.
- **Pros:** Bounded stop latency; covers most local test files.
- **Cons:** An arbitrary number that does not trace to any constant; the worst case still falls back to stall recovery.

**Recommendation:** Option B — the task's goal is that the active job is not interrupted, and only a window derived from the existing per-attempt timeouts guarantees that. The longer stop happens only while a job is running, and an idle worker still stops in about 200 ms.

**Decision:** B (grace period ≈200 s, derived from media timeouts)

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Backend | Dev start strategy for the video-worker | B — separate compile-watch + `node --watch` as main process | **B** |
| TD-02 | Backend | Stop grace period for the video-worker | B — ≈200 s, derived from media timeouts | **B** |

## Follow-ups (out of scope)

- **`nestjs-api` stop:** PID 1 is `tail -f /dev/null` and the API runs via `docker compose exec`, so `docker compose stop nestjs-api` always waits 10 s and SIGKILLs the API. Fixing it means changing how the API service is started (a `command:` like the worker's), which also changes the documented `docker compose exec nestjs-api npm run start:dev` workflow. Track it as a separate task.
