# Sprint 5 Build Log: Integrated Verification, Developer Docs, and Quality Commands

## Summary
Completed the final F5 handoff slice by making collaboration validation
repeatable from root commands and documenting the finished architecture.

The root `pnpm check` command now runs the full sequential quality gate:
server tests, server typecheck, server build, server smoke, web unit tests, web
typecheck, web build, integrated Playwright E2E, and web recovery smoke. This
keeps the command path sequential to avoid the known `.next/types` race between
Next build/type generation and TypeScript.

Added root `ARCHITECTURE.md` with the final collaboration architecture and
updated `docs/exec-plans/quality-commands.md` plus `apps/server/README.md` so
future agents and developers can find the backend, web app, room route contract,
identity/session model, status/recovery behavior, validation commands, tldraw
sync compatibility, and process-local storage limits.

## Behavior Scenario Evidence
- Run documented server and web checks: `docs/exec-plans/quality-commands.md`
  now lists backend test/typecheck/build/smoke, web unit/typecheck/build/E2E,
  web recovery smoke, and root `pnpm check`. Root `package.json` now wires
  `check`, `build`, `test`, and `typecheck` across both packages.
- Validate a full local collaboration flow: `pnpm check` ran
  `pnpm --filter @production-spec-graph/web test:e2e`, which starts server and
  web, opens route-backed rooms, verifies two-context edit sync, validates
  invalid routes, confirms status/share UI, and checks same-device multi-tab
  diagnostics.
- Validate backend service behavior: `pnpm check` ran server smoke and reported
  `ok: true`, `/health`, `/ready`, `/sync/:roomId?sessionId=:sessionId`, one
  in-memory room `alpha`, and `storage: "process-local-memory"`. Direct
  `curl` checks against the local backend also returned healthy `/health` and
  `/ready` JSON with `durable: false`.
- Validate client route, identity, status, and failure behavior: `pnpm check`
  ran web E2E plus `test:recovery`. Recovery smoke passed for backend
  unavailable before connect and backend stop/restart after connect.
- Inspect final collaboration architecture docs: root `ARCHITECTURE.md`
  documents `apps/server`, `apps/web`, raw WebSocket sync, route-backed rooms,
  device/session identity, compact status/recovery, validation commands, and
  deferred production concerns.
- Confirm package/API compatibility: docs and this build log record
  `tldraw@5.0.1`, `@tldraw/sync@5.0.1`, and `@tldraw/sync-core@5.0.1`.

## TDD Decision
Strict TDD was skipped as approved in the contract because F5 is documentation,
root script wiring, and final runtime validation. No new deterministic helper
logic was introduced. Correctness evidence comes from executable validation and
manual document inspection.

## tldraw Sync Compatibility Notes
- Official tldraw sync docs at `https://tldraw.dev/docs/sync` were consulted on
  2026-06-01.
- The implemented client follows the documented `@tldraw/sync` `useSync` shape.
- The implemented backend follows the documented `@tldraw/sync-core`
  `TLSocketRoom` shape with explicit `InMemorySyncStorage`.
- `InMemorySyncStorage` is process-local and non-durable; docs state that
  backend restarts clear room state and multi-process deployments split rooms.
- Installed package verification:
  - `pnpm --filter @production-spec-graph/web list tldraw @tldraw/sync --depth 0`:
    `tldraw 5.0.1`, `@tldraw/sync 5.0.1`.
  - `pnpm --filter @production-spec-graph/server list @tldraw/sync-core --depth 0`:
    `@tldraw/sync-core 5.0.1`.
- `useSync` appends its reserved connection params; the web app passes a
  route-backed `/sync/:roomId` URI and does not add its own custom session query.

## Validation
- `pnpm check`: PASS. Covered:
  - `pnpm --filter @production-spec-graph/server test`: PASS, 14 tests.
  - `pnpm --filter @production-spec-graph/server typecheck`: PASS.
  - `pnpm --filter @production-spec-graph/server build`: PASS.
  - `pnpm --filter @production-spec-graph/server smoke`: PASS, with `ok: true`,
    `/health`, `/ready`, `/sync/:roomId?sessionId=:sessionId`, room `alpha`, and
    `storage: "process-local-memory"`.
  - `pnpm --filter @production-spec-graph/web test:unit`: PASS, 37 tests.
  - `pnpm --filter @production-spec-graph/web typecheck`: PASS.
  - `pnpm --filter @production-spec-graph/web build`: PASS.
  - `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 4 tests.
  - `pnpm --filter @production-spec-graph/web test:recovery`: PASS,
    `sync recovery smoke: PASS`.
- `curl -fsS http://127.0.0.1:3001/health`: PASS, returned `ok: true`,
  `service: "@production-spec-graph/server"`, `storage:
  "process-local-memory"`, and `syncRoute: "/sync/:roomId"`.
- `curl -fsS http://127.0.0.1:3001/ready`: PASS, returned `ok: true`,
  `ready: true`, live room stats, `kind: "process-local-memory"`,
  `durable: false`, and a restart-clears-rooms note.
- Documentation inspection: PASS for root `ARCHITECTURE.md`,
  `docs/exec-plans/quality-commands.md`, and `apps/server/README.md`.

## Modularity Notes
- Root scripts are concise sequential orchestration only; package-specific
  behavior remains in `apps/server/package.json` and `apps/web/package.json`.
- `docs/exec-plans/quality-commands.md` is the future-agent checklist.
- `ARCHITECTURE.md` is high-level and durable; it describes implemented
  boundaries and explicitly separates deferred production work.
- `apps/server/README.md` now reflects the current web integration instead of
  stale future-sprint language.

## Human Checkpoint
Pause after Sprint 5 and before archiving the run.

Recommended final local inspection:

```sh
pnpm check
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/web dev
```

Inspect:
- `http://127.0.0.1:3000/` redirects to `/rooms/<safe-id>`.
- Opening the same room URL in a second browser profile shares tldraw edits.
- The status reaches `Backend sync`.
- `window.__PSG_SYNC__` points to
  `ws://127.0.0.1:3001/sync/<roomId>` and not `demo.tldraw.xyz`.
- Backend stop/restart surfaces reconnect/reset expectations and keeps the room
  route stable.
- `ARCHITECTURE.md` and `docs/exec-plans/quality-commands.md` match the current
  implementation.

Known limitations remain intentional: no auth, permissions, durable room
persistence, horizontal scaling, production asset storage, deployment work, or
custom participant roster beyond tldraw-supported identity/presence diagnostics.
