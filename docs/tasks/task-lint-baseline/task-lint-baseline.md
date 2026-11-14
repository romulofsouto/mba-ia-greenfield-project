---
kind: task
name: task-lint-baseline
test_specs_aware: true
sources_mtime:
  docs/tasks/task-lint-baseline/context.md: "2026-11-14T10:29:08-03:00"
  docs/tasks/task-lint-baseline/library-refs.md: "2026-11-14T10:29:00-03:00"
  docs/decisions/technical-decisions-lint-baseline.md: "2026-11-14T10:27:47-03:00"
  docs/decisions/technical-decisions-phase-01-configuracao-base.md: "2026-11-11T08:00:03-03:00"
  docs/decisions/technical-decisions-phase-02-auth.md: "2026-11-11T08:00:03-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-11-14T08:32:25-03:00"
---

# Task — Lint Baseline Remediation (nestjs-project)

## Objective

How to bring nestjs-project's pre-existing ESLint baseline (type-checked no-unsafe-*, unbound-method, require-await) to zero so `npm run lint` satisfies the Definition of Done

---

## Step Implementations

### SI-1 — Infra: instalar eslint-plugin-jest

**Description:** Adiciona `eslint-plugin-jest` como devDependency do `nestjs-project`, pré-requisito da regra `jest/unbound-method` que substitui a regra core nos arquivos de teste (per `lint-baseline/TD-02`).

**Technical actions:**

1. Rodar `docker compose exec nestjs-api npm install --save-dev eslint-plugin-jest@^29.17.0` — peers (`eslint ^9`, `typescript <8`, `@typescript-eslint/eslint-plugin ^8`, `jest *`) já satisfeitos pelos instalados (per `lint-baseline/TD-02`; ver `library-refs.md` → `### eslint-plugin-jest`)
2. Commitar `nestjs-project/package.json` + `nestjs-project/package-lock.json` com a nova devDependency

**Tests:** _(empty — Infra)_

**Dependencies:** none

**Acceptance criteria:**

- `nestjs-project/package.json` lista `eslint-plugin-jest` em `devDependencies` com range `^29.17.0`
- `docker compose exec nestjs-api node -e "require('eslint-plugin-jest')"` termina com exit code 0
- `docker compose exec nestjs-api npm ls eslint-plugin-jest` não reporta peer dependency inválida

---

### SI-2 — Configurar override de lint para arquivos de teste

**Description:** Adiciona ao `eslint.config.mjs` um bloco restrito aos globs de teste que desliga os falsos positivos estruturais (`no-unsafe-*` vindos de `res.body: any` do supertest e de mocks parciais `as any`) e troca `unbound-method` pela versão do Jest; produção e helpers continuam com o preset completo (per `lint-baseline/TD-01`, `lint-baseline/TD-02`).

**Technical actions:**

1. Em `nestjs-project/eslint.config.mjs`, importar `jest from 'eslint-plugin-jest'` e acrescentar, **depois** do bloco global de `rules`, um objeto com `files: ['**/*.spec.ts', '**/*.integration-spec.ts', '**/*.e2e-spec.ts']` (per `lint-baseline/TD-01`; ver `library-refs.md` → `### typescript-eslint`)
2. No mesmo bloco, desligar `@typescript-eslint/no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-argument`, `no-unsafe-call` e `no-unsafe-return` — somente esses cinco; `require-await`, `no-unused-vars`, `prettier/prettier` e demais regras permanecem ativas nos testes (per `lint-baseline/TD-01`)
3. No mesmo bloco, registrar `plugins: { jest }`, definir `@typescript-eslint/unbound-method: 'off'` e `jest/unbound-method: 'error'` — sem `jest.configs['flat/recommended']` (ampliaria escopo) e sem `pluginJest.environments.globals` (o projeto já fornece `globals.jest`) (per `lint-baseline/TD-02`; ver `library-refs.md` → `### eslint-plugin-jest`)
4. Manter `tseslint.config(...)` como wrapper — a migração para `defineConfig` é cosmética e fora de escopo (ver `library-refs.md` → `### typescript-eslint`)

**Tests:** _(empty — lint config; verified by the lint-output ACs below)_

**Dependencies:** SI-1 — o import de `eslint-plugin-jest` exige o pacote instalado

**Acceptance criteria:**

- `docker compose exec nestjs-api npx eslint "{src,apps,libs,test}/**/*.ts"` não reporta nenhuma ocorrência de `no-unsafe-*` nem de `@typescript-eslint/unbound-method` em arquivos `*.spec.ts`, `*.integration-spec.ts` ou `*.e2e-spec.ts`
- A mesma execução continua reportando `no-unsafe-*` para `src/channels/channels.service.ts`, `test/support/video-e2e.ts` e `src/test/create-test-data-source.ts` enquanto SI-3/SI-4 não forem aplicados (produção e helpers fora do override)
- A mesma execução continua reportando `require-await` e `no-unused-vars` nos specs enquanto SI-5 não for aplicado (o override não cobre defeitos reais)
- Uma asserção `expect(obj.method).toHaveBeenCalled()` em spec não gera erro, e um método de classe extraído sem `this` em spec (`const fn = instance.method;`) gera `jest/unbound-method`

---

### SI-3 — Remover `as any` da detecção de unique violation em ChannelsService

**Description:** Corrige as 6 ocorrências `no-unsafe-*` de produção em `src/channels/channels.service.ts` estreitando o erro do driver em vez de fazer cast para `any` — produção mantém o preset completo (per `lint-baseline/TD-01`).

**Technical actions:**

1. Reescrever `isPgUniqueViolationOnColumn(err: unknown, column: string)` para, após o guard `err instanceof QueryFailedError`, ler `err.driverError` (tipado em `QueryFailedError<T>`) e estreitá-lo com type guards (`typeof … === 'object'`, `'code' in …`, `typeof detail === 'string'`) — sem `as any` e sem eslint-disable (per `lint-baseline/TD-01`; ver `library-refs.md` → `### typescript-eslint`)
2. Preservar o contrato atual: retorna `true` somente para código `23505` (`PG_UNIQUE_VIOLATION`) com `detail` contendo a coluna; qualquer outro erro (não-`QueryFailedError`, outro código, `detail` ausente/não-string) retorna `false` e segue o fluxo de erro existente
3. Ajustar `makeUniqueError()` em `src/channels/channels.service.spec.ts` para construir o erro via `new QueryFailedError('INSERT', [], driverError)` com `driverError` carregando `code` e `detail` — o fixture deve refletir o formato real do driver `pg` lido pela produção

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `ChannelsService` | Unit: branch logic — retry em unique violation de `nickname`, propagação de outros erros (fixture ajustado) | `src/channels/channels.service.spec.ts` |
| `ChannelsService` | Integration: colisão real de nickname no PostgreSQL continua gerando sufixo aleatório (regressão, sem alteração) | `src/channels/channels.service.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose exec nestjs-api npx eslint src/channels/channels.service.ts` termina sem erros nem warnings
- `src/channels/channels.service.ts` não contém `as any` nem comentários `eslint-disable`
- Criar canal para um usuário cujo nickname derivado já existe persiste o canal com nickname sufixado (comportamento de retry inalterado)
- Erro de banco que não seja unique violation em `nickname` continua sendo propagado sem retry

---

### SI-4 — Tipar helpers de teste compartilhados

**Description:** Corrige as ocorrências dos helpers que nenhum glob de spec cobre — `test/support/video-e2e.ts` e `src/test/create-test-data-source.ts` — mantendo neles o preset completo, já que são importados por várias suítes (per `lint-baseline/TD-01`).

**Technical actions:**

1. Em `test/support/video-e2e.ts` → `registerConfirmAndLogin`, obter o `MailService` pelo container (`app.get(MailService)`) em vez de `(app.get(AuthService) as any).mailService` — elimina `no-unsafe-assignment`/`no-unsafe-member-access` e a asserção desnecessária (per `lint-baseline/TD-01`)
2. No mesmo helper, trocar o `mockImplementationOnce(async (...) => { token = t; })` por implementação que retorna `Promise.resolve()` sem `async` (corrige `require-await`)
3. No mesmo helper, ler `access_token` do `res.body` estreitando o tipo (ex.: `const body = res.body as { access_token: string }`, com verificação de `typeof` antes do retorno) em vez de acessar membro em `any`
4. Em `src/test/create-test-data-source.ts`, substituir `Function` no tipo de `entities` por um tipo construtor explícito (ex.: `new (...args: any[]) => unknown`) compatível com `DataSourceOptions['entities']` (corrige `no-unsafe-function-type`; ver `library-refs.md` → `### typescript-eslint`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `registerConfirmAndLogin` | E2E: suítes consumidoras continuam autenticando via helper (regressão) | `test/videos-upload.e2e-spec.ts` |
| `registerConfirmAndLogin` | E2E: suítes consumidoras continuam autenticando via helper (regressão) | `test/videos-delivery.e2e-spec.ts` |
| `createTestDataSource` | Integration: suítes que criam DataSource de teste continuam inicializando (regressão) | `src/**/*.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose exec nestjs-api npx eslint test/support/video-e2e.ts src/test/create-test-data-source.ts` termina sem erros nem warnings
- Nenhum dos dois helpers contém `as any`, `Function` como tipo, nem comentários `eslint-disable`
- `registerConfirmAndLogin` continua retornando um access token aceito por endpoints autenticados de vídeo
- `npx tsc --noEmit` dentro do container termina com exit code 0 após a troca de tipos

---

### SI-5 — Corrigir defeitos reais nos specs

**Description:** Corrige as ocorrências dos specs que o override de teste deliberadamente não cobre — `async` sem `await`, variáveis/imports não usados e formatação — porque são defeitos reais, não falsos positivos estruturais (per `lint-baseline/TD-01`).

**Technical actions:**

1. Remover `async` (retornando `Promise.resolve(...)` quando o contrato do mock exige Promise) das arrow functions sem `await` em `src/auth/auth.service.integration-spec.ts` (linhas ~72 e ~569), `src/videos/videos.service.spec.ts` (~130, ~131, ~181, ~304, ~308) e `test/auth.e2e-spec.ts` (~67, ~519) — `require-await` (per `lint-baseline/TD-01`)
2. Remover a variável `userId` não usada em `src/auth/auth.service.integration-spec.ts` (~235) e o import `TestingModule` não usado em `src/users/users.service.integration-spec.ts` (~12) — `no-unused-vars`
3. Aplicar a formatação Prettier na chamada `join(__dirname, '../../test/fixtures/sample...')` de `src/videos/videos.service.integration-spec.ts` (~201) — `prettier/prettier`, sem reformatar outros trechos (escopo: só a linha apontada)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `AuthService` | Integration: suíte inalterada em comportamento (regressão) | `src/auth/auth.service.integration-spec.ts` |
| `VideosService` | Unit: suíte inalterada em comportamento (regressão) | `src/videos/videos.service.spec.ts` |
| `VideosService` | Integration: suíte inalterada em comportamento (regressão) | `src/videos/videos.service.integration-spec.ts` |
| `UsersService` | Integration: suíte inalterada em comportamento (regressão) | `src/users/users.service.integration-spec.ts` |
| Auth HTTP | E2E: suíte inalterada em comportamento (regressão) | `test/auth.e2e-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose exec nestjs-api npx eslint` sobre os 5 arquivos listados não reporta `require-await`, `no-unused-vars` nem `prettier/prettier`
- Nenhum comentário `eslint-disable` é adicionado para silenciar essas regras
- O número de testes executados e aprovados em cada uma das 5 suítes é o mesmo de antes da mudança

---

### SI-6 — Ativar gate de zero warnings e documentar

**Description:** Torna o `npm run lint` reprovável por qualquer warning e registra a nova semântica na documentação do subprojeto, fechando o baseline em zero (per `lint-baseline/TD-03`).

**Technical actions:**

1. Em `nestjs-project/package.json`, acrescentar `--max-warnings 0` ao script `lint` (mantendo o glob `"{src,apps,libs,test}/**/*.ts"` e o `--fix` existentes — separar `lint`/`lint:fix` está fora de escopo) (per `lint-baseline/TD-03`)
2. Atualizar `nestjs-project/CLAUDE.md` — seção `## Code Conventions` (linha ESLint) e a linha `npm run lint` em `## Commands` — para registrar que o lint falha com qualquer warning e que specs têm override para `no-unsafe-*` + `jest/unbound-method` (per `lint-baseline/TD-01`, `lint-baseline/TD-02`, `lint-baseline/TD-03`)

**Tests:** _(empty — gate config + docs; verified by the lint-run ACs below)_

**Dependencies:** SI-2, SI-3, SI-4, SI-5 — o gate só pode ser ativado com o baseline já em zero

**Acceptance criteria:**

- `docker compose exec nestjs-api npm run lint` termina com exit code 0 e reporta 0 erros e 0 warnings
- Introduzir temporariamente um warning (ex.: um `no-floating-promises` em arquivo de `src/`) faz `npm run lint` terminar com exit code ≠ 0
- `git diff` após `npm run lint` não mostra alterações em arquivos `.ts` (o `--fix` não tem mais nada a corrigir)
- `nestjs-project/CLAUDE.md` descreve o gate de zero warnings e o override de testes

---

## Dependency Map

```
SI-1 (root)
└── SI-2 — depends on SI-1 (override importa eslint-plugin-jest)
    └── SI-6 — depends on SI-2, SI-3, SI-4, SI-5 (gate de zero warnings só com baseline zerado)
SI-3 (root, independent) ──┐
SI-4 (root, independent) ──┼── SI-6
SI-5 (root, independent) ──┘
```

---

## Deliverables

- [ ] SI-1 — Infra: instalar eslint-plugin-jest
- [ ] SI-2 — Configurar override de lint para arquivos de teste
- [ ] SI-3 — Remover `as any` da detecção de unique violation em ChannelsService
- [ ] SI-4 — Tipar helpers de teste compartilhados
- [ ] SI-5 — Corrigir defeitos reais nos specs
- [ ] SI-6 — Ativar gate de zero warnings e documentar

**Full test suites:**

- [ ] Backend tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes with zero errors and zero warnings (`docker compose exec nestjs-api npm run lint`)
