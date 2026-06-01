# Sprint 4 Build Log: Presence, Status, Multi-Tab Behavior, and Failure Recovery

## Summary
Implemented F4 by adding a compact collaboration chrome to the route-backed
tldraw canvas. The web app now exposes richer sync status, stable
privacy-safe device identity cues, independent per-tab session diagnostics, a
route-only copy-link affordance, and visible recovery states for backend
unavailable/reconnect paths.

The implementation keeps the F3 room route as the only room source and keeps
`NEXT_PUBLIC_PSG_SYNC_SERVER_URL` explicitly required. It does not add auth,
persistence, deployment, or hosted demo sync.

During runtime validation the new visible identity cue exposed a real
hydration mismatch: the previous render path created random device/tab IDs in
both server and browser render. The fix delays collaboration identity creation
until client mount, so SSR and the browser's first render are deterministic.

## Behavior Scenario Evidence
- See collaboration status: `collaboration-status.ts` maps loading, online
  remote sync, offline/reconnecting, local cache, not-synced, config error, and
  sync error states into compact labels, visual states, details, and recovery
  flags. `CanvasShell` renders the status in the top bar without covering the
  canvas and exposes the same state through `window.__PSG_SYNC__`.
- Distinguish collaborators: `collaborator-identity.ts` derives stable
  opaque `Device XXXX` labels and deterministic colors from the stable device
  id. The `TLUserStore` now uses those cues for tldraw user identity and shape
  attribution. `CanvasShell` also exposes `getCollaborators()` through
  diagnostics using tldraw 5's supported editor collaborator API.
- Use multiple tabs on one device: each page preserves the same local-storage
  device id while creating a fresh tab id and diagnostic session id. The new
  Playwright same-browser-context test verifies same `deviceId`, different
  `sessionId`, same route room URI, and editable tldraw instances in both tabs.
- See a safe share affordance: `room-share.ts` builds a canonical
  `/rooms/:roomId` URL from the browser origin and validated route room id. The
  share button exposes only that URL and shows clipboard/fallback feedback.
- Recover from backend interruption: `smoke-sync-recovery.mjs` runs two runtime
  checks. One starts web against an unused backend port and verifies
  `Backend unavailable` with the configured backend URI. The other starts
  backend plus web, stops the backend, verifies reconnect/reset messaging, then
  restarts the backend and verifies the client returns to `Backend sync` on the
  same route.

## TDD Evidence
- RED: added unit tests for `collaboration-status.ts`,
  `collaborator-identity.ts`, and `room-share.ts` before implementation.
  Initial `pnpm --filter @production-spec-graph/web test:unit` failed because
  those modules did not exist.
- GREEN: implemented the three helpers and reran unit tests successfully:
  37 tests across 8 files.
- REFACTOR: moved deterministic collaboration presentation logic out of React;
  kept `CanvasShell` focused on tldraw/useSync composition, compact chrome,
  developer diagnostics, and lifecycle wiring. Fixed the SSR/client hydration
  mismatch by gating random identity/session creation behind client readiness.

## tldraw 5 API Verification
- `@tldraw/sync@5.0.1` exposes `useSync({ uri, assets, users })`; the client
  continues using a route-backed `/sync/:roomId` URI and does not append custom
  `sessionId` query params because tldraw reserves and appends its own
  connection query params.
- `tldraw@5.0.1` supports `TLUserStore`, `UserRecordType`, `createUserId`, and
  editor collaborator inspection through `editor.getCollaborators()`.
- The sprint uses supported user identity and collaborator diagnostics rather
  than simulating unsupported remote roster internals.

## Validation
- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 37 tests across
  8 files.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS when run
  sequentially after build/type generation. A parallel typecheck/build attempt
  reproduced the known `.next/types` race and was not treated as a product
  failure.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 4 Playwright
  tests. Covered route entry, compact status, share URL, device/session
  diagnostics, two-context edit sync, same-device multi-tab sessions, and
  invalid route rejection.
- `pnpm --filter @production-spec-graph/web test:recovery`: PASS after
  escalation for local test port binding. Covered backend unavailable before
  connect and backend stop/restart recovery on the same route.
- `pnpm check`: PASS; sequentially ran web unit, typecheck, build, and 4 E2E
  tests.
- `pnpm --filter @production-spec-graph/server test`: PASS, 14 tests.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS.

## Modularity Notes
- `collaboration-status.ts` owns deterministic sync status view-model mapping.
- `collaborator-identity.ts` owns stable opaque device/user cues and tab
  session diagnostics.
- `room-share.ts` owns canonical safe room URL construction and route id
  validation.
- `CanvasShell` remains the React/tldraw integration boundary: it calls
  `useSync`, configures `TLUserStore`, renders compact toolbar chrome, exposes
  `window.__PSG_SYNC__` diagnostics, and attaches editor collaborator
  inspection after mount.
- `smoke-sync-recovery.mjs` is intentionally a runtime script because backend
  lifecycle interruption is process-control behavior rather than deterministic
  unit logic.

## Human Checkpoint
Pause after Sprint 4. Recommended local inspection:

```sh
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/web dev
```

Inspect:
- Opening a valid `/rooms/<safe-id>` route shows compact status, current device
  cue, and a copy-link affordance without covering the canvas.
- Opening the same route in two browser profiles shows distinct device labels
  and shared edits.
- Opening the same route in two tabs of one profile keeps the same device id but
  uses distinct session diagnostics in `window.__PSG_SYNC__`.
- Stopping/restarting the backend surfaces reconnect/reset expectations and
  keeps the same room route.

Known limitation:
The app now exposes stable identity cues and tldraw collaborator diagnostics,
but it does not build a custom participant roster, authentication-backed names,
durable room recovery, or production persistence. Those remain outside F4 and
will be documented in F5.
