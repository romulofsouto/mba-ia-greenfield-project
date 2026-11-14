---
kind: task
name: task-phase-03-dod-closure
status: clean
issue_count: 0
sources_mtime:
  docs/tasks/task-phase-03-dod-closure/context.md: "2026-11-14 10:59:50.745460919 -0300"
issues:
  - id: AMB-1
    status: resolved
    summary: "src/worker/* — only worker test files, or worker production files too?"
    resolved_by: clarification
  - id: AMB-2
    status: resolved
    summary: "Scope says 'erros' but lint-baseline/TD-03 gate also fails on warnings"
    resolved_by: clarification
---

# task-phase-03-dod-closure — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

_None._

### Missing Decisions

_None._

### Inherited Constraint Conflicts

_None._

### Unresolved Open Questions

_None._

### UI Coverage Gaps

_None._

## Resolved Issues

- **AMB-1** _(resolved_by clarification)_ — src/worker/* — only worker test files, or worker production files too? User chose (b): **every file under `src/worker/`** — production and tests — so `npm run lint` is green for the whole worker. Production worker files stay under the strict type-checked rules (no test-file override, per `lint-baseline/TD-01`).
- **AMB-2** _(resolved_by clarification)_ — Scope says 'erros' but lint-baseline/TD-03 gate also fails on warnings. User chose (a): zero **errors and warnings** in the listed files, aligned with `lint-baseline/TD-03` (`--max-warnings 0`), so the DoD item `npm run lint` actually closes.
