---
libs:
  "typescript-eslint":
    version: "8.57.0"
    context7_id: "/typescript-eslint/typescript-eslint/v8.64.0"
    fetched_at: "2026-11-14T10:28:43-03:00"
  "eslint-plugin-jest":
    version: "^29.17.0"
    context7_id: "n/a — not indexed by Context7; source: npm tarball eslint-plugin-jest@29.17.0 (README.md + docs/rules/unbound-method.md)"
    fetched_at: "2026-11-14T10:28:43-03:00"
sources_mtime:
  docs/decisions/technical-decisions-lint-baseline.md: "2026-11-14T10:27:47-03:00"
---

# Library References — task-lint-baseline

### typescript-eslint

**Installed:** 8.57.0 (`recommendedTypeChecked`, `projectService: true`). Context7 serves v8.64.0, a minor-version gap; the APIs below didn't change across that range.

**Per-file rule overrides (flat config).** Add a config object with `files` that targets test globs and turns rules `off`. Later objects in the array win over earlier ones, so the test block must come **after** `...tseslint.configs.recommendedTypeChecked` and after the project's global `rules` block:

```js
{
  files: ['**/*.spec.ts', '**/*.integration-spec.ts', '**/*.e2e-spec.ts'],
  rules: {
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
  },
}
```

- `no-unsafe-type-assertion` docs, "When Not To Use It": _"If your project frequently stubs objects in test files … consider disabling the rule for such files."_ The `no-unsafe-*` family gives the same guidance ("skip the `no-unsafe-*` rules pending increasing type safety").
- `unbound-method` docs: _"If you're wanting to use `toBeCalled` and similar matches in `jest` tests, you can disable this rule for your test files in favor of `eslint-plugin-jest`'s version of this rule."_
- `tseslint.config(...)` is **`@deprecated` in 8.57.0** (`dist/config-helper.d.ts`: "ESLint core now provides this functionality via `defineConfig()`"). It still works. Migrating `eslint.config.mjs` to `defineConfig` from `eslint/config` is a cosmetic change and **out of scope** for this task, so keep `tseslint.config` and only add config objects.
- Production and helper fixes keep the full preset. Relevant rule intents:
  - `no-unsafe-*`: narrow `unknown`/`any` with type guards instead of casting to `any`. For `QueryFailedError`, use its typed `driverError` and narrow it.
  - `no-unsafe-function-type`: replace `Function` with an explicit constructor or callable type, e.g. `new (...args: any[]) => unknown`.
  - `require-await`: remove `async` from functions that never `await`, or return the promise directly.
  - `no-unnecessary-type-assertion`: remove the redundant `as X`.

### eslint-plugin-jest

**Version to install:** `eslint-plugin-jest@^29.17.0` (devDependency). Peer deps: `eslint ^8.57.0 || ^9.0.0 || ^10.0.0`, `typescript >=4.8.4 <8.0.0`, `@typescript-eslint/eslint-plugin ^8.0.0`, `jest *`. All are satisfied by the installed ESLint 9.39.4, TS 5.9.3, typescript-eslint 8.57.0 and Jest 30.

**`jest/unbound-method`** (`docs/rules/unbound-method.md`): _"This rule extends the base `@typescript-eslint/unbound-method` rule … It adds support for understanding when it's ok to pass an unbound method to `expect` calls."_ It needs type information, which the project already provides via `projectService`. It takes the same options as the base rule (e.g. `ignoreStatic`). Upstream guidance: _"you should turn the original rule off **only** for test files"_ and keep `@typescript-eslint/unbound-method` on everywhere else.

**Flat config usage** (README, flat-config section). Import the plugin and register it in a `files`-scoped block:

```js
import jest from 'eslint-plugin-jest';

{
  files: ['**/*.spec.ts', '**/*.integration-spec.ts', '**/*.e2e-spec.ts'],
  plugins: { jest },
  rules: {
    '@typescript-eslint/unbound-method': 'off',
    'jest/unbound-method': 'error',
  },
}
```

- `jest.configs['flat/recommended']` also exists (it enables `no-focused-tests`, `valid-expect`, etc.). Adopting it would be a scope expansion beyond TD-02 because it could surface new findings. Register only the plugin and `jest/unbound-method` here.
- Globals: the project already supplies `globals.jest` in `languageOptions`, so `pluginJest.environments.globals` isn't needed.
