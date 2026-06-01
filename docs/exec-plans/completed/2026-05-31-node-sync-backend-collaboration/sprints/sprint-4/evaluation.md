# Evaluation: Sprint 4 — Round 1

## Verdict: PASS

## Summary
Sprint 4 satisfies the approved contract. The implementation adds compact sync status, supported tldraw user identity wiring, same-device tab diagnostics, safe route-only sharing, and executable backend-unavailable/restart recovery checks without changing the route-backed room contract or falling back to hosted demo sync.

Independent validation passed: web unit tests, typecheck, build, E2E, recovery smoke, root `pnpm check`, and the inferred backend test/typecheck/build/smoke checks. Residual risks are deferred scope: no custom participant roster, auth-backed names, durable recovery, production persistence, or final repository quality-doc expansion until F5.

## Behavior Scenario Evaluation
- **See collaboration status**: PASS. `apps/web/src/lib/collaboration-status.ts:35` maps loading, timed-out backend unavailable, remote online, offline reconnecting, local cache, not-synced, configuration error, and sync error states. `apps/web/src/components/canvas-shell.tsx:382` renders the compact status pill and `apps/web/src/components/canvas-shell.tsx:302` exposes diagnostics. E2E asserted visible `Backend sync` and online state at `apps/web/e2e/canvas-smoke.spec.ts:18`; recovery asserted `Backend unavailable` at `apps/web/scripts/smoke-sync-recovery.mjs:64`.
- **Distinguish collaborators**: PASS. `apps/web/src/components/canvas-shell.tsx:464` configures a supported `TLUserStore` using `UserRecordType`/`createUserId`, while `apps/web/src/components/canvas-shell.tsx:162` exposes `editor.getCollaborators()` diagnostics without promising a custom roster. E2E verifies independent browser contexts have distinct `deviceId` and `deviceName` values at `apps/web/e2e/canvas-smoke.spec.ts:225`.
- **Use multiple tabs on one device**: PASS. `apps/web/src/lib/device-identity.ts:22` persists a stable device id, `apps/web/src/lib/device-identity.ts:44` creates independent tab ids, and same-context E2E asserts same `deviceId` with different `sessionId`/`sessionLabel` at `apps/web/e2e/canvas-smoke.spec.ts:341`.
- **See a safe share affordance**: PASS. `apps/web/src/lib/room-share.ts:8` constructs only an origin plus canonical `/rooms/:roomId` URL after room-id validation and strips search/hash at `apps/web/src/lib/room-share.ts:24`. E2E verifies the button's generated URL equals the current room URL and receives copy/fallback feedback at `apps/web/e2e/canvas-smoke.spec.ts:64`.
- **Recover from backend interruption**: PASS. `apps/web/scripts/smoke-sync-recovery.mjs:32` covers backend unavailable before connect, and `apps/web/scripts/smoke-sync-recovery.mjs:96` controls backend stop/restart, checks reset-risk messaging, route stability, configured backend URI, and recovery to `Backend sync`.

## TDD Decision Evaluation
PASS. TDD was appropriate because this sprint added deterministic state mapping, identity/session derivation, validation, and share URL construction. The build log records RED evidence from missing helper modules, then GREEN with 37 passing unit tests, and REFACTOR by moving presentation logic outside React. I independently reran `pnpm --filter @production-spec-graph/web test:unit`: 8 files and 37 tests passed, including `collaboration-status`, `collaborator-identity`, `device-identity`, `sync-config`, and `room-share`.

The tldraw/React wiring was reasonably validated by typecheck and browser runtime checks rather than pure TDD, matching the contract's stated tradeoff.

## E2E / Runtime Verification
PASS. Independently executed:
- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 37 tests / 8 files.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 4 Playwright tests.
- `pnpm --filter @production-spec-graph/web test:recovery`: PASS, `sync recovery smoke: PASS`.
- `pnpm check`: PASS, including web unit/typecheck/build/E2E.
- `pnpm --filter @production-spec-graph/server test`: PASS, 14 tests / 4 files.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS, reported `storage: "process-local-memory"` and one room id.

The E2E suite starts the backend and web app through `apps/web/playwright.config.ts:9`, verifies normal sync, two independent contexts, same-device multi-tab behavior, share URL behavior, edit propagation, and invalid route rejection. The recovery script starts web against an unused backend port, then starts/stops/restarts the real backend process and validates visible status/diagnostics.

## Modularity & Readability Gate
PASS. The deterministic helper boundaries are cohesive: status mapping in `apps/web/src/lib/collaboration-status.ts:35`, identity/session cues in `apps/web/src/lib/collaborator-identity.ts:25`, stable device/tab generation in `apps/web/src/lib/device-identity.ts:22`, sync URL/session validation in `apps/web/src/lib/sync-config.ts:41`, and share URL construction in `apps/web/src/lib/room-share.ts:8`.

`CanvasShell` remains the integration boundary for `useSync`, `TLUserStore`, compact chrome, and diagnostics (`apps/web/src/components/canvas-shell.tsx:282`, `apps/web/src/components/canvas-shell.tsx:337`, `apps/web/src/components/canvas-shell.tsx:425`). The hydration fix is visible at `apps/web/src/components/canvas-shell.tsx:191` and `apps/web/src/components/canvas-shell.tsx:559`: identity/session creation is deferred until after client mount, so SSR and first browser render are deterministic. Tests are named around core behavior and serve as readable behavior documentation.

## Human Checkpoint
PASS. `build-log.md` explicitly says to pause after Sprint 4 and gives exact local commands: `pnpm --filter @production-spec-graph/server dev` and `pnpm --filter @production-spec-graph/web dev`. It also lists concrete manual inspections for status, two-profile identity cues, same-profile tab diagnostics, share link behavior, and backend stop/restart recovery.

## Criteria Evaluation

### AC-4.1: The web UI exposes compact collaboration status for connecting/loading, synced online, offline/reconnecting/disconnected, local-cache, and error states, with stable layout that keeps the tldraw canvas usable.
- **Verdict**: PASS
- **Evidence**: `apps/web/src/lib/collaboration-status.ts:35` maps all required states; unit coverage is at `apps/web/src/lib/collaboration-status.test.ts:6`. `apps/web/src/components/canvas-shell.tsx:382` renders the status pill in the top toolbar and `apps/web/app/globals.css:30` uses a two-row shell with the editor occupying the workspace at `apps/web/app/globals.css:214`. E2E asserts the canvas container remains visible and larger than 300x300 at `apps/web/e2e/canvas-smoke.spec.ts:25`.
- **Notes**: Independent web unit, E2E, and recovery commands passed.

### AC-4.2: Presence or collaborator identity is configured through supported tldraw 5.0.1 APIs so independent clients can be distinguished; stable device-level identity cues survive reloads where supported. Unsupported tldraw internals must be documented in `build-log.md` rather than simulated.
- **Verdict**: PASS
- **Evidence**: `apps/web/src/components/canvas-shell.tsx:464` creates a `TLUserStore` with `UserRecordType.create` and `createUserId`; `apps/web/src/components/canvas-shell.tsx:162` reads supported `editor.getCollaborators()` diagnostics. `apps/web/e2e/canvas-smoke.spec.ts:225` verifies two independent contexts have distinct device ids/names, and `apps/web/e2e/canvas-smoke.spec.ts:250` verifies reload keeps the same device identity.
- **Notes**: `build-log.md` documents that the sprint uses supported user identity/collaborator diagnostics and does not simulate unsupported remote roster internals.

### AC-4.3: Same-device multi-tab behavior preserves one stable device id while creating independent tab/session ids for each tab, with no shared mutable tab state or session-id collision.
- **Verdict**: PASS
- **Evidence**: `apps/web/src/lib/device-identity.ts:22` reads/writes local storage for the stable device id and `apps/web/src/lib/device-identity.ts:44` creates a new tab id per page initialization. Unit tests cover stable device reuse and independent tab ids at `apps/web/src/lib/device-identity.test.ts:23` and `apps/web/src/lib/device-identity.test.ts:88`. E2E verifies same `deviceId` and different `sessionId`/`sessionLabel` in one browser context at `apps/web/e2e/canvas-smoke.spec.ts:341`.
- **Notes**: The implementation does not append custom session query params to the tldraw sync URL, matching the build-log API compatibility note that tldraw appends its own connection params.

### AC-4.4: A safe share affordance, if implemented in this sprint, exposes only the current canonical `/rooms/:roomId` URL and provides visible copy/fallback feedback without leaking backend URL, auth data, or unsafe route input.
- **Verdict**: PASS
- **Evidence**: `apps/web/src/lib/room-share.ts:8` validates the room id and constructs the URL from `window.location.origin`; `apps/web/src/lib/room-share.ts:24` sets only the canonical room path and clears query/hash. Unit tests reject unsafe ids and strip token-like query input at `apps/web/src/lib/room-share.test.ts:18`. E2E verifies `data-share-url` equals the current route URL and visible feedback changes to `Copied` or `Link ready` at `apps/web/e2e/canvas-smoke.spec.ts:64`.
- **Notes**: No backend URL, auth token, query string, or hash is included in the generated share URL.

### AC-4.5: Backend unavailable before connect produces a recoverable visible sync configuration/connection failure state and no blank page or crash. The app must not silently connect to tldraw demo sync or generate a new room id.
- **Verdict**: PASS
- **Evidence**: `apps/web/scripts/smoke-sync-recovery.mjs:32` starts web with `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` pointing to an unused local port, waits for `Backend unavailable` at `apps/web/scripts/smoke-sync-recovery.mjs:64`, asserts the route remains stable at `apps/web/scripts/smoke-sync-recovery.mjs:78`, asserts diagnostics point at the configured backend port at `apps/web/scripts/smoke-sync-recovery.mjs:79`, rejects hosted demo sync at `apps/web/scripts/smoke-sync-recovery.mjs:83`, and checks no page errors at `apps/web/scripts/smoke-sync-recovery.mjs:87`.
- **Notes**: Independent `pnpm --filter @production-spec-graph/web test:recovery` passed.

### AC-4.6: Backend interruption/restart after clients connect surfaces reconnect/reset behavior and documents the process-local storage reset expectation. After backend restart, reconnecting clients remain on the same route and either resync or visibly indicate the in-memory reset without crashing.
- **Verdict**: PASS
- **Evidence**: `apps/web/scripts/smoke-sync-recovery.mjs:96` starts backend plus web, `apps/web/scripts/smoke-sync-recovery.mjs:136` stops the backend, `apps/web/scripts/smoke-sync-recovery.mjs:137` waits for reconnecting/unavailable/error status, `apps/web/scripts/smoke-sync-recovery.mjs:148` asserts process-local reset-risk detail, `apps/web/scripts/smoke-sync-recovery.mjs:154` restarts the backend, and `apps/web/scripts/smoke-sync-recovery.mjs:156` waits for recovery to `Backend sync`. Route stability and configured backend URI are asserted at `apps/web/scripts/smoke-sync-recovery.mjs:165`.
- **Notes**: The status copy includes process-local reset expectations in `apps/web/src/lib/collaboration-status.ts:32`.

### AC-4.7: Existing F1-F3 guarantees are preserved: route room ids remain canonical, invalid room routes do not start sync, explicit `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` is still required, and two independent clients can still share a tldraw document edit in the same route-backed room.
- **Verdict**: PASS
- **Evidence**: Root entry redirects to a canonical room route at `apps/web/app/page.tsx:9`. The room page returns an invalid-room state without mounting `CanvasShell` for invalid ids at `apps/web/app/rooms/[roomId]/page.tsx:14`. `apps/web/src/lib/sync-config.ts:41` rejects missing server URL and hosted demo sync. E2E verifies edit propagation between two independent contexts at `apps/web/e2e/canvas-smoke.spec.ts:254`, hosted demo sync is absent at `apps/web/e2e/canvas-smoke.spec.ts:237`, and invalid routes do not create `window.__PSG_SYNC__` or a tldraw container at `apps/web/e2e/canvas-smoke.spec.ts:359`.
- **Notes**: Inferred backend checks also passed: server test, typecheck, build, and smoke.

## Critical Issues (FAIL items only)

None.

## Quality Notes (non-blocking)
- `docs/exec-plans/quality-commands.md` remains web-focused and does not yet list the backend/recovery commands; this is explicitly out of scope for Sprint 4 and owned by F5.
- `pnpm check` currently covers only web validation. Sprint 4 compensated by running inferred backend and recovery commands independently, and F5 should fold those into documented quality commands.
- The participant experience is intentionally limited to stable identity cues plus tldraw-supported collaborator diagnostics. There is no custom roster, auth-backed display name, durable room state, or production persistence in this sprint.

## Recommendation
PASS — ship and proceed to next sprint.
