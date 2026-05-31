# Sprint 3 Contract: Runnable Canvas Application Shell

## Feature
F3: Runnable Canvas Application Shell

## Scope
Create a runnable Next.js application package in the existing pnpm monorepo, most likely `apps/web`, that opens directly into a usable tldraw infinite canvas. The app shell should provide restrained operational chrome for the MVP demo and prove the UI consumes `@production-spec-graph/graph-protocol` through its public exports without redefining product-graph meaning in app code.

This sprint implements:

- a workspace app package with Next.js, React, TypeScript, and tldraw dependencies
- package scripts for development, build/type validation, and a practical browser/runtime smoke check
- a first-screen canvas route that renders tldraw as the primary experience
- minimal useful app chrome such as product name, protocol/version status, and current MVP domain context
- one small graph-protocol integration point, such as importing `PRODUCT_GRAPH_SCHEMA_VERSION`, `flowchartNodeKinds`, or `validateProductGraph` for display/status or boot-time validation
- root scripts updated only enough to make the new app easy to run and validate from the monorepo

Expected files/modules to create or edit:

- Create `apps/web/package.json` with Next.js/tldraw scripts and dependencies.
- Create `apps/web/tsconfig.json`, `apps/web/next.config.mjs`, and any framework-required environment/type files.
- Create `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, and `apps/web/app/globals.css` or equivalent App Router files.
- Create `apps/web/src/components/canvas-shell.tsx` or similarly scoped component module for app chrome plus tldraw composition.
- Create `apps/web/src/lib/protocol-status.ts` or similarly scoped helper if the protocol dependency proof should stay out of React rendering code.
- Create `apps/web/e2e/canvas-smoke.spec.ts` and Playwright config, or an equivalent local browser smoke script, if Playwright is the chosen runtime verification path.
- Edit root `package.json` only to add scripts that delegate to `@production-spec-graph/web` and keep existing graph-protocol scripts working.
- Edit `pnpm-lock.yaml` only as dependency installation requires.

## Out of Scope
- No custom flowchart CRUD on the canvas beyond baseline tldraw interactions available from tldraw itself.
- No app-specific graph operation layer, custom tldraw shape utilities, protocol-to-canvas synchronization, inspector, import/export, seed/reset, persistence, collaboration, authentication, or backend.
- No AI generation, PRD ingestion, chat workflow, or autonomous editing.
- No shadcn/ui installation unless a small existing-compatible control is needed; this sprint should not spend scope on design-system setup.
- No marketing landing page, hero section, onboarding walkthrough, explanatory feature panels, or future-domain navigation.
- No modification to `spec.md`.
- No changes to `packages/graph-protocol` behavior unless a public export defect blocks app consumption and the fix is strictly necessary.

## Behavior Scenarios
- Scenario: Open the canvas demo
  - Given workspace dependencies are installed
  - And the web app is started through its package script
  - When a user opens the local app URL in a browser
  - Then the first screen is the runnable canvas app, not a landing page
  - And an editable tldraw infinite canvas is visible without placeholder-only content
  - And the user can pan, zoom, select, and create/edit basic tldraw marks or shapes using baseline tldraw controls

- Scenario: Access canvas editing controls
  - Given the canvas demo is open
  - When the user looks at the primary workspace controls
  - Then the standard tldraw editing surface and toolbar are available for baseline selection and drawing/editing gestures
  - And the app chrome stays minimal and operational
  - And unavailable future product-spec domains are not presented as completed app features

- Scenario: Preserve product-engine orientation
  - Given a developer inspects the app package boundary
  - When they trace how the app references product-graph meaning
  - Then the app imports protocol status or validation information from `@production-spec-graph/graph-protocol`
  - And app code does not redefine a conflicting `ProductGraph`, node kind, schema version, or validation model

- Scenario: Validate runnable monorepo integration
  - Given the repository contains the existing graph-protocol package and the new web app
  - When the configured package validation commands are run
  - Then the existing graph-protocol tests/build remain green
  - And the web app builds or typechecks successfully
  - And a browser/runtime smoke check confirms the local canvas page loads and exposes the visible tldraw surface

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-3.1 | A runnable Next.js app exists under `apps/web` and is registered through the existing pnpm workspace. | Inspect `apps/web/package.json` and workspace scripts; run `pnpm --filter @production-spec-graph/web build` or the app's equivalent build/type validation command. |
| AC-3.2 | The first screen at the app root renders a visible tldraw infinite canvas as the primary experience, not a marketing or setup page. | Start the dev server with `pnpm --filter @production-spec-graph/web dev`; open the local app in a browser smoke check and assert the page contains a tldraw canvas/editor surface. |
| AC-3.3 | The app includes minimal, restrained operational chrome that orients the MVP demo without presenting unavailable future domains as completed features. | Browser smoke check plus code review of app shell components; verify chrome does not replace the canvas as the primary screen. |
| AC-3.4 | The app consumes `@production-spec-graph/graph-protocol` through public exports and does not duplicate an incompatible protocol model in app code. | Code review of app imports and any protocol helper; run TypeScript/build command to prove the package boundary resolves. |
| AC-3.5 | Baseline tldraw interaction is available for pan, zoom, selection, and basic editing gestures through the visible canvas. | Browser/runtime smoke check using Playwright or equivalent: load the page, locate the tldraw editor, perform at least one zoom/pointer or simple drawing/shape interaction, and confirm the editor remains visible and non-erroring. |
| AC-3.6 | Existing shared package validation remains green after adding the app package and dependencies. | Run `pnpm --filter @production-spec-graph/graph-protocol test`, `pnpm --filter @production-spec-graph/graph-protocol build`, and `pnpm --filter @production-spec-graph/graph-protocol schema:export`. |
| AC-3.7 | Root/package scripts document the smallest practical validation path for the app shell. | Inspect root and app `package.json`; run the listed commands and record outcomes in `build-log.md`, including any inferred command names because `docs/exec-plans/quality-commands.md` is incomplete. |

## Test Strategy

### TDD Decision
Use TDD: No

Rationale:
This sprint is primarily UI shell creation, dependency wiring, and framework configuration. Strict TDD would provide low value for the visual composition because the core behavior is supplied by tldraw and Next.js rather than deterministic custom state-transition logic. The tradeoff is acceptable only if implementation performs focused executable validation: package build/type checks, existing shared package tests, and a browser/runtime smoke test against the actual local canvas page.

Planned focused validation:
- Keep existing graph-protocol checks green:
  - `pnpm --filter @production-spec-graph/graph-protocol test`
  - `pnpm --filter @production-spec-graph/graph-protocol build`
  - `pnpm --filter @production-spec-graph/graph-protocol schema:export`
- Add and run web app checks inferred from `apps/web/package.json`, expected to include at minimum:
  - `pnpm --filter @production-spec-graph/web build`
  - `pnpm --filter @production-spec-graph/web lint` or `pnpm --filter @production-spec-graph/web typecheck` if configured
- Run a browser/runtime smoke check against a local dev or preview server that verifies the page loads, the tldraw surface is visible, and at least one simple interaction does not crash the editor.
- Run `git diff --check`.

### E2E / Runtime Verification
This sprint has user-visible behavior, so runtime verification is required.

Preferred path:
- Add a Playwright-based smoke check if practical for the repository environment.
- Start the app through `pnpm --filter @production-spec-graph/web dev` or a production preview flow.
- Navigate to the local app URL.
- Assert the root page renders the canvas app shell and tldraw editor surface.
- Perform one lightweight interaction such as clicking the canvas, zooming via keyboard/wheel, selecting a tldraw tool, or drawing/creating a basic tldraw shape.
- Assert the editor remains visible and no app-level error overlay appears.

Fallback path:
- If Playwright browser installation is unavailable in the local environment, document the failure and use a practical local browser or DOM smoke script that starts the server and verifies the page response plus tldraw/editor markers. This fallback is only acceptable if the build log clearly explains why full browser automation was not practical and still records manual browser checkpoint instructions.

## Modularity & Readability Plan
Keep framework wiring, app shell layout, protocol-status derivation, and tldraw composition separated. The route file should stay thin, delegating the main UI to a focused canvas shell component. Any protocol dependency proof should live in a small helper or clearly isolated import so later F4/F5 synchronization work can replace or extend it without hunting through presentation code.

The app should treat `@production-spec-graph/graph-protocol` as the provider contract. It may read constants, node kinds, or validate a tiny boot graph, but it must not create parallel protocol types or graph validation rules. Canvas-specific code should stay under `apps/web` and must not leak tldraw concerns into `packages/graph-protocol`.

The visual implementation should be restrained and operational: the usable canvas is the first screen, tldraw keeps most editing affordances, chrome remains compact, and text must not crowd or overlap the canvas. Avoid card-heavy marketing composition, oversized hero typography, decorative backgrounds, and visible copy that explains features or keyboard usage. Use stable full-viewport layout constraints so the canvas fills available space across desktop and narrow browser widths.

## Human Checkpoint
Pause after Sprint 3 implementation because this is the first locally runnable product surface.

Recommended local commands:
- `pnpm install`
- `pnpm --filter @production-spec-graph/graph-protocol test`
- `pnpm --filter @production-spec-graph/graph-protocol build`
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`
- `pnpm --filter @production-spec-graph/web build`
- `pnpm --filter @production-spec-graph/web dev`
- the app's browser smoke command, if separate, such as `pnpm --filter @production-spec-graph/web test:e2e`

Inspect:
- The app root opens directly to the canvas workspace.
- The tldraw toolbar/editor is usable for baseline pan, zoom, selection, and basic editing.
- App chrome is compact, restrained, and does not read like a landing page.
- The app imports graph-protocol public exports rather than redefining schema/version/kind information.
- The browser console has no blocking runtime errors during initial load and a simple canvas interaction.

## Technical Approach
Add `apps/web` as a minimal Next.js App Router package using tldraw for the full-screen canvas surface. Compose the root page from a thin route and a focused client-side canvas shell component because tldraw requires browser execution. Import a small, stable public export from `@production-spec-graph/graph-protocol` to prove the provider boundary resolves through the workspace. Add the smallest practical script and smoke-test setup needed to build and verify the page locally.

## Dependencies
- F1 and F2 remain completed and passing.
- Existing workspace support for `apps/*` in `pnpm-workspace.yaml`.
- Existing public exports from `@production-spec-graph/graph-protocol`.
- New implementation dependencies for Next.js, React, tldraw, and any browser smoke tooling such as Playwright.
- Installing npm packages may require network access during implementation.

## Estimated Complexity
M
