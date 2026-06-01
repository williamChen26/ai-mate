# Evaluation: Sprint 3 — Round 1 Post-Cleanup Re-evaluation

## Verdict: PASS

## Summary
Sprint 3 meets the approved F3 contract after cleanup. Room identity now comes from the validated route boundary: `/` redirects to a generated canonical `/rooms/:roomId`, valid room routes join the exact route id, invalid routes do not mount sync, and the former fixed/default room env path is absent from the web app surface.

Independent validation passed for web unit/typecheck/build/E2E, server test/typecheck/build/smoke, `pnpm check`, and a targeted grep for removed fixed-room identifiers.

## Behavior Scenario Evaluation
- **Enter without a room id**: PASS. `apps/web/app/page.tsx:10` calls `decideRoomRoute({})`, and `apps/web/app/page.tsx:15` redirects to the generated canonical path before `CanvasShell` can mount. Playwright verifies `/` lands on `/rooms/room-...` and that sync diagnostics use the route-derived room id at `apps/web/e2e/canvas-smoke.spec.ts:11` through `apps/web/e2e/canvas-smoke.spec.ts:44`.
- **Join from a shared room route**: PASS. `apps/web/app/rooms/[roomId]/page.tsx:12` validates the route param and `apps/web/app/rooms/[roomId]/page.tsx:47` passes `decision.roomId` into `CanvasShell`. E2E opens the same `/rooms/e2e-shared-room-...` in two independent contexts and verifies both use the same route-derived room URI at `apps/web/e2e/canvas-smoke.spec.ts:183` through `apps/web/e2e/canvas-smoke.spec.ts:209`.
- **Recover from an invalid room route**: PASS. Invalid route params render the invalid-room state at `apps/web/app/rooms/[roomId]/page.tsx:14` through `apps/web/app/rooms/[roomId]/page.tsx:44` without mounting `CanvasShell`. E2E verifies `/rooms/%2E%2E%2Fbad` exposes no `window.__PSG_SYNC__` and no `.tl-container` at `apps/web/e2e/canvas-smoke.spec.ts:288` through `apps/web/e2e/canvas-smoke.spec.ts:299`.
- **Avoid room-generation loops**: PASS. `decideRoomRoute` creates only when no room id is present and joins valid route ids without generation at `apps/web/src/lib/room-route.ts:35` through `apps/web/src/lib/room-route.ts:61`. E2E covers reload, a second context on the same route, and back/forward between a known room and a generated room at `apps/web/e2e/canvas-smoke.spec.ts:211` through `apps/web/e2e/canvas-smoke.spec.ts:281`.
- **Share edits through a route-backed room**: PASS. The collaboration E2E creates a text shape in one independent context and waits for the second context to observe the same shape through backend sync at `apps/web/e2e/canvas-smoke.spec.ts:222` through `apps/web/e2e/canvas-smoke.spec.ts:273`.

## TDD Decision Evaluation
PASS. The contract selected TDD for deterministic routing and validation logic, which is appropriate because room parsing, canonicalization, and unsafe-input rejection are deterministic boundary logic. The build log records RED/GREEN/REFACTOR evidence at `docs/exec-plans/active/2026-05-31-node-sync-backend-collaboration/sprints/sprint-3/build-log.md:37` through `docs/exec-plans/active/2026-05-31-node-sync-backend-collaboration/sprints/sprint-3/build-log.md:46`.

Focused tests cover generated room id shape, canonical path construction, create/join decisions, invalid/empty/oversized rejection, no-loop path checks, route-backed sync config, unsafe room rejection, and missing server URL behavior in `apps/web/src/lib/room-route.test.ts:10` through `apps/web/src/lib/room-route.test.ts:65` and `apps/web/src/lib/sync-config.test.ts:42` through `apps/web/src/lib/sync-config.test.ts:136`.

## E2E / Runtime Verification
PASS. I independently ran:

- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 25 tests / 5 files.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS; Next reports `/` static and `/rooms/[roomId]` dynamic.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 3 Playwright tests.
- `pnpm --filter @production-spec-graph/server test`: PASS, 14 tests / 4 files.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS; smoke returned `ok: true`, `/sync/:roomId?sessionId=:sessionId`, room id `alpha`, and `storage: "process-local-memory"`.
- `pnpm check`: PASS, including web unit, typecheck, build, and 3 Playwright tests.
- `rg -n "psg-default-room|NEXT_PUBLIC_PSG_SYNC_ROOM_ID|DEFAULT_SYNC_ROOM_ID|roomId.*process\\.env|process\\.env.*ROOM|DEFAULT.*ROOM" apps/web/app apps/web/src apps/web/e2e apps/web/package.json apps/web/playwright.config.ts`: PASS by absence; `rg` exited 1 with no matches.

Runtime E2E specifically covers root canonicalization, exact route-backed room joining, invalid route recovery before sync mount, valid route reload, same-route second context, back/forward behavior, and two-context edit propagation.

## Modularity & Readability Gate
PASS. The route boundary is cohesive: `apps/web/src/lib/room-route.ts:22` through `apps/web/src/lib/room-route.ts:65` owns room id generation, canonical path construction, route decisions, and canonical path checks. Sync URL/session validation remains separate in `apps/web/src/lib/sync-config.ts:41` through `apps/web/src/lib/sync-config.ts:145`, and missing room ids are rejected at `apps/web/src/lib/sync-config.ts:53` through `apps/web/src/lib/sync-config.ts:59`.

The Next route files stay thin: `apps/web/app/page.tsx:9` through `apps/web/app/page.tsx:15` is only the root create-and-redirect entry, while `apps/web/app/rooms/[roomId]/page.tsx:10` through `apps/web/app/rooms/[roomId]/page.tsx:47` validates and either renders invalid-room UI or passes a validated room id to `CanvasShell`. `CanvasShell` requires a `roomId` prop at `apps/web/src/components/canvas-shell.tsx:87` and passes only that route-derived value into `resolveSyncConfig` at `apps/web/src/components/canvas-shell.tsx:264` through `apps/web/src/components/canvas-shell.tsx:272`.

Tests are readable as behavior documentation: `room-route.test.ts` names the create, join, reject, and no-loop cases; `canvas-smoke.spec.ts` exercises the user-visible routing and collaboration flows. No severe low-cohesion changes or hidden fixed-room coupling were found.

## Human Checkpoint
PASS. `build-log.md` explicitly says to pause after Sprint 3 and gives exact local commands plus manual inspection steps at `docs/exec-plans/active/2026-05-31-node-sync-backend-collaboration/sprints/sprint-3/build-log.md:75` through `docs/exec-plans/active/2026-05-31-node-sync-backend-collaboration/sprints/sprint-3/build-log.md:92`.

## Criteria Evaluation

### AC-3.1: Opening `/` generates a safe unique room id, navigates to canonical `/rooms/:roomId`, and does not initialize sync with the fixed F2 default room or any room before route validation succeeds.
- **Verdict**: PASS
- **Evidence**: Root page redirects at `apps/web/app/page.tsx:10` through `apps/web/app/page.tsx:15`; route id generation and canonical path building are tested at `apps/web/src/lib/room-route.test.ts:11` through `apps/web/src/lib/room-route.test.ts:31`; E2E verifies `/` becomes `/rooms/room-...` and diagnostics use the generated route room at `apps/web/e2e/canvas-smoke.spec.ts:11` through `apps/web/e2e/canvas-smoke.spec.ts:44`.
- **Notes**: Because `/` redirects server-side and does not render `CanvasShell`, sync cannot initialize before the canonical route page. The targeted grep found no `psg-default-room`, `NEXT_PUBLIC_PSG_SYNC_ROOM_ID`, or `DEFAULT_SYNC_ROOM_ID` references in the web app surface.

### AC-3.2: Opening `/rooms/:roomId` with a valid room id joins that exact room id, preserves the canonical URL across reloads, and uses that id when building the sync URI.
- **Verdict**: PASS
- **Evidence**: Valid route decisions preserve the route id at `apps/web/src/lib/room-route.ts:48` through `apps/web/src/lib/room-route.ts:61` and are tested at `apps/web/src/lib/room-route.test.ts:34` through `apps/web/src/lib/room-route.test.ts:45`. The route page passes the validated room id to `CanvasShell` at `apps/web/app/rooms/[roomId]/page.tsx:47`; E2E verifies exact room id, exact URI, and reload URL preservation at `apps/web/e2e/canvas-smoke.spec.ts:183` through `apps/web/e2e/canvas-smoke.spec.ts:220`.
- **Notes**: `buildSyncRoomUri` constructs `/sync/:roomId` only after validating the id at `apps/web/src/lib/sync-config.ts:92` through `apps/web/src/lib/sync-config.ts:145`.

### AC-3.3: Invalid, oversized, empty, malformed, or unsafe route room ids are rejected client-side and never sent to the backend as sync room identifiers.
- **Verdict**: PASS
- **Evidence**: `parseRoomId` rejects non-string, empty, oversized, and pattern-invalid ids at `apps/web/src/lib/sync-config.ts:148` through `apps/web/src/lib/sync-config.ts:174`; route decisions return `kind: "invalid"` before sync construction at `apps/web/src/lib/room-route.ts:48` through `apps/web/src/lib/room-route.ts:55`. Unit coverage is at `apps/web/src/lib/room-route.test.ts:47` through `apps/web/src/lib/room-route.test.ts:58` and `apps/web/src/lib/sync-config.test.ts:60` through `apps/web/src/lib/sync-config.test.ts:72`. E2E verifies an encoded unsafe route exposes no sync diagnostics and mounts no tldraw container at `apps/web/e2e/canvas-smoke.spec.ts:288` through `apps/web/e2e/canvas-smoke.spec.ts:299`.
- **Notes**: Since invalid routes render in the server route component and never instantiate `CanvasShell`, no backend-bound sync URI is built for the unsafe id.

### AC-3.4: Reload, same-URL multi-tab open, and browser back/forward navigation do not create duplicate room-generation loops or disconnect the user from the intended valid room.
- **Verdict**: PASS
- **Evidence**: `decideRoomRoute` joins valid route ids without calling generation at `apps/web/src/lib/room-route.test.ts:34` through `apps/web/src/lib/room-route.test.ts:45`; canonical path checks are tested at `apps/web/src/lib/room-route.test.ts:60` through `apps/web/src/lib/room-route.test.ts:64`. E2E reloads the known room, opens the same URL in a second context, and exercises back/forward navigation at `apps/web/e2e/canvas-smoke.spec.ts:183` through `apps/web/e2e/canvas-smoke.spec.ts:220` and `apps/web/e2e/canvas-smoke.spec.ts:275` through `apps/web/e2e/canvas-smoke.spec.ts:281`.
- **Notes**: No redirect loop was observed in the independently run Playwright suite.

### AC-3.5: Two clients opening the same `/rooms/:roomId` URL share document edits through the existing dedicated backend sync service.
- **Verdict**: PASS
- **Evidence**: Playwright starts the server and web dev surfaces via `apps/web/playwright.config.ts:9` through `apps/web/playwright.config.ts:26`. The collaboration test opens the same route in two independent browser contexts at `apps/web/e2e/canvas-smoke.spec.ts:177` through `apps/web/e2e/canvas-smoke.spec.ts:185`, verifies matching route-derived room URI at `apps/web/e2e/canvas-smoke.spec.ts:201` through `apps/web/e2e/canvas-smoke.spec.ts:209`, creates a text shape in one context, and observes it in the other at `apps/web/e2e/canvas-smoke.spec.ts:222` through `apps/web/e2e/canvas-smoke.spec.ts:273`.
- **Notes**: Independent `pnpm --filter @production-spec-graph/web test:e2e` passed all 3 tests.

### AC-3.6: Missing `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` still shows the F2 visible sync configuration error and never falls back silently while route behavior is being added.
- **Verdict**: PASS
- **Evidence**: `resolveSyncConfig` returns `INVALID_SERVER_URL` when `serverUrl` is missing at `apps/web/src/lib/sync-config.ts:41` through `apps/web/src/lib/sync-config.ts:52`; unit coverage asserts that behavior at `apps/web/src/lib/sync-config.test.ts:74` through `apps/web/src/lib/sync-config.test.ts:83`. `CanvasShell` renders the visible configuration error instead of `useSync` when config resolution fails at `apps/web/src/components/canvas-shell.tsx:171` through `apps/web/src/components/canvas-shell.tsx:182`, and `useSync` is only called inside the successful `SyncedCanvasShell` branch at `apps/web/src/components/canvas-shell.tsx:193` through `apps/web/src/components/canvas-shell.tsx:204`.
- **Notes**: There is no silent room or server URL fallback in the runtime config path. `DEFAULT_SYNC_SERVER_URL` remains only as a test helper export; room identity is required from the route and missing room ids fail validation at `apps/web/src/lib/sync-config.ts:53` through `apps/web/src/lib/sync-config.ts:59`.

## Critical Issues (FAIL items only)

None.

## Quality Notes (non-blocking)
- `docs/exec-plans/quality-commands.md` remains mostly web-focused, but the approved Sprint 3 contract allowed inferring the smallest relevant server checks when this file is incomplete. The build log and this evaluation both record the server commands that were run.
- Deferred scope remains as contracted: no copy-link UI, presence polish, authentication, persistence, backend restart recovery UX, or production asset storage.
- The runtime validation depends on the local Playwright dev-server flow and process-local sync storage; durability and multi-process behavior are intentionally out of scope for F3.

## Recommendation
PASS — ship and proceed to next sprint.
