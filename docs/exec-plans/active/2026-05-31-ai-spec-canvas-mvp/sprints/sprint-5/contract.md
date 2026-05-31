# Sprint 5 Contract: Typed Agent Action Planning and Dry-Run/Apply Boundary

## Feature
F5: Typed Agent Action Planning and Dry-Run/Apply Boundary

## Scope
Add a developer-facing, tldraw-first action planning boundary that future AI callers could use to validate, dry-run, and explicitly apply a small set of safe canvas actions. The boundary must consume the Sprint 4 `CanvasContext` contract, keep validation and dry-run pure/non-mutating where practical, and isolate actual tldraw editor mutation behind an explicit apply call.

This sprint implements:

- typed action plan structures and validators for a focused first set of supported operations:
  - create a `text` shape with bounded text and position
  - create a simple `geo` rectangle shape with optional bounded text, position, and size
  - move an existing shape by id to an absolute position
  - update text on supported text-bearing shapes when the current context indicates text support
  - delete existing shapes by id
  - select/focus existing shapes by id without changing document content
- context-reference and stale-plan checks based on Sprint 4 `CanvasContext.schemaVersion`, `source.adapter`, `source.sourceOfTruth`, `recentChanges.observedChangeCount`, current shape ids, and affected recent shape ids where relevant
- pure validation and dry-run helpers that return JSON-serializable success/error/expected-impact results and do not require a live tldraw editor
- a thin tldraw apply adapter that executes only validated supported actions through the mounted editor
- a developer-facing browser hook/API, such as `window.__PSG_AGENT_ACTIONS__`, with explicit `validate(plan)`, `dryRun(plan)`, and `apply(plan)` methods while the canvas shell is mounted
- focused unit tests for deterministic validation, stale-context detection, dry-run no-mutation semantics, expected impact, and malformed/unsupported plans
- an updated E2E smoke path that verifies the runnable canvas still loads, the context hook remains available, the action hook validates/dry-runs/applies an explicit safe plan, and dry-run does not mutate canvas context

Expected files/modules to create or edit:

- Create `apps/web/src/lib/agent-actions.ts` or equivalent for public plan/result types, runtime validation, stale checks, and pure dry-run planning.
- Create `apps/web/src/lib/tldraw-agent-actions.ts` or equivalent for the live editor apply adapter.
- Add focused tests near the action module, for example `apps/web/src/lib/agent-actions.test.ts`.
- Edit `apps/web/src/components/canvas-shell.tsx` only enough to register/unregister the developer action hook using the mounted editor and existing context extraction boundary.
- Update `apps/web/e2e/canvas-smoke.spec.ts` to exercise the developer action hook without adding product UI.
- Edit package scripts only if required by validation, but the current `test:unit`, `test:e2e`, `typecheck`, and `build` scripts should be sufficient.

## Out of Scope
- No AI model calls, prompt execution, chat workflow, autonomous agent behavior, generated plans, or automatic application of edits.
- No product-facing action proposal UI, chat panel, approval UI, timeline, inspector, or agent presence indicator.
- No real collaboration, tldraw sync integration, remote presence, persistence backend, authentication, permissions model, or multi-user conflict resolution.
- No broad wrapper for all tldraw operations. Unsupported shape types, bindings, arrows, rich formatting, grouping, assets, embeds, style editing, undo/redo orchestration, and page management remain out of scope.
- No custom flowchart protocol revival and no dependency on `@production-spec-graph/graph-protocol` for canvas meaning or actions.
- No product-spec ontology extraction, flowchart reconstruction, PRD ingestion, feature-tree generation, or export format.
- No modification to `spec.md`.

## Behavior Scenarios
- Scenario: Validate a proposed canvas action plan
  - Given the tldraw canvas shell has a current Sprint 4 canvas context
  - And a future-agent caller provides a typed plan for one of the supported actions
  - When the caller validates the plan through the action boundary
  - Then the result states whether the plan is acceptable for the current context
  - And malformed, unsupported, stale, unsafe, or missing-target plans return JSON-serializable error details
  - And validation does not mutate the tldraw document, selection, or viewport

- Scenario: Dry-run an action plan
  - Given a validated supported plan and the current canvas context
  - When the caller requests a dry run
  - Then the result describes the expected impact in JSON-serializable form, including action kind, target ids or predicted created shape descriptors, and safety notes
  - And the current canvas context before and after dry-run has the same shape count, shape ids, selected shape ids, and recent-change count
  - And no live tldraw editor mutation is required to compute the dry-run result

- Scenario: Apply an explicitly accepted action plan
  - Given a supported plan passes validation and dry-run checks against the current context
  - When the caller makes an explicit apply request through the controlled developer-facing API
  - Then only the intended tldraw canvas change is applied through the tldraw editor adapter
  - And the apply result records success, refusal, or failure with inspectable JSON-serializable details
  - And validation or dry-run alone never applies the plan

- Scenario: Reject stale or unsafe action assumptions
  - Given a plan includes a context reference from an earlier canvas context
  - And the current canvas context has a different schema version, source adapter/source-of-truth marker, recent-change count, missing target shape, or relevant recent affected target shape
  - When the plan is validated or dry-run against the newer context
  - Then the result refuses or flags the plan as stale or unsafe before apply
  - And the canvas is not mutated unless a plan is explicitly accepted under the current state

- Scenario: Inspect the action boundary from the runnable shell
  - Given the web app is running locally and the tldraw shell is mounted
  - When a browser test or developer console accesses the developer-facing action hook
  - Then it can call validation and dry-run without changing the context
  - And it can call explicit apply for a safe supported plan and observe the changed context through `window.__PSG_CANVAS_CONTEXT__.extract()`
  - And no UI claims real AI, autonomous editing, or live collaboration exists

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-5.1 | Typed schemas or equivalent runtime validators exist for the focused supported actions: create text, create simple geo rectangle, move shape, update supported text, delete shapes, and select/focus shapes. | Unit tests for valid and invalid plan fixtures; typecheck confirms exported plan/result contracts. |
| AC-5.2 | Validation rejects malformed, unsupported, stale, missing-target, non-finite, oversized, or unsafe plans with inspectable JSON-serializable errors and no canvas mutation. | Unit tests assert error codes/details and confirm fixture context objects are unchanged; E2E compares context before/after validation of an invalid plan. |
| AC-5.3 | Stale-context checks use the Sprint 4 context contract, including `schemaVersion`, source adapter/source-of-truth markers, `recentChanges.observedChangeCount`, current shape ids, and relevant affected recent shape ids. | Unit tests cover schema/source mismatch, changed observed count, missing target, and recently affected target refusal/warning; code review verifies no custom protocol markers are used. |
| AC-5.4 | Dry-run returns a JSON-serializable expected-impact result and leaves the tldraw document, selection, viewport, and recent-change count unchanged. | Unit tests for pure dry-run result shape; E2E calls dry-run through the browser hook and compares extracted context before/after dry-run. |
| AC-5.5 | Apply behavior is separated from validation and dry-run, requires an explicit `apply` call, and reports an inspectable outcome. | Unit tests verify pure helpers do not apply; E2E calls explicit apply for one safe create or select plan and observes the expected context change through `window.__PSG_CANVAS_CONTEXT__.extract()`. |
| AC-5.6 | The runnable canvas shell still loads as the first-screen tldraw experience and exposes both developer hooks while mounted. | Run `pnpm --filter @production-spec-graph/web test:e2e`; smoke verifies the tldraw host, `window.__PSG_CANVAS_CONTEXT__.extract()`, and `window.__PSG_AGENT_ACTIONS__` behavior. |
| AC-5.7 | No AI calls, chat UI, autonomous apply behavior, real collaboration behavior, or custom flowchart protocol dependency is introduced. | Source search/code review plus `pnpm --filter @production-spec-graph/web typecheck` and `pnpm --filter @production-spec-graph/web build`; verify no graph-protocol imports or model-call code in the web app. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
F5 centers on deterministic runtime validation, stale-context checks, plan normalization, and dry-run expected-impact data transformations. These are core correctness boundaries where small pure tests can define behavior before any tldraw editor mutation adapter is wired. Browser and adapter wiring should be validated after the pure action contract is green.

Planned evidence:
- RED: add focused tests for `validateAgentActionPlan`, `dryRunAgentActionPlan`, and stale-context handling before the action module or required behaviors exist. Expected failures are missing exports or failing assertions for unsupported/malformed/stale plans.
- GREEN: implement the typed plan/result contracts, runtime validators, stale checks, and pure dry-run helpers until the unit tests pass.
- REFACTOR: keep pure plan logic independent of React and tldraw editor instances; keep the live tldraw apply adapter small and covered by E2E/runtime behavior rather than broad mocks.

Planned unit coverage:
- valid create text/geo, move, update text, delete, and select/focus fixtures
- malformed or unsupported action kind
- non-finite coordinates/sizes, oversized text, empty target lists, duplicate ids, and missing targets
- stale schema version, stale source adapter/source-of-truth, changed observed-change count, missing target after context change, and target recently affected since plan creation
- dry-run result JSON serialization and no mutation of input context or plan objects

### E2E / Runtime Verification
This sprint adds a developer-facing action API and controlled tldraw mutations, so runtime verification is required.

Required runtime path:
- Run `pnpm --filter @production-spec-graph/web test:e2e`.
- The E2E smoke must open the app root, verify the tldraw shell/editor host remains visible, wait for `window.__PSG_CANVAS_CONTEXT__` and `window.__PSG_AGENT_ACTIONS__`, then:
  - extract a baseline context
  - validate and dry-run a safe supported plan
  - assert dry-run serialization succeeds and baseline context remains unchanged for document/selection/recent-change markers
  - explicitly apply a safe supported plan, preferably create a small text shape or select an existing created shape
  - extract context again and verify the expected applied change is visible
  - validate or dry-run a stale or invalid plan and confirm refusal without mutation
  - confirm the page has no app-level runtime error text

If direct creation proves brittle in Playwright because of tldraw persistence or shape defaults, the fallback runtime check may use the developer hook to apply a select/focus action against a shape created through the same explicit hook first, then verify selection in context. The build log must explain any fallback.

Quality commands before handoff:
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web build`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `git diff --check`

## Modularity & Readability Plan
Keep action planning split into three boundaries:

- Pure action contract module: exported types, validators, context-reference helpers, stale checks, and dry-run expected-impact builders. This module should depend only on plain TypeScript data and the Sprint 4 `CanvasContext` type.
- Tldraw apply adapter: maps validated supported actions to minimal editor calls such as shape creation, shape update, delete, selection, or viewport focus. This is the only module that should import the live tldraw `Editor`.
- React shell wiring: registers and unregisters the developer-facing action hook next to the existing context hook, with no product UI and no broad action state.

Avoid a large low-cohesion file by keeping validation/dry-run separate from editor mutation. Use immutable data patterns for plans, contexts, validation results, and expected-impact outputs. Add short comments only where stale-plan policy or tldraw shape mapping is non-obvious. Tests should document the allowed action set and refusal reasons.

## Human Checkpoint
Pause after Sprint 5 because this is the first boundary that can mutate the canvas programmatically.

Recommended local commands:
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web build`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm --filter @production-spec-graph/web dev`

Inspect:
- Open `http://127.0.0.1:3000`.
- Confirm the app still opens directly to the tldraw canvas shell.
- In the browser console, call `window.__PSG_CANVAS_CONTEXT__.extract()` and inspect the current context.
- Call `window.__PSG_AGENT_ACTIONS__.validate(plan)` and `dryRun(plan)` for a safe sample plan and confirm context does not change.
- Call `window.__PSG_AGENT_ACTIONS__.apply(plan)` explicitly for a safe sample plan, then call the context hook again and confirm the expected shape or selection change appears.
- Try a stale or invalid plan and confirm it is refused with inspectable errors and no canvas mutation.
- Confirm no UI claims real AI, autonomous editing, or live collaboration exists.

## Technical Approach
Define a small typed action-plan contract that references the current Sprint 4 canvas context by schema/source/change markers. Implement pure validators and dry-run builders first so stale and unsafe assumptions are caught before any editor call is possible. Add a thin tldraw adapter for the focused supported action set, and expose it through a developer-facing hook mounted by `CanvasShell`. Keep product UI unchanged and use E2E only to prove the hook boundary works against the real tldraw shell.

## Dependencies
- F4 completed `CanvasContext` extraction boundary and developer hook.
- Existing `apps/web` Next.js/tldraw shell, Vitest unit runner, and Playwright smoke setup.
- `docs/product-direction.md` tldraw-first source-of-truth decision.
- Current quality commands in `docs/exec-plans/quality-commands.md`.

## Estimated Complexity
M
