# Sprint 1 Build Log: Backend App Foundation and In-Memory Sync Endpoint

## Summary
Implemented F1 as a standalone backend workspace package at `apps/server`.
The package is independent from `apps/web` and provides a Fastify-based Node
service with HTTP health/readiness endpoints and a raw WebSocket tldraw sync
route.

The backend uses `@tldraw/sync-core@5.0.1`, `TLSocketRoom`, and explicit
`InMemorySyncStorage`. Each valid room id maps to one process-local room and
storage instance for the lifetime of the Node process.

## Behavior Scenario Evidence
- Start the backend service: implemented `apps/server/package.json` scripts
  `dev`, `build`, `typecheck`, `test`, and `smoke`; implemented
  `apps/server/src/main.ts` and `apps/server/src/http/app.ts`.
- Join a valid sync room: implemented `/sync/:roomId?sessionId=:sessionId`
  WebSocket route; runtime smoke connected two sessions to room `alpha` and
  observed one registry entry.
- Reject unsafe room input: implemented `room-id.ts` and route-level validation;
  unit/integration tests reject invalid room ids before registry creation.
- Enforce explicit origin policy: implemented `allowedOrigins` parsing and
  `isOriginAllowed`; absent origins are allowed for local smoke clients.
- Observe process-local storage limits: documented in `apps/server/README.md`
  and `/ready` response; storage is explicitly non-durable.

## TDD Evidence
- RED: added tests for room id validation, config parsing/origin policy, registry
  reuse/isolation/restart semantics, and server health/WebSocket behavior. The
  first server test run failed before implementation modules existed.
- GREEN: implemented `config.ts`, `room-id.ts`, `sync/room-registry.ts`,
  `sync/tldraw-sync.ts`, and `http/app.ts`; server tests now pass.
- REFACTOR: switched runtime scripts away from `tsx` after sandbox IPC issues
  and now build then run plain `node dist/...`; added nested dist ignore.

Package/API compatibility note:
`@tldraw/sync-core@5.0.1` exports `InMemorySyncStorage`, `TLSocketRoom`,
`WebSocketMinimal`, `TLSyncErrorCloseEventCode`, and
`TLSyncErrorCloseEventReason`. Earlier local 3.15.6 APIs did not expose
`InMemorySyncStorage`; the implementation now targets 5.0.1 explicitly for the
backend.

## Validation
- `pnpm --filter @production-spec-graph/server test`: PASS, 14 tests across
  `room-id`, `config`, `room-registry`, and Fastify app behavior.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS after escalation to
  allow local port binding. Verified `/health`, `/ready`, valid two-session
  same-room WebSocket connection, and invalid room rejection.
- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 7 tests.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS after Next build
  regenerated `.next/types`.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS after restoring the
  expected status labels in `CanvasShell`.
- `pnpm check`: PASS.

Observed dependency caveat:
`apps/web/package.json` now requests `tldraw: 5.0.1`, but
`pnpm --filter @production-spec-graph/web list tldraw --depth 0` still resolves
`tldraw 3.15.6` from the current lock/node_modules state. Sprint 1 does not wire
the web client to sync, so this does not block F1, but F2 should begin by
aligning the actual web tldraw install and adding `@tldraw/sync`.

## Modularity Notes
- `config.ts` owns host/port/route/origin parsing.
- `room-id.ts` owns room/session id validation.
- `sync/room-registry.ts` owns process-local room reuse and explicit
  `InMemorySyncStorage` creation.
- `sync/tldraw-sync.ts` owns the Fastify/ws to tldraw `WebSocketMinimal` adapter.
- `http/app.ts` owns Fastify app composition, health/readiness, and route
  registration.
- `main.ts` is only the process entrypoint.

## Human Checkpoint
Pause before F2 client work. Recommended local checks:

```sh
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
pnpm --filter @production-spec-graph/server build
pnpm --filter @production-spec-graph/server smoke
pnpm --filter @production-spec-graph/server dev
curl -fsS http://127.0.0.1:3001/health
curl -fsS http://127.0.0.1:3001/ready
```

Inspect that the backend starts independently from `apps/web`, reports
process-local in-memory storage, exposes `/sync/:roomId`, and rejects invalid
room ids before creating room state.

## Round 2 Revision
Evaluator found the original `test` script only executed nested tests and missed
top-level `src/config.test.ts` and `src/room-id.test.ts`. The script now uses
Vitest's default include via `vitest run`, and the corrected command runs 4 test
files / 14 tests.

Round 2 validation:
- `pnpm --filter @production-spec-graph/server test`: PASS, 14 tests.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS.
