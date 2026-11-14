# task-fix-migrations-integration-spec — Progress

**Status:** completed
**SIs:** 1/1 completed

**Final verification (2026-11-14):** unit + integration ✅ 233/233 (`npm test -- --runInBand`) · `tsc --noEmit` ✅ · e2e ❌ 16/66 via `npm run test:e2e` (script lacks `--runInBand`; 66/66 with `-- --runInBand`) · lint ❌ 218 errors + 53 warnings, none in files touched by this task. Both failures are pre-existing and out of scope; they are handled in separate branches from `dev` (`test:e2e --runInBand`, `lint-baseline`). The lint `--fix` side effects on `test/support/video-e2e.ts` and `src/videos/videos.service.integration-spec.ts` were reverted.

### SI-1 — Reset sequencial do schema e teardown garantido no spec de migrations
- **Status:** completed
- **Tests:** 3 passing (`migrations.integration-spec.ts`, run twice in a row with `--runInBand`; Jest exits cleanly, no open handles)
- **Observations:**
  - The spec now builds its DataSource with an empty entity list. The old partial list (`User`, `Channel`, `RefreshToken`, `VerificationToken`) broke `initialize()` with "Entity metadata for Channel#videos was not found" after phase 03 added the `Channel → Video` relation. Migrations are raw SQL and need no entity metadata.
  - `afterAll` skips re-migration and `destroy()` when the connection never opened, so a failed `initialize()` is not masked by a second "connection is not yet established" error. The "destroy runs even if runMigrations throws" AC is guaranteed by `try/finally` and was not exercised by a failing test.
  - Pre-existing drift found in the shared DB before the runs: the `videos` table and its two enum types existed, but `CreateVideos1794571199100` had no row in `migrations`. A likely source is `createTestDataSource`'s default `synchronize: true`, used by other integration suites, which creates tables without recording migrations. The spec's reset now repairs this, and after the run all 3 migrations are recorded. Whether other suites should stop using `synchronize: true` is out of scope.
  - The spec resets the whole `public` schema of the database named by `DB_DATABASE` (default `streamtube`), the same database the dev app uses. Behavior is unchanged from before, but a separate test database may be worth a follow-up task.
