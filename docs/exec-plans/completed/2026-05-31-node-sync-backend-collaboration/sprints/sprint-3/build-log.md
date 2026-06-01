# Sprint 3 Build Log: Route-Driven Room Creation and Joining

## Summary
Implemented F3 by replacing Sprint 2's fixed-room entry contract with canonical
route-backed collaboration rooms at `/rooms/:roomId`.

The root route `/` now creates a safe unique room id and redirects to
`/rooms/:roomId` before the tldraw sync store is initialized. Valid room routes
join that exact room id. Invalid/unsafe room routes render an explicit
recoverable invalid-room state and do not mount tldraw or expose sync
diagnostics, so unsafe ids are never used to build backend WebSocket sync URIs.

`NEXT_PUBLIC_PSG_SYNC_SERVER_URL` remains explicitly required from F2; F3 did
not reintroduce a backend URL fallback. The web client also no longer accepts
or declares `NEXT_PUBLIC_PSG_SYNC_ROOM_ID`; room identity now comes only from the
validated route boundary.

## Behavior Scenario Evidence
- Enter without a room id: `app/page.tsx` calls `decideRoomRoute({})` and
  redirects to a generated `/rooms/room-...` path. The Playwright canvas smoke
  opens `/`, verifies the canonical room URL, and confirms sync diagnostics only
  exist after route-backed room entry.
- Join from a shared room route: `app/rooms/[roomId]/page.tsx` validates the
  route param and renders `CanvasShell roomId={decision.roomId}`. The
  collaboration E2E opens the same `/rooms/e2e-shared-room-...` URL in two
  independent browser contexts, verifies both use the same route-derived room
  URI, and observes a text shape sync from one client to the other.
- Recover from an invalid room route: invalid routes render `Invalid room` and
  the `.canvas-shell__error` message. The E2E opens `/rooms/%2E%2E%2Fbad`,
  verifies no `window.__PSG_SYNC__` exists, and verifies no `.tl-container` is
  mounted.
- Avoid room-generation loops: route helpers include canonical path checks; E2E
  reloads a valid room URL, opens the same room in a second context, and uses
  back/forward navigation between a valid room URL and a generated root-entry
  room URL without duplicate generation for the existing valid room.
- Share edits through a route-backed room: the existing two-context edit sync
  test now uses route-backed room URLs instead of the F2 fixed default room.

## TDD Evidence
- RED: added `room-route.test.ts` before wiring Next routes. Tests covered safe
  generated room id shape, canonical `/rooms/:roomId` path building, no-room
  create decisions, valid-room join decisions, invalid/empty/oversized room
  rejection, and canonical path checks.
- GREEN: implemented `room-route.ts`, updated `/` and `/rooms/[roomId]`, and
  changed `CanvasShell` to require a validated `roomId`.
- REFACTOR: kept deterministic route behavior in `room-route.ts`; kept
  `sync-config.ts` responsible for sync URL/session validation; kept Next route
  files thin; and left `CanvasShell` focused on tldraw sync wiring.

## Validation
- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 25 tests across
  5 files.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS. Next reports `/` as
  static and `/rooms/[roomId]` as dynamic.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 3 Playwright
  tests. Covered root canonicalization, route-backed same-room sync, reload,
  back/forward, and invalid route recovery without sync mount.
- `pnpm --filter @production-spec-graph/server test`: PASS, 14 tests.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS.
- `pnpm check`: PASS; sequentially reran web unit, typecheck, build, and the
  integrated route-backed Playwright checks.
- `rg -n "psg-default-room|NEXT_PUBLIC_PSG_SYNC_ROOM_ID|DEFAULT_SYNC_ROOM_ID" apps/web/app apps/web/src apps/web/e2e apps/web/package.json apps/web/playwright.config.ts`:
  PASS, no matches. This verifies the former fixed room id and env override are
  no longer part of the route-backed web entry contract.

## Modularity Notes
- `room-route.ts` owns route room id generation, route decisions, canonical path
  construction, and no-loop canonical path checks.
- `sync-config.ts` still owns backend sync URL/session validation and the
  explicit server URL requirement.
- `app/page.tsx` is only the root create-and-redirect entrypoint.
- `app/rooms/[roomId]/page.tsx` is only route param validation plus either
  `CanvasShell` or explicit invalid-room UI.
- `CanvasShell` no longer knows about fixed default rooms; it consumes a
  validated route room id from the page boundary.

## Human Checkpoint
Pause after Sprint 3. Recommended local inspection:

```sh
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/web dev
```

Inspect:
- Opening `http://127.0.0.1:3000/` lands on
  `http://127.0.0.1:3000/rooms/<safe-id>`.
- Reloading that URL keeps the same room.
- Opening the copied `/rooms/<safe-id>` URL in a second browser profile/context
  joins the same document and shares a simple tldraw edit.
- Opening `/rooms/%2E%2E%2Fbad` shows `Invalid room`, does not mount tldraw,
  and does not expose `window.__PSG_SYNC__`.
- Running web without `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` still shows the F2 sync
  configuration error for valid room routes.

Known limitation:
F3 makes the URL itself shareable but does not add copy-link/share UI,
collaborator presence polish, persistence, auth, or backend restart recovery.
Those remain deferred to F4/F5 or later production hardening.
