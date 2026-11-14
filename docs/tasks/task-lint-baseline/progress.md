# task-lint-baseline — Progress

**Status:** completed
**SIs:** 6/6 completed

### SI-1 — Infra: instalar eslint-plugin-jest
- **Status:** completed
- **Tests:** no tests (Infra)
- **Observations:**
  - `npm install` reported pre-existing `npm audit` vulnerabilities in the dependency tree; not touched (out of scope).
  - Commit of `package.json` + `package-lock.json` left to the user (git operations are out of `/implement` scope).

### SI-2 — Configurar override de lint para arquivos de teste
- **Status:** completed
- **Tests:** no tests (lint config) — verified: eslint (no `--fix`) went from 222 errors / 53 warnings to 24 errors / 0 warnings, all owned by SI-3/SI-4/SI-5; temporary probe spec confirmed `expect(obj.method)` allowed and `const fn = obj.method` flagged by `jest/unbound-method` (probe deleted)
- **Observations:** none

### SI-3 — Remover `as any` da detecção de unique violation em ChannelsService
- **Status:** completed
- **Tests:** 10 passing (5 unit `channels.service.spec.ts`, 5 integration `channels.service.integration-spec.ts`)
- **Observations:** none

### SI-4 — Tipar helpers de teste compartilhados
- **Status:** completed
- **Tests:** 137 passing (E2E: 14 in `videos-upload` + `videos-delivery`; integration: 123 across 20 suites); `tsc --noEmit` clean
- **Observations:**
  - `registerConfirmAndLogin` now throws an explicit error when the login response lacks a string `access_token`, instead of returning `undefined` cast to `string`.

### SI-5 — Corrigir defeitos reais nos specs
- **Status:** completed
- **Tests:** 108 passing (auth.service.integration-spec 25/25, videos.service.spec 27/27, videos.service.integration-spec 4/4, users.service.integration-spec 7/7, auth.e2e-spec 45/45); test-case declarations unchanged vs HEAD in all 5 files
- **Observations:**
  - `auth.service.integration-spec.ts` and `test/auth.e2e-spec.ts` still reach `MailService` via `(authService as any).mailService`; allowed by the test-file override (TD-01) and left as-is. `app.get(MailService)` (as done in SI-4 for the shared helper) would be a cleaner follow-up.

### SI-6 — Ativar gate de zero warnings e documentar
- **Status:** completed
- **Tests:** no tests (gate config + docs) — verified: `npm run lint` exit 0 with 0 errors / 0 warnings and no `--fix` changes; temporary `no-floating-promises` probe made eslint `--max-warnings 0` exit 1 (probe deleted)
- **Observations:**
  - `lint` script still combines `--fix` with the gate (the DoD check mutates files); splitting into `lint` / `lint:fix` remains a follow-up noted in the decisions doc.
