# Sprint 1 Contract: Backend App Foundation and In-Memory Sync Endpoint

## Feature
F1: Backend App Foundation and In-Memory Sync Endpoint

## Scope
Create a standalone backend workspace package under `apps/server` that runs independently from `apps/web`. The backend will use a mature Node/TypeScript service shape with Fastify and raw WebSocket support via `@fastify/websocket`, unless implementation-time package/API verification proves a different raw WebSocket adapter is required for current tldraw compatibility.

This sprint includes explicit configuration parsing, health/readiness HTTP endpoints, room id validation, allowed-origin checks, a raw WebSocket sync route, and a process-local in-memory room registry that creates one tldraw sync room per valid room id. The intended tldraw server shape is `@tldraw/sync-core` with `TLSocketRoom` and `InMemorySyncStorage`; exact APIs and package versions must be validated during implementation before final wiring.

## Out of Scope
No `apps/web` client sync integration, `useSync` wiring, device identity, route-driven room creation, room URL behavior, visible collaboration status, presence UI, authentication, authorization, persistence, production deployment, multi-process coordination, database storage, asset storage, or root quality-command updates are part of this sprint.

This sprint must not introduce Socket.IO protocol semantics or a custom graph protocol as the collaboration transport.

## Behavior Scenarios
- Scenario: Start the backend service
  - Given repository dependencies are installed
  - When a developer runs the backend package's documented dev command
  - Then a Node backend service starts on the configured host and port
  - And health/readiness endpoints return deterministic healthy responses without requiring `apps/web`

- Scenario: Join a valid sync room
  - Given the backend service is running
  - When a raw WebSocket client connects to the configured sync endpoint with a valid room id and session identity
  - Then the backend validates the request and attaches the connection to that room's tldraw sync server
  - And a later client using the same room id attaches to the same process-local room instance

- Scenario: Reject unsafe room input
  - Given a client requests the sync endpoint with an empty, oversized, malformed, path-like, or otherwise unsafe room id
  - When the backend receives the request
  - Then the request is rejected before creating a sync room
  - And the unvalidated room id is not used as a registry key or sync state identifier

- Scenario: Enforce explicit origin policy
  - Given the backend is configured with an explicit allowed-origin list
  - When a browser WebSocket request includes an `Origin` header
  - Then only exact configured origins are accepted
  - And absent origins remain allowed for local non-browser smoke clients and tests

- Scenario: Observe process-local storage limits
  - Given a room has active in-memory tldraw state
  - When the backend process restarts
  - Then the room state is not expected to survive
  - And this limitation is visible in backend documentation or runtime developer-facing diagnostics

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-1.1 | A dedicated backend workspace package exists under `apps/server` with clear app entrypoints and separate boundaries for configuration, HTTP health/readiness, WebSocket sync routing, and room registry behavior. | Inspect package/file boundaries and run `pnpm --filter @production-spec-graph/server typecheck`. |
| AC-1.2 | The backend package provides `dev`, `build`, `typecheck`, and `test` scripts, with host, port, allowed origin, and sync route settings controlled through explicit configuration boundaries. | Run `pnpm --filter @production-spec-graph/server test`, `pnpm --filter @production-spec-graph/server typecheck`, and `pnpm --filter @production-spec-graph/server build`; focused config tests must cover defaults, overrides, invalid port/config rejection, sync route defaulting, and allowed-origin parsing. |
| AC-1.3 | Health/readiness endpoints can be checked independently from the web app and report deterministic healthy responses in local development. | Start the backend with `pnpm --filter @production-spec-graph/server dev`, then run `curl -fsS http://127.0.0.1:3001/health` and `curl -fsS http://127.0.0.1:3001/ready`; automated HTTP tests should assert stable response shape. |
| AC-1.4 | The sync endpoint is raw WebSocket-compatible with tldraw sync, uses `TLSocketRoom` plus `InMemorySyncStorage` where package compatibility permits, keeps one room instance per valid room id per process, and does not use Socket.IO protocol semantics. | Run focused room-registry tests plus a runtime WebSocket upgrade smoke against the running backend; implementation notes must record verified `@tldraw/sync-core` APIs/versions and any justified adapter deviation. |
| AC-1.5 | Backend tests or runtime smoke checks cover health/readiness, valid WebSocket upgrade, invalid room id rejection, two sessions joining the same room id, and the documented process-local storage caveat. | Run `pnpm --filter @production-spec-graph/server test` and the runtime smoke command documented by the implementation; verify invalid room attempts fail without registry creation and two valid sessions share one in-process room. |

## Test Strategy

### TDD Decision
Use TDD: Yes, for deterministic backend logic.

Rationale:
- Room id validation, config defaults/parsing, allowed-origin logic, and process-local registry semantics are deterministic and should be specified with focused tests before implementation.
- Fastify plugin wiring, WebSocket upgrade behavior, and `@tldraw/sync-core` API wiring depend on framework/package behavior, so strict TDD is less useful there; those parts will be validated with typecheck, integration tests, and runtime smoke checks.

Planned evidence:
- RED: add failing tests first for `src/room-id.test.ts`, `src/config.test.ts`, and `src/sync/room-registry.test.ts`.
- GREEN: implement `src/room-id.ts`, `src/config.ts`, and `src/sync/room-registry.ts` until the focused tests pass.
- REFACTOR: clean up module boundaries and naming while keeping the focused tests green.
- Integration/runtime checks: add HTTP/WebSocket tests or smoke scripts after the deterministic core exists, then verify package/framework behavior without claiming those checks are strict TDD.

### E2E / Runtime Verification
Final verification must be executable and should include:
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/server typecheck`
- `pnpm --filter @production-spec-graph/server build`
- start the backend with `pnpm --filter @production-spec-graph/server dev`
- `curl -fsS http://127.0.0.1:3001/health`
- `curl -fsS http://127.0.0.1:3001/ready`
- a WebSocket smoke check that connects to a valid room/session, confirms upgrade/attachment does not fail, connects a second session to the same room id, and verifies an invalid room id is rejected

True end-to-end tldraw document collaboration is not practical in Sprint 1 because `apps/web` is not connected to the backend until F2. The fallback runtime check is sufficient for this sprint because F1 only promises the backend service, raw WebSocket sync endpoint, validation, and in-process room registry foundation.

## Modularity & Readability Plan
Expected files:
- `apps/server/package.json` for workspace package metadata and scripts.
- `apps/server/tsconfig.json` and any build-specific TypeScript config needed by the package.
- `apps/server/src/main.ts` or equivalent process entrypoint.
- `apps/server/src/config.ts` for environment parsing, defaults, allowed origins, and sync route config.
- `apps/server/src/room-id.ts` for room id validation and normalization decisions.
- `apps/server/src/sync/room-registry.ts` for process-local one-room-per-id semantics.
- `apps/server/src/sync/tldraw-sync.ts` for the smallest possible tldraw sync adapter boundary.
- `apps/server/src/http/server.ts` or `apps/server/src/http/app.ts` for Fastify app construction, health/readiness routes, and WebSocket route registration.
- Focused tests near the modules they document, such as `*.test.ts`.
- `apps/server/README.md` or equivalent backend docs for local commands, environment variables, health/readiness checks, sync endpoint shape, and process-local storage limitations.

Keep validation logic outside the HTTP route handlers so it remains independently testable. Keep tldraw package wiring isolated in `tldraw-sync.ts` so API compatibility changes do not spread through the service. Avoid broad helper modules and oversized files; tests should document the non-obvious constraints around room ids, allowed origins, and process-local storage.

## Human Checkpoint
Yes. Sprint 1 creates a locally runnable backend service that should pause for manual validation before client integration begins.

Recommended commands after implementation:
- `pnpm install` if new dependencies were added and the lockfile changed
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/server typecheck`
- `pnpm --filter @production-spec-graph/server build`
- `pnpm --filter @production-spec-graph/server dev`
- `curl -fsS http://127.0.0.1:3001/health`
- `curl -fsS http://127.0.0.1:3001/ready`
- run the documented WebSocket smoke command for valid room connection, two-session same-room attachment, and invalid room rejection

Inspect that the backend starts without `apps/web`, health/readiness responses are deterministic, invalid room ids are rejected before registry creation, and backend docs clearly state that room data is process-local and non-durable.

## Technical Approach (brief)
Add `apps/server` as a pnpm workspace package using TypeScript, Fastify, and `@fastify/websocket`. Define deterministic config, origin, and room-id modules first, then wire a Fastify app that exposes health/readiness and registers the raw WebSocket sync endpoint. Implement a process-local registry that lazily creates one tldraw sync room per valid room id and isolates the exact `@tldraw/sync-core` API calls behind a small adapter. Document local operation and the in-memory storage caveat in the backend package.

## Dependencies
No prior sprint feature is required.

Expected package dependencies include `fastify`, `@fastify/websocket`, and `@tldraw/sync-core`. `ws` or an equivalent WebSocket package should be added only if required for the server adapter or runtime smoke tests. Expected development dependencies include `typescript`, `tsx`, `vitest`, `@types/node`, and `@types/ws` if `ws` is used.

Package/API versions must be verified during implementation, especially compatibility between the existing `tldraw` version in `apps/web` and the chosen `@tldraw/sync-core` version.

## Estimated Complexity
M
