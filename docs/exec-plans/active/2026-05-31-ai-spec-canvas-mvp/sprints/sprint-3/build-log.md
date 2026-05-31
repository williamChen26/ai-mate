# Build Log: Sprint 3 — Runnable Canvas Application Shell

## Round 1

### What Was Built
- Root `package.json` scripts were extended with web app `dev`, `build`, `test`, and `typecheck` delegation.
- `apps/web/package.json` was added for a Next.js/tldraw app package with build, dev, typecheck, and Playwright smoke scripts. The dev script binds to `127.0.0.1` for local smoke testing.
- `apps/web/tsconfig.json`, `next-env.d.ts`, and `next.config.mjs` were added for Next.js App Router TypeScript support and graph-protocol transpilation.
- `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, and `apps/web/app/globals.css` were added for a full-viewport canvas-first app shell.
- `apps/web/src/lib/protocol-status.ts` imports public exports from `@production-spec-graph/graph-protocol` and validates a boot graph for protocol readiness.
- `apps/web/src/components/canvas-shell.tsx` composes compact operational chrome with a full-screen tldraw editor.
- `apps/web/playwright.config.ts` and `apps/web/e2e/canvas-smoke.spec.ts` were added for a browser smoke check using installed system Chrome.
- `packages/graph-protocol/src/json-schema.ts`, `src/schema-writer.ts`, `src/export-schema.ts`, `src/index.ts`, and package exports were adjusted so the root graph-protocol entry remains browser-safe. Node-only schema artifact writing now lives behind `schema-writer` and the `schema:export` script.

### Acceptance Criteria Status
| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-3.1 | Runnable Next.js app exists under `apps/web` and is registered through the workspace. | PASS | `apps/web/package.json` exists; `pnpm --filter @production-spec-graph/web build` passed. |
| AC-3.2 | First screen renders visible tldraw canvas as primary experience. | PASS | Playwright smoke opened `/`, found the canvas shell and `.tl-container`, and confirmed the tldraw editor surface has substantial dimensions. |
| AC-3.3 | Minimal operational chrome orients MVP demo without presenting unavailable future domains as completed features. | PASS | App chrome shows product name, flowchart MVP context, schema version, flow kind count, and protocol readiness while leaving the canvas as the primary viewport. |
| AC-3.4 | App consumes graph-protocol public exports and does not duplicate protocol model. | PASS | `protocol-status.ts` imports `PRODUCT_GRAPH_SCHEMA_VERSION`, `flowchartNodeKinds`, and `validateProductGraph` from the shared package; web typecheck/build passed. |
| AC-3.5 | Baseline tldraw interaction is available. | PASS | Playwright smoke used system Chrome, clicked the canvas, performed a wheel zoom, and confirmed the editor remained visible with no runtime error text. |
| AC-3.6 | Existing shared package validation remains green. | PASS | `pnpm --filter @production-spec-graph/graph-protocol test`, `build`, and `schema:export` passed. |
| AC-3.7 | Root/package scripts document the validation path. | PASS | Root and web package scripts provide `dev`, `build`, `typecheck`, and `test:e2e`; commands were run and recorded below. |

### Behavior Scenario Evidence
- Open the canvas demo: `apps/web/e2e/canvas-smoke.spec.ts` opened `/`, asserted `canvas-shell`, product title, protocol readiness, and tldraw container visibility.
- Access canvas editing controls: the same smoke test confirms the tldraw application surface is visible and remains interactive after click/zoom; the rendered tldraw toolbar is part of the editor surface.
- Preserve product-engine orientation: `apps/web/src/lib/protocol-status.ts` consumes shared public exports and validates a boot graph rather than redefining protocol state in app code.
- Validate runnable monorepo integration: web typecheck/build/e2e and graph-protocol test/build/schema export all passed.

### TDD Decision & Evidence
Use TDD: No, per approved contract.

Rationale:
This sprint is UI shell/framework wiring around Next.js and tldraw. Strict TDD is low-value here because the primary behavior is supplied by framework/runtime integration. The substitute validation is executable: typecheck, production build, shared package checks, and browser smoke test.

Evidence:
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 1 Playwright test passed in system Chrome.
- Existing graph-protocol checks remained green.

### E2E / Runtime Verification
Runtime checks:
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 1 test passed.
- `pnpm --filter @production-spec-graph/graph-protocol test`: PASS, 3 files and 12 tests passed.
- `pnpm --filter @production-spec-graph/graph-protocol build`: PASS.
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`: PASS.
- `git diff --check`: PASS.

Runtime notes:
- Sandboxed Next dev server binding failed with `listen EPERM`, so Playwright smoke was run with escalated execution as required by the local environment.
- Playwright's bundled Chromium download was blocked by DNS for `cdn.playwright.dev`, so `playwright.config.ts` uses the installed system Chrome channel.
- The first web build initially failed because `graph-protocol` root exports pulled Node-only `node:fs/path/url` imports into the client bundle. The fix split pure JSON Schema creation from Node-only schema writing, preserving browser-safe shared-package consumption.

### Modularity & Readability Notes
The route remains thin and delegates to `CanvasShell`. Protocol boundary proof is isolated in `protocol-status.ts`. tldraw composition stays in `apps/web` and does not leak into `packages/graph-protocol`. The visual shell is a compact full-screen work surface rather than a landing page.

The graph-protocol browser-safety fix keeps pure schema creation in `json-schema.ts` and file-system writing in `schema-writer.ts`, avoiding accidental Node built-ins in browser consumers while preserving the `schema:export` runtime path.

### Human Checkpoint
Pause before F4. This is the first runnable product surface.

Recommended local commands:
- `pnpm install`
- `pnpm --filter @production-spec-graph/web dev`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm --filter @production-spec-graph/web build`

Inspect:
- Open `http://127.0.0.1:3000`.
- Confirm the app root opens directly to the canvas workspace.
- Confirm the tldraw editor is visible and usable for baseline pan, zoom, selection, and basic marks/shapes.
- Confirm the compact chrome shows schema/status information without becoming a landing page.
- Confirm the browser console has no blocking runtime errors during initial load and a simple canvas interaction.

### Decisions Made
- Used Next.js App Router with a client `CanvasShell` because tldraw requires browser execution.
- Kept shadcn/ui setup out of Sprint 3 because the contract allows minimal chrome without spending scope on design-system installation.
- Bound dev server to `127.0.0.1` to avoid broad host binding and make local smoke tests more predictable.
- Used installed system Chrome for Playwright because Playwright browser download was blocked by DNS.
- Split graph-protocol schema writer code out of the browser-safe root import path after Next build exposed the Node built-in leak.

### Quality Command Results
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS.
- `pnpm --filter @production-spec-graph/graph-protocol test`: PASS.
- `pnpm --filter @production-spec-graph/graph-protocol build`: PASS.
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`: PASS.
- `git diff --check`: PASS.

### Known Issues
- `pnpm --filter @production-spec-graph/web test:e2e` needs elevated execution in this environment because the sandbox blocks local server listening.
- Playwright's managed Chromium is not installed because `cdn.playwright.dev` DNS resolution failed; the smoke test is configured to use system Chrome.

### Test Results
- Web typecheck: PASS.
- Web production build: PASS.
- Web browser smoke: PASS.
- Shared protocol tests/build/schema export: PASS.
- Whitespace check: PASS.
