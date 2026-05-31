# Contract Review: Sprint 5

## Verdict: APPROVED

Sprint 5 is well-scoped to F5, depends on completed F4 context extraction, and preserves the tldraw-first direction. The contract explicitly excludes AI calls, chat, autonomous editing, real collaboration, and custom flowchart protocol dependency.

## Evidence

- Scope covers one feature: F5 typed agent action planning and dry-run/apply boundary, matching `spec.md` AC-5.1 through AC-5.5.
- Behavior scenarios appear before acceptance criteria and cover validation, dry-run, explicit apply, stale-context refusal, and runnable-shell inspection.
- TDD Decision is present and appropriate for deterministic validators, stale checks, and dry-run data transformations, with RED/GREEN/REFACTOR evidence planned.
- Runtime/E2E plan is present: `pnpm --filter @production-spec-graph/web test:e2e` must exercise the browser hook, validate/dry-run/apply a safe plan, and verify no mutation for validation/dry-run.
- Modularity/readability expectations are explicit: pure action contract module, thin tldraw apply adapter, and minimal React shell wiring.
- Human Checkpoint is present with local commands and manual console inspection steps before proceeding beyond this first programmatic mutation boundary.
- Dependencies are satisfied: `meta.json` marks F4 completed, and Sprint 4 evaluation passed the `CanvasContext` extraction boundary that F5 consumes.

## Guardrail Check

- No custom graph protocol revival: contract excludes `@production-spec-graph/graph-protocol` dependency and requires source search/code review.
- No AI/chat/autonomous editing: explicitly out of scope and covered by AC-5.7.
- Validation/dry-run/apply boundary is not blurred: validation and dry-run are required to be pure/non-mutating, while mutation is isolated behind explicit `apply`.
- Stale-context checks are required: schema version, source adapter/source-of-truth, observed change count, current shape ids, and affected recent shape ids are named in scope and AC-5.3.
- Real collaboration is not over-scoped: collaboration, sync, remote presence, persistence, auth, and multi-user conflict resolution are explicitly out of scope.

Proceed to implementation.
