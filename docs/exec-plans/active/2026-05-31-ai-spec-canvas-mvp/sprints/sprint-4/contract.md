# Sprint 4 Contract: Agent-Ready Canvas Context Extraction

## Feature
F4: Agent-Ready Canvas Context Extraction

## Scope
Add a tldraw-first canvas context extraction boundary to the current web app. The context must be JSON-serializable and useful to future AI prompt/action consumers without introducing AI calls, chat UI, autonomous editing, real collaboration, or a revived custom flowchart protocol.

This sprint implements:

- typed canvas context structures for document summary, shape inventory, selection, viewport, recent-change summary, and future-agent constraint metadata
- a focused extraction module that reads from the active tldraw editor/store/document state
- local-session recent-change bookkeeping sufficient to distinguish "no edits observed" from "canvas changed since the shell mounted"
- a developer-facing browser hook, such as `window.__PSG_CANVAS_CONTEXT__.extract()`, that returns the current serializable context for tests, logs, and manual inspection while the canvas shell is mounted
- focused deterministic tests for pure serialization/context-shaping logic
- an updated browser smoke path that verifies the runnable canvas still loads and the developer-facing context hook returns JSON-serializable tldraw-derived state

Expected files/modules to create or edit:

- Create `apps/web/src/lib/canvas-context.ts` or equivalent for public context types and pure context-building helpers.
- Create `apps/web/src/lib/recent-canvas-changes.ts` or keep a small cohesive helper in the context module if the recent-change boundary remains minimal.
- Edit `apps/web/src/components/canvas-shell.tsx` only enough to capture the mounted tldraw editor, observe local changes, and register/unregister the developer context hook.
- Add focused unit tests near the context module, for example `apps/web/src/lib/canvas-context.test.ts`.
- Add a minimal app-local unit test script/dependency only if needed for TDD, preferably Vitest scoped to `@production-spec-graph/web`.
- Update `apps/web/e2e/canvas-smoke.spec.ts` to verify the context hook in the real browser shell.
- Edit root/package scripts only if needed to expose the new smallest practical validation command.

## Out of Scope
- No AI model calls, prompt execution, chat workflow, autonomous agent behavior, or generated edits.
- No typed agent action planning, dry-run/apply boundary, validation of future AI plans, or mutation API beyond ordinary tldraw user interaction.
- No real collaboration, tldraw sync integration, presence, authentication, persistence backend, or multi-user state.
- No revival of `@production-spec-graph/graph-protocol` as an active source of truth for canvas meaning.
- No product-spec ontology extraction, flowchart reconstruction, PRD ingestion, feature-tree generation, or export format.
- No visual redesign beyond small operational affordances needed to keep the shell coherent.
- No modification to `spec.md`.

## Behavior Scenarios
- Scenario: Extract a current canvas context snapshot
  - Given the tldraw canvas shell is mounted
  - And the tldraw document may be empty or contain user-created shapes
  - When the app or developer-facing caller requests the current canvas context
  - Then it receives a JSON-serializable snapshot with document summary and shape inventory
  - And the snapshot is derived from the active tldraw editor/store/document state
  - And no custom flowchart protocol is used as the source of truth

- Scenario: Include user focus in the context
  - Given the user has a current viewport and may or may not have selected shapes
  - When the canvas context is extracted
  - Then the context includes selection identifiers and viewport/camera information sufficient for a future agent to understand the user's current focus
  - And the context remains valid when the selection is empty

- Scenario: Represent recent change awareness without real AI
  - Given the canvas shell has mounted during the current browser session
  - And the user edits the canvas through normal tldraw behavior
  - When the canvas context is extracted
  - Then the context includes a recent-change summary boundary that can report locally observed change count and affected record or shape identifiers where available
  - And the context labels this as local/session bookkeeping, not AI interpretation or real collaboration history

- Scenario: Communicate future-agent constraints
  - Given a future AI prompt or action planner consumes the context
  - When it reads the context metadata
  - Then it can identify that tldraw editor/store/document state is the source of truth
  - And it can identify unsupported assumptions such as no real AI, no live collaboration, no autonomous edits, and no custom flowchart protocol authority
  - And those constraints are serializable for tests, logs, and developer inspection

- Scenario: Inspect context from the runnable shell
  - Given the web app is running locally
  - When a browser test or developer console calls the exposed context extraction hook
  - Then it returns the same context contract used by the app module
  - And `JSON.stringify` succeeds without functions, class instances, circular references, or non-serializable editor objects

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-4.1 | A context extraction boundary exists that returns JSON-serializable canvas context from active tldraw editor/store/document state. | Unit tests for the pure context builder; browser E2E calls `window.__PSG_CANVAS_CONTEXT__.extract()` and verifies `JSON.stringify` succeeds. |
| AC-4.2 | The context includes document summary, shape inventory, current selection, viewport/camera information, recent-change summary, and future-agent constraint metadata. | Unit tests assert required fields and representative values; code review confirms the browser hook returns the same typed context contract. |
| AC-4.3 | Empty canvas, populated canvas, no selection, active selection, changed-since-load state, and no-change-since-load state are handled without throwing or producing non-serializable data. | Focused unit test cases cover each state; E2E covers the mounted empty/default shell and developer hook serialization. |
| AC-4.4 | Deterministic checks verify context output changes when document shapes, selection, viewport/camera, or recent-change inputs change. | Unit tests compare snapshots from controlled fixtures and assert relevant fields change while unrelated metadata remains stable. |
| AC-4.5 | The runnable canvas shell still loads as the first-screen experience and exposes context for developer inspection. | Run `pnpm --filter @production-spec-graph/web test:e2e`; the smoke test opens `/`, confirms the tldraw host is visible, and calls the context hook. |
| AC-4.6 | No AI model call, chat UI, autonomous edit path, real collaboration behavior, or custom flowchart protocol dependency is introduced by this feature. | Code review/search plus `pnpm --filter @production-spec-graph/web typecheck` and build; verify no imports from `@production-spec-graph/graph-protocol` are used for context meaning. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
F4 is centered on deterministic serialization and context extraction. The pure context-shaping logic should be defined by focused tests before implementation because correctness depends on stable handling of empty/populated documents, selections, viewport data, recent-change summaries, and JSON-safe output. Browser wiring around tldraw editor mounting can be validated after the pure contract is green.

Planned evidence:
- Add minimal app-local unit testing if no suitable runner exists. Preferred path: add Vitest only to `@production-spec-graph/web` with a `test:unit` script, because the web app currently has Playwright for E2E but no lightweight runner for pure TypeScript tests.
- RED: write focused tests for `buildCanvasContext` or similarly named pure helper before the module exists or before fields are implemented. Expected failure is missing module/exports or missing required context fields.
- GREEN: implement the context types/helpers, recent-change summary shape, and tldraw adapter until the unit tests pass.
- REFACTOR: keep tldraw-specific editor/store reads isolated from pure serialization so tests remain fixture-driven and the React shell stays thin.

If dependency installation is blocked in the implementation environment, the build log must record that blocker and use the smallest practical fallback deterministic command, but the preferred contract remains focused TDD with a minimal unit runner.

### E2E / Runtime Verification
This sprint changes the runnable shell and adds developer-facing context exposure, so runtime verification is required.

Required runtime path:
- Run `pnpm --filter @production-spec-graph/web test:e2e`.
- The E2E smoke must open the app root, verify the tldraw shell/editor host remains visible, call the developer-facing context hook from `page.evaluate`, and assert:
  - the hook exists while the editor is mounted
  - the returned context identifies tldraw as the source of truth
  - required top-level fields exist
  - `JSON.stringify(context)` succeeds
  - the page has no app-level runtime error text

Quality commands before handoff:
- `pnpm --filter @production-spec-graph/web test:unit` or the approved equivalent focused unit command
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web build`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `git diff --check`

## Modularity & Readability Plan
Keep context modeling separate from React and tldraw lifecycle wiring. The pure context builder should accept plain inputs or normalized tldraw-derived records and return plain JSON-compatible objects. The tldraw adapter should be the only place that knows how to read shapes, selection, camera/viewport, and store records from the editor instance.

Keep recent-change tracking small and local to the current browser session. It should record enough metadata for F4's context boundary, but it must not become a collaboration subsystem, persistence layer, audit log, or action planner. If tldraw store listener details are non-obvious, add a short comment at the adapter boundary rather than spreading explanatory comments through React rendering.

`CanvasShell` should remain a composition component: mount tldraw, register context extraction when an editor is available, unregister it on cleanup, and leave serialization rules in library code. Avoid adding panels, chat, inspectors, or broad UI state. Tests should act as documentation for the context contract and the JSON-safe shape of the output.

## Human Checkpoint
Pause after Sprint 4 because it establishes the contract future AI/action/collaboration work will consume.

Recommended local commands:
- `pnpm install` if the minimal unit test dependency is added
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web build`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm --filter @production-spec-graph/web dev`

Inspect:
- Open `http://127.0.0.1:3000`.
- Confirm the app still opens directly to the tldraw canvas shell.
- In the browser console, call `window.__PSG_CANVAS_CONTEXT__.extract()` and inspect the JSON-safe context.
- Add or select a simple tldraw shape manually, call the hook again, and confirm document summary, shape inventory, selection, viewport/camera, or recent-change fields update as expected.
- Confirm no UI claims real AI, autonomous editing, or live collaboration exists.

## Technical Approach
Define a small typed context contract in the web app and implement a pure builder that turns normalized canvas inputs into JSON-safe output. Add a tldraw adapter that reads the mounted editor's current page shapes, selection, camera/viewport, and observed local store changes, then delegates to the pure builder. Register a developer-facing extraction hook from `CanvasShell` after `Tldraw` mounts so runtime tests and developers can inspect the active context without adding product UI. Keep all future-agent constraints explicit metadata rather than behavior.

## Dependencies
- F3 completed runnable tldraw canvas shell.
- Existing `apps/web` Next.js/tldraw package and Playwright smoke setup.
- `docs/product-direction.md` tldraw-first source-of-truth decision.
- Minimal app-local unit test runner if added for focused TDD.

## Estimated Complexity
M
