---
kind: task
name: task-fix-migrations-integration-spec
status: clean
issue_count: 0
sources_mtime:
  docs/tasks/task-fix-migrations-integration-spec/context.md: "2026-11-14T08:42:26-03:00"
issues:
  - id: AMB-1
    status: resolved
    summary: "Shared-DB reset vs. other integration suites running concurrently"
    resolved_by: clarification
  - id: AMB-2
    status: resolved
    summary: "Cleanup target set: hardcoded tables/enums vs. catalog-driven discovery"
    resolved_by: clarification
advisories: []
---

# task-fix-migrations-integration-spec — Validation

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

- **AMB-1** _(resolved_by clarification)_ — Shared-DB reset vs. other integration suites running concurrently. Clarified: keep the reset in the shared database and guarantee the integration suites never overlap — integration runs serialized (`--runInBand` / `maxWorkers: 1`); confirm the existing guarantee in the integration Jest config/script, or add it as part of this task.
- **AMB-2** _(resolved_by clarification)_ — Cleanup target set: hardcoded tables/enums vs. catalog-driven discovery. Clarified: catalog-driven discovery — query `pg_tables` and `pg_type` (`typtype = 'e'`) in the target schema and drop each object sequentially (tables first, then enum types), so future migrations need no spec update.
