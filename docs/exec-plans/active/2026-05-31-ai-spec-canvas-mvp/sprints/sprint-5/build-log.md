# Build Log: Sprint 5 — Typed Agent Action Planning and Dry-Run/Apply Boundary

## Round 1

### What Was Built
- `apps/web/src/lib/agent-actions.ts` — pure typed action-plan contract, runtime validation, stale-context checks, and dry-run expected-impact results.
- `apps/web/src/lib/agent-actions.test.ts` — focused Vitest coverage for supported actions, malformed/unsafe/stale plans, dry-run serialization, and no-mutation behavior.
- `apps/web/src/lib/tldraw-agent-actions.ts` — thin tldraw editor apply adapter for the supported action set.
- `apps/web/src/components/canvas-shell.tsx` — registers `window.__PSG_AGENT_ACTIONS__` beside the existing canvas context hook while the editor is mounted.
- `apps/web/e2e/canvas-smoke.spec.ts` — browser smoke now validates action hook presence, dry-run no-mutation markers, explicit apply, and stale-plan refusal.

### Acceptance Criteria Status
| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-5.1 | Typed schemas or equivalent runtime validators exist for focused supported actions. | PASS | `agent-actions.ts` defines the plan/action/result contracts and validators for `createText`, `createGeoRectangle`, `moveShape`, `updateText`, `deleteShapes`, and `selectShapes`; unit tests exercise valid fixtures for each. |
| AC-5.2 | Validation rejects malformed, unsupported, stale, missing-target, non-finite, oversized, or unsafe plans with inspectable errors and no mutation. | PASS | `agent-actions.test.ts` covers unsupported kind, oversized text, duplicate create id, non-finite position, missing target, stale recent-change count, and empty target list; tests compare input context before/after validation. |
| AC-5.3 | Stale-context checks use Sprint 4 context contract markers. | PASS | `createContextReference` records `schemaVersion`, source adapter/source-of-truth, observed recent-change count, shape ids, and affected shape ids. Unit tests cover source mismatch and recently affected target refusal. |
| AC-5.4 | Dry-run returns serializable expected impact and leaves document/selection/viewport/recent-change markers unchanged. | PASS | Unit tests assert dry-run expected impact, safety notes, JSON serialization, and unchanged input context; E2E compares context markers before and after dry-run. |
| AC-5.5 | Apply is separated from validation and dry-run, requires explicit `apply`, and reports inspectable outcome. | PASS | `tldraw-agent-actions.ts` only mutates through explicit `applyAgentActionPlanToEditor`; E2E calls `apply` and observes the created text shape through the context hook. |
| AC-5.6 | Runnable shell still loads first and exposes both developer hooks. | PASS | `canvas-smoke.spec.ts` verifies tldraw host, `__PSG_CANVAS_CONTEXT__`, and `__PSG_AGENT_ACTIONS__`. |
| AC-5.7 | No AI calls, chat UI, autonomous apply, real collaboration, or graph-protocol dependency introduced. | PASS | Source search found no graph-protocol imports or model-call code in app surfaces; remaining autonomous/collaboration matches are explicit constraint/status labels. |

### Behavior Scenario Evidence
- Validate a proposed canvas action plan: `validateAgentActionPlan` returns JSON-safe validation results and unit tests cover valid/invalid supported actions.
- Dry-run an action plan: `dryRunAgentActionPlan` wraps validation and returns expected-impact data with safety notes; unit and E2E checks confirm no context marker change.
- Apply an explicitly accepted plan: `applyAgentActionPlanToEditor` validates first, then maps supported actions to tldraw editor calls only inside explicit apply; E2E confirms a text shape appears after apply.
- Reject stale or unsafe assumptions: stale schema/source/change/shape-id checks live in the pure module; E2E reuses a stale create plan after apply and receives `STALE_SHAPE_IDS`.
- Inspect action boundary from the runnable shell: browser smoke waits for both developer hooks and exercises validate, dry-run, apply, and stale refusal without product UI.

### TDD Decision & Evidence
Use TDD: Yes

Evidence:
- RED: Added focused Sprint 5 action tests and ran `pnpm --filter @production-spec-graph/web test:unit`; the new tests failed because the action boundary/helper contract was not yet aligned (`createAgentContextReference is not a function`, 4 failing tests).
- GREEN: Refined the action test fixtures around the implemented batch plan contract, completed the pure validation/dry-run behavior, and reran unit tests successfully: 2 files and 7 tests passed.
- REFACTOR: Kept action validation/dry-run in `agent-actions.ts`, live tldraw mutation in `tldraw-agent-actions.ts`, and React lifecycle wiring in `canvas-shell.tsx`. Typecheck, build, and E2E stayed green.

### E2E / Runtime Verification
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, Playwright Chromium 1 passed.
- The smoke test opens `/`, confirms the tldraw shell, waits for context/action hooks, validates and dry-runs a safe create-text plan, compares context markers before/after dry-run, explicitly applies the plan, verifies the created shape appears in extracted context, and confirms reusing the stale plan is refused without mutation.

### Modularity & Readability Notes
- The pure action module depends only on plain TypeScript data and the Sprint 4 `CanvasContext` type.
- The tldraw adapter is the only Sprint 5 module that imports `Editor` and maps validated plans to `createShape`, `updateShape`, `deleteShapes`, and selection calls.
- `CanvasShell` remains a composition component: it mounts tldraw, tracks recent changes, exposes context/action hooks, and unregisters both hooks on cleanup.
- There is no product UI for actions yet; the boundary is intentionally developer-facing for future AI agent integration.

### Human Checkpoint
Pause here before F6 because Sprint 5 is the first programmatic mutation boundary.

Recommended local commands:
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web build`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm --filter @production-spec-graph/web dev`

Inspect:
- Open `http://127.0.0.1:3000`.
- Confirm the app opens directly to the tldraw canvas shell.
- In the browser console, call `window.__PSG_CANVAS_CONTEXT__.extract()`.
- Build a plan with a context reference matching the extracted context, then call `window.__PSG_AGENT_ACTIONS__.validate(plan)` and `dryRun(plan)`; the context should not change.
- Call `window.__PSG_AGENT_ACTIONS__.apply(plan)` explicitly for a safe create/select plan and confirm the context hook shows the expected shape or selection change.
- Reuse an older plan after the canvas changes and confirm the hook refuses it with inspectable stale errors.

### Quality Command Results
- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 2 files and 7 tests passed.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, Playwright Chromium 1 passed.
- `git diff --check`: PASS.
- Prohibited dependency/behavior search: PASS for no `@production-spec-graph/graph-protocol` imports or AI model-call code; remaining autonomous/collaboration matches are expected constraint/status labels.

### Known Issues
- The browser hook uses a developer-facing batch plan shape (`{ context, actions }`) rather than product UI. That is intentional for this MVP boundary.
- Playwright/Next may emit `NO_COLOR`/`FORCE_COLOR` warnings during E2E; tests pass.
