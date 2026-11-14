---
scope_type: ad-hoc
related_phases: []
status: decided
date: 2026-11-14
scope_description: "How to bring nestjs-project's pre-existing ESLint baseline (type-checked no-unsafe-*, unbound-method, require-await) to zero so `npm run lint` satisfies the Definition of Done"
---

# Technical Decisions — Lint Baseline Remediation (nestjs-project)

_Subprojects in scope:_

- `nestjs-project/` — owns every offending file and `eslint.config.mjs`; all TDs below apply here.
- `next-frontend/` — no open decision: it has its own ESLint config and is not part of this baseline.

**Installed versions** (from `nestjs-project/node_modules`): `eslint` 9.39.4, `typescript-eslint` 8.57.0 (`recommendedTypeChecked` preset, `projectService: true`), `typescript` 5.9.3, `supertest` 7.2.2 / `@types/supertest` 6.0.3, `jest` 30. `eslint-plugin-jest` is **not** installed.
_Docs check:_ context7 serves typescript-eslint v8.64.0 and ESLint v9.39.3. That is a minor-version gap from the installed 8.57.0 / 9.39.4. The rules and flat-config APIs cited here (`files` overrides, `unbound-method`, `disableTypeChecked`) are unchanged across that range.

**Measured baseline** (2026-11-14, `npx eslint "{src,apps,libs,test}/**/*.ts"` without `--fix`): **222 errors and 53 warnings**. The task brief said 150 errors and 40 warnings, so the baseline has grown since that count was taken.

| Rule | Severity | Count | Where |
|---|---|---|---|
| `no-unsafe-member-access` | error | 129 | specs and e2e (`res.body.*`, `as any` mocks) + 3 in `channels.service.ts` |
| `no-unsafe-argument` | **warn** | 53 | specs (`{...} as any` passed to `mockResolvedValue`) |
| `no-unsafe-assignment` | error | 51 | specs and e2e + 1 in `channels.service.ts` |
| `unbound-method` | error | 19 | all in `src/auth/auth.service.spec.ts` (`expect(svc.method).toHaveBeenCalled…`) |
| `require-await` | error | 10 | specs and `test/support/video-e2e.ts` |
| `no-unsafe-return` / `no-unsafe-call` | error | 6 / 2 | specs + `channels.service.ts` |
| `no-unused-vars`, `no-unnecessary-type-assertion`, `no-unsafe-function-type`, `prettier/prettier` | error | 2 / 1 / 1 / 1 | specs, `test/support/video-e2e.ts`, `src/test/create-test-data-source.ts` |

Distribution:

- 263 of 275 findings are in `*.spec.ts`, `*.integration-spec.ts` or `*.e2e-spec.ts` files.
- 6 are in production code (`src/channels/channels.service.ts`, `isPgUniqueViolationOnColumn` casting `QueryFailedError` to `any`).
- 6 are in **test helpers that no spec glob matches**: `test/support/video-e2e.ts` (5) and `src/test/create-test-data-source.ts` (1).

Root cause of most test findings: `@types/superagent` declares `Response.body: any`, so every `res.body.x` access is reported. Mocks built with `{...} as any` add the rest.

---

## TD-01: Remediation strategy for the type-checked lint baseline

**Scope:** Backend

**Trigger:** The DoD requires `npm run lint` to pass. The current baseline fails it. That blocks every future task from being "done" and hides new violations among the old ones.

**Context:** The `no-unsafe-*` family exists to stop `any` from spreading. In production code that matters. In tests, `any` mostly comes from supertest's `body: any` and from partial mocks. The typescript-eslint docs say both things: "it may be easier to skip the `no-unsafe-*` rules pending increasing type safety" and "if your project frequently stubs objects in test files … consider disabling the rule for such files". Either choice is supported upstream. Whatever is chosen also decides how much type-safety the e2e suites give against the response contracts documented by `openapi-docs-nestjs/TD-01` (`@nestjs/swagger`). Response DTOs exist today only for videos (`src/videos/dto/video-response.dto.ts`).

**Options:**

### Option A: Fix all the code, no overrides
- Fix `channels.service.ts` by narrowing `QueryFailedError.driverError` instead of casting to `any`. Add typed response helpers for e2e, e.g. `bodyOf<T>(res)` or `res.body as AuthTokensResponse`, built from response DTOs / OpenAPI shapes. Type mocks with `jest.Mocked<T>` / `Partial<T>`. Remove `async` where nothing is awaited.
- **Pros:** Keeps the full preset everywhere. E2e assertions are checked against real response shapes, so a renamed field fails at compile time. Sets a clean precedent with no exceptions to explain.
- **Cons:** Touches about 20 files and roughly 260 findings. It needs response types for auth endpoints that have no DTO yet, which is scope creep toward an OpenAPI-typing task. `res.body as X` is an unchecked assertion: it silences the rule without proving the shape, so much of the type-safety gain is nominal. The 19 `unbound-method` hits on `expect(mock.fn)` are false positives that can't be cleanly "fixed" without workarounds such as `jest.mocked` extraction or `this: void`.

### Option B: Override rules for test files only
- Add a `files: ['**/*.spec.ts', '**/*.integration-spec.ts', '**/*.e2e-spec.ts']` block to `eslint.config.mjs` that turns off `no-unsafe-*` and `unbound-method`. Production stays untouched.
- **Pros:** Smallest change (one config block). Matches the upstream "When Not To Use It" guidance. No churn in test files.
- **Cons:** **Does not reach zero on its own.** `channels.service.ts` (6), the two unmatched helpers (6), `require-await` (10), `no-unused-vars` (2) and `prettier` (1) still fail. It also blanket-disables checks in tests, so future `any` leaks in specs are never reported. And it leaves a production `as any` in place, which contradicts the CLAUDE.md "Type Safety: strict TypeScript across all layers" principle.

### Option C: Hybrid — fix production and genuine defects, narrow test override for structural false positives
- **Fix in code:** `channels.service.ts` (typed driver-error narrowing), `src/test/create-test-data-source.ts` (`Function` → constructor type), `test/support/video-e2e.ts`, all `require-await` / `no-unused-vars` / `no-unnecessary-type-assertion` / `prettier` hits. These are real defects, about 25 findings.
- **Override in tests:** add one test-files block. It turns off `unbound-method` (see TD-02) and the `no-unsafe-*` rules whose source is `res.body: any` and `as any` partial mocks.
- **Pros:** Production and shared helpers get full strictness. Real defects are fixed, not hidden. Test churn stays small. The override is explicit and limited to one config block with one stated reason.
- **Cons:** Tests stay "`any`-tolerant", so e2e response shapes remain unchecked until an OpenAPI-typed client or DTOs exist. Two policies to explain (src vs tests). The helper files must be fixed rather than covered, otherwise the glob has to grow.

**Recommendation:** **Option C.** Option B can't reach a passing `npm run lint` without also fixing the 25 real defects, so it ends up as C in practice. Option A spends most of its effort writing `as XResponse` assertions that give little real safety, since supertest can't verify the body type. C keeps the strictness where it matters: production code and shared test helpers that other specs import. It fixes everything that is an actual defect (`async` without `await`, unused vars, a production `as any`) and suppresses only the two finding classes upstream documents as test-file false positives. Typed e2e responses should be a separate future task, done when auth/user response DTOs exist (per `openapi-docs-nestjs/TD-01`), not forced inside a lint cleanup.

**Decision:** C (Hybrid — fix production, helpers and real defects; narrow test-file override for `no-unsafe-*`)
**Libraries:** typescript-eslint

---

## TD-02: Handling `unbound-method` in Jest specs

**Scope:** Backend

**Trigger:** 19 errors in `auth.service.spec.ts` come from `expect(usersService.createUserWithChannel).toHaveBeenCalledWith(...)`, a standard Jest idiom that the core rule flags. _(Depends on TD-01: relevant under Options B/C. Under Option A it decides how the 19 hits get "fixed".)_

**Context:** The typescript-eslint docs for `unbound-method` recommend disabling the core rule for test files "in favor of `eslint-plugin-jest`'s version of this rule, which knows when it's ok to pass an unbound method to `expect` calls". That plugin isn't installed today.

**Options:**

### Option A: Swap for `jest/unbound-method` (add `eslint-plugin-jest`)
- Install `eslint-plugin-jest`. In the test-files block, set `@typescript-eslint/unbound-method: off` and `jest/unbound-method: error`.
- **Pros:** The upstream-recommended path. Still catches real unbound-method bugs in specs and allows only the `expect(...)` idiom. It also opens the door to other useful Jest rules (`no-focused-tests`, `valid-expect`) later.
- **Cons:** One new dev dependency and a plugin to keep compatible with ESLint 9 / typescript-eslint 8.

### Option B: Turn the rule off for test files
- `@typescript-eslint/unbound-method: off` in the test-files block. No new dependency.
- **Pros:** Zero dependencies, one line.
- **Cons:** Loses detection of genuine unbound-method bugs in specs. That risk is low but not zero.

### Option C: Rewrite assertions to avoid the reference
- Use `jest.mocked(...)` / keep mock function references in local consts (`const createUser = jest.fn(); … expect(createUser)…`).
- **Pros:** No config change, and the core rule stays on everywhere.
- **Cons:** 19 edits plus a convention every future spec must follow. It works against the idiomatic `expect(service.method)` style already used throughout the suites.

**Recommendation:** **Option A** if adding `eslint-plugin-jest` is acceptable: it's the documented path and keeps a real check. Otherwise **Option B**: the risk it accepts is small, and Option C costs ongoing convention overhead to avoid a false positive.

**Decision:** A (`eslint-plugin-jest` — `jest/unbound-method` replaces the core rule in test files)
**Libraries:** eslint-plugin-jest

---

## TD-03: Lint gate threshold — do warnings fail the DoD?

**Scope:** Backend

**Trigger:** `no-unsafe-argument` (53) and `no-floating-promises` are set to `warn`. ESLint exits 0 when only warnings remain, so "`npm run lint` passes" could still mean 53 warnings.

**Context:** The DoD says lint must pass but doesn't define warnings. This decides what "zero baseline" means for TD-01. Note also that `npm run lint` runs `eslint … --fix`, so the DoD gate rewrites files as it runs. Whether to split it into `lint` / `lint:fix` is noted under Out of scope.

**Options:**

### Option A: Errors-only gate (status quo semantics)
- `npm run lint` passes when there are no errors. Warnings stay informational.
- **Pros:** No config change. Matches ESLint's default exit semantics.
- **Cons:** Warnings pile up silently, the same way this baseline grew from roughly 190 to 275 findings. `no-floating-promises` as warn means unawaited promises in production code never block a merge.

### Option B: Zero-warning gate (`--max-warnings 0`)
- Add `--max-warnings 0` to the lint script. The 53 `no-unsafe-argument` warnings must then be fixed or covered by the TD-01 test override.
- **Pros:** "Passes" means "clean". No silent drift. `no-floating-promises` effectively becomes blocking.
- **Cons:** Any warn-level rule becomes blocking, so the `warn` vs `error` distinction in the config loses meaning. It may be better to just promote those rules to `error`.

**Recommendation:** **Option B.** The baseline grew while nobody looked, which is exactly the failure mode of an errors-only gate. With TD-01 Option C, the 53 warnings are all in spec files and fall under the test override anyway, so `--max-warnings 0` costs nothing extra now and stops future drift.

**Decision:** B (Zero-warning gate — `--max-warnings 0`)
**Libraries:** —

---

## Out of scope (separate tasks)

- `npm run lint` uses `--fix`, so the DoD gate mutates the working tree. Consider splitting into `lint` (check) and `lint:fix`.
- Typed e2e responses (auth/user response DTOs or an OpenAPI-generated client for supertest assertions). Revisit once those DTOs exist.

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Backend | Remediation strategy for the lint baseline | C — fix production/helpers/real defects; narrow override for test-file `no-unsafe-*` | C |
| TD-02 | Backend | `unbound-method` in Jest specs | A — `eslint-plugin-jest` `jest/unbound-method` (fallback: B, off in tests) | A |
| TD-03 | Backend | Lint gate threshold (warnings) | B — `--max-warnings 0` | B |
