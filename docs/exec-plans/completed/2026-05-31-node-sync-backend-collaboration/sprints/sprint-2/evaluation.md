# Evaluation: Sprint 2 — Round 2

## Verdict: PASS

## Summary
Round 2 fixes the prior AC-2.3 blocker: missing backend sync server configuration now returns `INVALID_SERVER_URL` and renders a visible recoverable configuration error instead of falling back to localhost. I independently reran the contract's package, unit, typecheck, build, E2E, and full `pnpm check` commands; all passed, and an additional no-config browser smoke confirmed the visible error state.

## Behavior Scenario Evaluation
- Create a stable device identity: PASS. `apps/web/src/lib/device-identity.ts:22-42` creates and stores opaque `psg-device-...` ids, reuses valid stored ids, and falls back to ephemeral ids when storage is unavailable. `apps/web/src/lib/device-identity.test.ts:23-58` covers stable reuse and independent storage profiles; `apps/web/e2e/canvas-smoke.spec.ts:194-210` verifies two independent contexts receive different ids and reload preserves one context's id.
- Build a backend sync connection for the known/default room: PASS. `apps/web/src/lib/sync-config.ts:42-52` now rejects missing `serverUrl`, while `apps/web/src/lib/sync-config.ts:72-85` builds the configured room URI. `apps/web/src/lib/sync-config.test.ts:74-83` asserts missing server URL returns `INVALID_SERVER_URL`, and the targeted browser smoke without `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` rendered `Sync configuration error` with `window.__PSG_SYNC__.error.code === "INVALID_SERVER_URL"`.
- Connect the tldraw editor to backend sync: PASS. `apps/web/src/components/canvas-shell.tsx:9` imports `useSync`; `apps/web/src/components/canvas-shell.tsx:200-204` creates the sync store; `apps/web/src/components/canvas-shell.tsx:221-224` mounts `<Tldraw store={store} />`.
- Share edits between independent clients: PASS. `apps/web/e2e/canvas-smoke.spec.ts:168-268` opens two independent browser contexts, verifies the same configured room URI and distinct device ids, creates a text shape in one context, and observes it in the other through the backend.
- Maintain tldraw 5 client compatibility: PASS. `apps/web/package.json:15-19` pins `@tldraw/sync` and `tldraw` to `5.0.1`; `apps/web/src/lib/tldraw-agent-actions.ts:56-116` uses tldraw 5-compatible `TLShapePartial` and concrete shape types. Independent typecheck and build passed.

## TDD Decision Evaluation
PASS. TDD remains appropriate for deterministic identity and sync configuration logic. The Round 2 revision added the missing-server-url expectation in `apps/web/src/lib/sync-config.test.ts:74-83`, and independent `pnpm --filter @production-spec-graph/web test:unit` passed 19 tests across 4 files, including the revised sync-config coverage.

## E2E / Runtime Verification
Independently ran `pnpm --filter @production-spec-graph/web list tldraw @tldraw/sync --depth 0`: PASS; resolved `@tldraw/sync 5.0.1` and `tldraw 5.0.1`.

Independently ran `pnpm --filter @production-spec-graph/web test:unit`: PASS; 4 files and 19 tests passed, including `sync-config.test.ts` with 7 tests.

Independently ran `pnpm --filter @production-spec-graph/web typecheck`: PASS.

Independently ran `pnpm --filter @production-spec-graph/web build`: PASS; Next build completed and prerendered `/`.

Independently ran `pnpm --filter @production-spec-graph/web test:e2e`: PASS; 2 Playwright tests passed, including the two-context collaboration test.

Independently ran `pnpm check`: PASS; it sequentially reran web unit tests, typecheck, build, and E2E, with 2 Playwright tests passing.

Additional Round 2 blocker verification: I started Next dev on `127.0.0.1:3101` with `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` and `NEXT_PUBLIC_PSG_SYNC_ROOM_ID` unset, then launched headless Chrome against it. Observed JSON result: `status: "Sync configuration error"`, `alertText: "Collaboration is not connected.Sync server URL must be configured explicitly."`, and `hook.error.code: "INVALID_SERVER_URL"`. This confirms missing backend sync URL is visible and recoverable instead of silently using localhost.

## Modularity & Readability Gate
PASS. The implementation keeps deterministic identity logic in `apps/web/src/lib/device-identity.ts`, sync parsing and URL construction in `apps/web/src/lib/sync-config.ts`, React/tldraw wiring in `apps/web/src/components/canvas-shell.tsx`, and tldraw action compatibility in `apps/web/src/lib/tldraw-agent-actions.ts`. `rg` found no `useSyncDemo` usage and no route/pathname/params room behavior in the F2 web code; local dev and Playwright explicitly configure `NEXT_PUBLIC_PSG_SYNC_SERVER_URL=http://127.0.0.1:3001` in `apps/web/package.json:8` and `apps/web/playwright.config.ts:17-22`.

## Human Checkpoint
PASS. `build-log.md` explicitly says to pause after Sprint 2, gives local server/web commands, and tells the developer to inspect two independent browser profiles, `Backend sync`, shared shape edits, `window.__PSG_SYNC__`, local `/sync/psg-default-room` traffic, and the missing-env configuration error behavior.

## Criteria Evaluation

### AC-2.1: `apps/web` depends on the compatible `@tldraw/sync` client package and resolves `tldraw@5.0.1` without using tldraw's hosted demo sync server.
- **Verdict**: PASS
- **Evidence**: `apps/web/package.json:15-19` lists `@tldraw/sync` `5.0.1` and `tldraw` `5.0.1`; package list command resolved both at `5.0.1`. `rg` found no `useSyncDemo`; hosted demo references are limited to rejection logic/tests and E2E absence assertion.
- **Notes**: `apps/web/src/lib/sync-config.ts:133-140` rejects hosted demo sync hosts.

### AC-2.2: The web app creates an opaque random stable device id, persists it across reloads in the same browser profile, and produces different ids for independent browser contexts/profiles.
- **Verdict**: PASS
- **Evidence**: `apps/web/src/lib/device-identity.ts:22-42` implements storage-backed opaque ids; `apps/web/src/lib/device-identity.test.ts:23-58` covers stable reuse and independent profiles; `apps/web/e2e/canvas-smoke.spec.ts:194-210` verifies independent contexts and reload persistence.
- **Notes**: IDs are random UUID-derived opaque values and invalid stored personal-looking values are replaced by `device-identity.test.ts:60-73`.

### AC-2.3: Backend sync URL/session URL construction is configuration-driven and targets the F1 endpoint shape `/sync/:roomId?sessionId=:sessionId` for the known/default room, with no silent fallback when configuration is missing or invalid.
- **Verdict**: PASS
- **Evidence**: `apps/web/src/lib/sync-config.ts:42-52` returns `INVALID_SERVER_URL` when `serverUrl` is missing; `apps/web/src/lib/sync-config.ts:72-85` builds the URI only after explicit configuration; `apps/web/src/lib/sync-config.test.ts:74-83` covers missing URL rejection. Runtime no-config smoke observed `Sync configuration error` and `window.__PSG_SYNC__.error.code === "INVALID_SERVER_URL"`.
- **Notes**: The F2 default room id remains allowed at `apps/web/src/lib/sync-config.ts:2` and `apps/web/src/lib/sync-config.ts:54`. No manual `sessionId` query parameter is required because installed `@tldraw/sync@5.0.1` appends reserved `sessionId` and `storeId`.

### AC-2.4: The tldraw canvas mounts with a synchronized store created by `useSync` or the compatible tldraw 5.0.1 sync client API, while retaining the existing full-screen editable canvas shell and minimal loading/error states.
- **Verdict**: PASS
- **Evidence**: `apps/web/src/components/canvas-shell.tsx:9` imports `useSync`; `apps/web/src/components/canvas-shell.tsx:200-204` creates the synchronized store; `apps/web/src/components/canvas-shell.tsx:221-224` renders `<Tldraw store={store} />`; `apps/web/src/components/canvas-shell.tsx:171-181` renders the visible configuration error state. Independent unit, typecheck, build, E2E, and `pnpm check` passed.
- **Notes**: The targeted no-config browser smoke exercised the error UI branch.

### AC-2.5: Two independent web clients in the same known/default room can share a document through the dedicated backend: a simple shape created/edited/deleted in one client becomes observable in the other.
- **Verdict**: PASS
- **Evidence**: `apps/web/playwright.config.ts:9-26` starts the backend and web app with explicit local sync configuration. `apps/web/e2e/canvas-smoke.spec.ts:168-268` verifies two independent contexts, same room URI, distinct device ids, reload persistence, shape creation in client A, and observation in client B. Independent `pnpm --filter @production-spec-graph/web test:e2e` and `pnpm check` both passed with 2 Playwright tests.
- **Notes**: The E2E asserts the URI contains `ws://127.0.0.1:3001/sync/` and not `demo.tldraw.xyz`.

### AC-2.6: Web client package/API usage is aligned with tldraw 5.0.1, including fixing the broad `TldrawShapePartial` compatibility issue in `apps/web/src/lib/tldraw-agent-actions.ts` if it blocks typecheck/build.
- **Verdict**: PASS
- **Evidence**: `apps/web/src/lib/tldraw-agent-actions.ts:8-16` imports tldraw 5 shape types; `apps/web/src/lib/tldraw-agent-actions.ts:56-116` uses concrete `TLShapePartial<TLTextShape>`, `TLShapePartial<TLGeoShape>`, and compatible update partials. Independent typecheck, build, unit tests, and E2E passed.
- **Notes**: No broad `TldrawShapePartial` alias remains in the changed adapter.

## Critical Issues (FAIL items only)

None.

## Quality Notes (non-blocking)
- `DEFAULT_SYNC_SERVER_URL` remains exported for explicit local dev/test input, but `resolveSyncConfig` no longer uses it as an implicit fallback.
- The F2 fixed default room remains intentionally scoped to `psg-default-room`; F3 route-driven room behavior was not introduced.

## Recommendation
PASS — ship and proceed to next sprint
