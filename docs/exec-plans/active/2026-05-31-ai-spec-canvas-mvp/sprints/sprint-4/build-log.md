# Build Log: Sprint 4 — Agent-Ready Canvas Context Extraction

## Round 1

### What Was Built
- `apps/web/src/lib/canvas-context.ts` — pure JSON-safe canvas context contract and deterministic builder.
- `apps/web/src/lib/canvas-context.test.ts` — focused Vitest coverage for empty/populated contexts, selection, viewport changes, recent changes, constraints, and JSON serialization.
- `apps/web/src/lib/recent-canvas-changes.ts` — local/session recent-change tracker for observed record and shape ids.
- `apps/web/src/lib/tldraw-canvas-context.ts` — thin tldraw adapter that normalizes editor state before calling the pure builder.
- `apps/web/src/components/canvas-shell.tsx` — registers `window.__PSG_CANVAS_CONTEXT__.extract()` while the tldraw editor is mounted and unregisters it on cleanup.
- `apps/web/e2e/canvas-smoke.spec.ts` — browser smoke now asserts the developer hook exists and returns serializable tldraw-source context.
- `apps/web/playwright.config.ts` — uses fixed test port `3100` so Playwright verifies the app server it starts when ports `3000`/`3001` are already occupied.
- `apps/web/package.json`, `pnpm-lock.yaml` — added app-local `test:unit` script and Vitest dev dependency.

### Acceptance Criteria Status
| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-4.1 | A context extraction boundary exists that returns JSON-serializable canvas context from active tldraw editor/store/document state. | PASS | `buildCanvasContextFromEditor` delegates normalized editor state to `buildCanvasContext`; unit JSON round-trip passes; E2E calls `window.__PSG_CANVAS_CONTEXT__.extract()` and stringifies result. |
| AC-4.2 | The context includes document summary, shape inventory, current selection, viewport/camera information, recent-change summary, and future-agent constraint metadata. | PASS | `canvas-context.test.ts` asserts required fields and representative values. |
| AC-4.3 | Empty canvas, populated canvas, no selection, active selection, changed-since-load state, and no-change-since-load state are handled without throwing or producing non-serializable data. | PASS | Unit tests cover empty/no-change, populated/selected/changed, and JSON serialization; E2E covers mounted shell hook. |
| AC-4.4 | Deterministic checks verify context output changes when document shapes, selection, viewport/camera, or recent-change inputs change. | PASS | Unit test `changes only the relevant context fields when deterministic inputs change`. |
| AC-4.5 | The runnable canvas shell still loads as the first-screen experience and exposes context for developer inspection. | PASS | `pnpm --filter @production-spec-graph/web test:e2e`: 1 passed. |
| AC-4.6 | No AI model call, chat UI, autonomous edit path, real collaboration behavior, or custom flowchart protocol dependency is introduced by this feature. | PASS | Search found no `@production-spec-graph/graph-protocol` or AI-call imports in `apps/web`; constraints are metadata only; typecheck/build pass. |

### Behavior Scenario Evidence
- Extract a current canvas context snapshot: verified by `canvas-context.test.ts` populated-shape case and E2E hook extraction.
- Include user focus in the context: verified by unit selection and viewport assertions.
- Represent recent change awareness without real AI: verified by unit no-change and changed local/session summaries; tracker only records local session ids/counts.
- Communicate future-agent constraints: verified by unit assertions for source-of-truth and unsupported assumptions.
- Inspect context from the runnable shell: verified by Playwright `page.evaluate` calling `window.__PSG_CANVAS_CONTEXT__.extract()` and `JSON.stringify`.

### TDD Decision & Evidence
Use TDD: Yes

Rationale:
Sprint 4 centers on deterministic serialization and context shaping, so the pure builder was specified with focused tests before implementation.

Evidence:
- RED: `pnpm --filter @production-spec-graph/web test:unit` failed because `./canvas-context` did not exist: `Failed to load url ./canvas-context`.
- GREEN: after implementing the pure builder and helpers, `pnpm --filter @production-spec-graph/web test:unit` passed with `3 tests`.
- REFACTOR: kept tldraw-specific editor reads in `tldraw-canvas-context.ts`, local change bookkeeping in `recent-canvas-changes.ts`, and React lifecycle/hook registration in `canvas-shell.tsx`; tests stayed green.

### E2E / Runtime Verification
- Initial E2E run failed because port `3000` was already occupied by another local process, Next auto-selected `3002`, and Playwright still navigated to `3000`, which returned a 404.
- Fix: updated Playwright webServer/baseURL to fixed port `3100` through `pnpm exec next dev --hostname 127.0.0.1 --port 3100`.
- Final runtime result: `pnpm --filter @production-spec-graph/web test:e2e` passed, `1 passed`.

### Modularity & Readability Notes
- Pure context contract and serialization live in `canvas-context.ts`; no React or tldraw editor instance is imported there.
- `tldraw-canvas-context.ts` is the adapter boundary for tldraw editor/store APIs.
- `recent-canvas-changes.ts` is intentionally local/session-only and does not model collaboration, persistence, or AI interpretation.
- `CanvasShell` remains a composition component: mount tldraw, observe user store changes, expose/unexpose the developer hook.
- Tests document the expected JSON-safe context shape and stable future-agent constraints.

### Human Checkpoint
Pause here before building F5 because this context contract is the boundary future action planning will consume.

Recommended local commands:
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web build`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm --filter @production-spec-graph/web dev`

Inspect:
- Open `http://127.0.0.1:3000` for the normal dev script, or `http://127.0.0.1:3100` while Playwright's test server is running.
- Confirm the app opens directly to the tldraw canvas shell.
- In the browser console, call `window.__PSG_CANVAS_CONTEXT__.extract()` and confirm it is JSON-safe.
- Add/select a tldraw shape, call the hook again, and inspect shape inventory, selection, viewport/camera, and recent-change fields.
- Confirm the runtime still does not present real AI, autonomous editing, live collaboration, or custom graph-protocol authority.

### Decisions Made
- Added Vitest only to `@production-spec-graph/web` because the sprint needed focused deterministic tests and the app previously only had browser E2E.
- Context includes inventory-level shape details: id, type, parent, position, rotation, bounds, prop keys, and extracted text when available. It avoids returning live tldraw objects or class instances.
- Recent-change tracking counts local observed store events and records affected record/shape ids, with an explicit note that this is not AI interpretation or collaboration history.
- The developer hook is exposed only while the editor is mounted and returns a fresh snapshot on each call.

### Quality Command Results
- `pnpm --filter @production-spec-graph/web test:unit`: PASS
- `pnpm --filter @production-spec-graph/web typecheck`: PASS
- `pnpm --filter @production-spec-graph/web build`: PASS
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS
- `git diff --check`: PASS
- Search for prohibited app imports/behavior terms: PASS for no `@production-spec-graph/graph-protocol` or AI-call imports; remaining matches are expected labels/constraint metadata.

### Known Issues
- Local ports `3000` and `3001` were occupied during validation, so E2E now uses port `3100`. The normal `dev` script remains unchanged.
- Playwright/Next emitted `NO_COLOR`/`FORCE_COLOR` warnings during E2E; tests still passed.

### Test Results
- Unit: Vitest `3 passed`.
- Typecheck: `tsc --noEmit` completed successfully.
- Build: Next production build completed successfully.
- E2E: Playwright Chromium smoke `1 passed`.
