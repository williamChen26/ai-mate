# Sprint 2 Build Log: Web Client Sync Store and Stable Device Identity

## Summary
Implemented F2 by wiring `apps/web` to the dedicated F1 backend through
`@tldraw/sync@5.0.1` and `tldraw@5.0.1`.

The web app now creates a stable opaque browser/device id, derives a per-tab
session id for local observability, builds an explicitly configured backend room URI,
and mounts the existing full-screen canvas with a remote tldraw sync store for
the known F2 room `psg-default-room`. Route-driven room creation/joining remains
deferred to F3.

Package/API compatibility note:
`useSync` in `@tldraw/sync@5.0.1` automatically appends reserved `sessionId`
and `storeId` query parameters. The client therefore passes a room URI shaped
as `/sync/:roomId` and does not manually include `sessionId` in the URI. This
matches the installed package docs/types while still targeting the F1 server,
which receives the auto-added `sessionId`.

## Behavior Scenario Evidence
- Create a stable device identity: implemented `device-identity.ts` and tests
  for first-run creation, storage reuse, independent storage profiles, invalid
  stored values, storage-unavailable fallback, and per-tab session ids.
- Build a backend sync connection for the known/default room: implemented
  `sync-config.ts` and tests for HTTP-to-WS conversion, nested backend paths,
  explicit local server URL plus default room id, missing server URL rejection,
  unsafe room rejection, hosted demo URL rejection, and malformed session
  rejection.
- Connect the tldraw editor to backend sync: updated `CanvasShell` to call
  `useSync({ uri, assets: inlineBase64AssetStore, users })` and pass the
  remote store into `<Tldraw />`, while preserving the existing developer hooks.
- Share edits between independent clients: updated Playwright to start both
  `apps/server` and `apps/web`; added a two-context browser test that creates a
  text shape in one client and observes it in the other through the backend room.
- Maintain tldraw 5 client compatibility: fixed
  `apps/web/src/lib/tldraw-agent-actions.ts` by replacing the broad
  string-typed shape partial with tldraw 5 `TLShapePartial` / concrete shape
  types. Web typecheck now passes.

## TDD Evidence
- RED: added focused unit tests for `device-identity.ts` and `sync-config.ts`
  before implementing those modules. The tests covered stable storage reuse,
  independent profiles, invalid/missing storage, room URI construction,
  unsafe-room rejection, and demo-server rejection.
- GREEN: implemented the identity/config modules and tldraw 5 action typing
  fixes until `pnpm --filter @production-spec-graph/web test:unit` and
  `pnpm --filter @production-spec-graph/web typecheck` passed.
- REFACTOR: kept identity, sync config, user-store creation, and canvas wiring
  in separate boundaries. The user-store construction remains inside
  `CanvasShell` because it is component-adjacent glue for `useSync`; the
  deterministic identity/config logic stays outside React and is unit-tested.

## Validation
- `pnpm install --offline`: PASS; lockfile is up to date with
  `@tldraw/sync@5.0.1`.
- `pnpm --filter @production-spec-graph/web list tldraw @tldraw/sync --depth 0`:
  PASS; resolves `tldraw 5.0.1` and `@tldraw/sync 5.0.1`.
- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 19 tests across
  4 files.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 2 Playwright
  tests. The collaboration test started the backend and web app, opened two
  independent browser contexts in `psg-default-room`, verified distinct device
  ids, verified same room URI, reloaded one context to verify device id
  persistence, created a shape in client A, and observed it in client B.
- `pnpm --filter @production-spec-graph/server test`: PASS, 14 tests.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS.
- `pnpm check`: PASS; reran web unit, typecheck, build, and the integrated
  two-context Playwright checks.

Round 2 revision:
Evaluator found AC-2.3 failed because missing backend sync configuration
silently fell back to `ws://127.0.0.1:3001`. The revision made
`NEXT_PUBLIC_PSG_SYNC_SERVER_URL` explicitly required in `resolveSyncConfig`,
kept only the F2 default room id, added a missing-server-url unit expectation,
and updated Playwright plus the web `dev` script to pass the local backend URL
explicitly.

Round 2 validation:
- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 19 tests.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS when run without a
  concurrent Next dev server.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 2 tests.
- `pnpm check`: PASS. Note: Next `build` and Playwright `test:e2e` both write
  `.next`; running them in parallel can produce transient `.next` file errors,
  so validation should run them sequentially as `pnpm check` does.

Network/install caveat:
An initial `pnpm install` attempted to fetch `@tldraw/sync` and reported
`ENOTFOUND registry.npmjs.org`, but the package and lockfile were ultimately
present locally. A follow-up `pnpm install --offline` passed and confirmed the
workspace is consistent.

## Modularity Notes
- `device-identity.ts` owns stable opaque device ids and per-tab session ids.
- `sync-config.ts` owns room id validation, session id validation, backend URI
  construction, required backend URL handling, default F2 room id, and hosted
  demo URL rejection.
- `CanvasShell` owns only React/tldraw glue: creating collaboration state,
  configuring the tldraw user store from the device id, passing `useSync` output
  to `<Tldraw />`, and exposing developer runtime hooks.
- Playwright config now treats collaboration as a real integrated behavior by
  starting both server and web services for web E2E.

## Human Checkpoint
Pause after Sprint 2. Recommended local inspection:

```sh
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/web dev
```

Open `http://127.0.0.1:3000` or the printed Next.js URL in two independent
browser profiles/contexts. Confirm both canvases show `Backend sync`, create a
simple shape in one window, and observe it in the other. In devtools, inspect
`window.__PSG_SYNC__` and confirm the room URI points to
`ws://127.0.0.1:3001/sync/psg-default-room` rather than `demo.tldraw.xyz`.
The web `dev` script now supplies
`NEXT_PUBLIC_PSG_SYNC_SERVER_URL=http://127.0.0.1:3001` explicitly; running Next
without that variable should show the visible sync configuration error state.

Known limitation:
The F2 room is intentionally a fixed default room. Canonical route-based room
creation, shared room URLs, invalid route recovery, and polished presence/status
behavior are deferred to F3/F4.
