# Production Spec Graph Architecture

## Current Shape

Production Spec Graph is a tldraw-first collaborative canvas. The tldraw editor
store is the shared document source of truth, and collaboration runs through a
dedicated Node backend app in this monorepo.

The implemented workspace packages are:

| Package | Role |
| --- | --- |
| `packages/shared` | Zod-backed shared TypeScript contracts for AI input-side room context, canvas snapshots, operation events, and freshness metadata. |
| `apps/mate` | Room-aware AI coworker boundary that ingests shared canvas context feeds, separates observation from interpretation, detects stale context, and returns deterministic non-mutating suggestions/questions for local validation. |
| `apps/web` | Next.js app that renders the full-screen tldraw canvas, owns route-backed room entry, creates stable browser/device identity, connects to the sync backend with `@tldraw/sync@5.0.1`, publishes room context, and exposes a minimal raw AI message/result surface. |
| `apps/server` | Fastify Node service that exposes health/readiness endpoints, room context endpoints, room mate message endpoints, and a raw WebSocket tldraw sync route using `@tldraw/sync-core@5.0.1`. |

## Collaboration Flow

1. A user opens `apps/web`.
2. `/` creates a safe room id and redirects to `/rooms/:roomId`.
3. `/rooms/:roomId` validates the route room id before mounting tldraw.
4. `CanvasShell` creates or reuses an opaque browser/device id from local
   storage and creates a fresh per-tab session id.
5. The web app builds a WebSocket room URI from
   `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` and the validated route room id.
6. `useSync` from `@tldraw/sync@5.0.1` creates the remote tldraw store.
7. The backend accepts raw WebSocket connections at `/sync/:roomId`.
8. The backend room registry maps each valid room id to one in-process
   `TLSocketRoom` plus one explicit `InMemorySyncStorage`.
9. Two clients with the same `/rooms/:roomId` URL share tldraw document edits
   through the dedicated backend.

Invalid, empty, oversized, or unsafe room ids are rejected before the web app
builds a sync URI and before the backend creates a room.

## Backend

`apps/server` is a standalone Fastify app. It does not depend on `apps/web` to
start or pass health checks.

Default local endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET http://127.0.0.1:3001/health` | Liveness and service metadata. |
| `GET http://127.0.0.1:3001/ready` | Readiness, room stats, room-scoped agent lifecycle diagnostics, and storage durability diagnostics. |
| `GET http://127.0.0.1:3001/rooms/:roomId/context` | Process-local room context feed diagnostics for the latest canvas snapshot, recent operation events, and freshness metadata. |
| `POST http://127.0.0.1:3001/rooms/:roomId/context/snapshot` | Accepts a Zod-validated compact canvas snapshot for the room. |
| `POST http://127.0.0.1:3001/rooms/:roomId/context/events` | Accepts Zod-validated normalized user operation events for the room. |
| `GET http://127.0.0.1:3001/rooms/:roomId/mate` | Returns the latest raw mate turn response for the room, if one exists. |
| `POST http://127.0.0.1:3001/rooms/:roomId/mate/messages` | Accepts a room-scoped user message, reads the latest context feed, invokes deterministic `apps/mate`, and returns raw structured mate result data. |
| `ws://127.0.0.1:3001/sync/:roomId` | Raw tldraw sync WebSocket route. |

Backend configuration:

| Variable | Default |
| --- | --- |
| `HOST` | `127.0.0.1` |
| `PORT` | `3001` |
| `SYNC_ROUTE` | `/sync` |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:3000,http://127.0.0.1:3100,http://localhost:3000,http://localhost:3100` |

The backend deliberately uses raw WebSockets, not Socket.IO. This matches
tldraw sync expectations and avoids adding a protocol layer incompatible with
`useSync`.

The backend also owns the first room-scoped AI coworker lifecycle boundary. When
a valid sync room is initialized, the room registry requests a corresponding
`mate` lifecycle record and exposes it through `/ready` under
`agentLifecycle`. In the current MVP this lifecycle is diagnostic-only and
defaults to an unavailable degraded state when no `mate` adapter is configured;
normal tldraw sync remains usable even when the AI coworker is unavailable.

Room context ingestion is also process-local. The web app can publish compact
tldraw-derived snapshots and normalized operation events to the backend context
endpoints. These payloads use `@production-spec-graph/shared` Zod schemas so
web, server, and future `apps/mate` ingestion share one input-side contract.
This context feed is factual input for future AI reasoning; it deliberately does
not define AI outputs, suggestions, action proposals, or autonomous canvas
mutations.

## Mate App

`apps/mate` owns the first room-aware AI coworker ingestion boundary. It imports
the shared F2 room context feed contract, validates a mate turn request, and
builds a deterministic turn result from:

- latest canvas snapshot facts
- recent normalized operation events
- optional user chat text
- freshness metadata
- bounded process-local room memory

Mate turn results keep raw observations separate from inferred intent and
uncertainty. They carry the snapshot/event freshness used for the turn and mark
the result stale when events advanced after the snapshot. Current output is
uses the shared `agent-output.v1` protocol. Current output can be a
non-mutating suggestion/question or a typed canvas action proposal. Proposals are
data only: they carry bounded action fields, freshness metadata,
`requiresAcceptance: true`, and are never applied automatically.

The local smoke command is credential-free:

```sh
pnpm --filter mate smoke
```

It constructs a sample room context feed and validates that mate reads canvas
facts, preserves freshness/staleness, and returns only a non-mutating result.

## Raw AI Interaction Path

The first interactive AI path is intentionally logic-first:

1. Web publishes the current room snapshot and a chat-boundary operation event.
2. Web posts the user message to
   `POST /rooms/:roomId/mate/messages` with browser/device/session metadata.
3. Server validates the message, reads the latest room context feed, adds agent
   lifecycle correlation when available, and invokes the deterministic mate
   turn boundary.
4. Server returns a raw response envelope containing room id, message metadata,
   context freshness, and the mate turn result.
5. Web renders that raw structured data in a small secondary panel.

This path proves the current conversation/data flow without committing to final
chat UI design.

## Agent Output And Proposal Safety

The shared package defines `agent-output.v1` for:

- text suggestions
- questions
- safe canvas action proposals

The only current proposed action is `create-text-note`, represented as bounded
data with `mutatesCanvas: true`. Delivery of the proposal itself is still
non-mutating. Server validation reports proposal state in `outputValidation`,
including `applied: false`. Stale proposals are blocked using context freshness,
and malformed outputs are rejected before being stored as the latest room
response.

No tldraw action executor exists yet. Web renders proposal state as raw JSON in
the secondary `Mate raw` panel.

## Web App

`apps/web` is the first-screen user experience. It renders the actual editable
tldraw canvas rather than a landing page.

Important routes:

| Route | Behavior |
| --- | --- |
| `/` | Generates a safe unique room id and redirects to `/rooms/:roomId`. |
| `/rooms/:roomId` | Validates and joins the exact room id, or renders an explicit invalid-room state. |

Required web configuration:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` | Explicit backend base URL, for example `http://127.0.0.1:3001`. The app rejects missing, invalid, or hosted demo sync URLs. |

The web client does not use `NEXT_PUBLIC_PSG_SYNC_ROOM_ID`. Room identity comes
from the validated route only.

## Identity And Presence

The browser/device id is:

- opaque and random
- stored in local storage for the same browser profile
- not derived from personal data
- reused across reloads

Each tab creates an independent live session id. Multiple tabs in one browser
profile share the same device id but have distinct session diagnostics.

The app configures a tldraw `TLUserStore` using supported tldraw 5.0.1 APIs so
clients get stable identity cues such as `Device XXXX` and deterministic colors.
The web app exposes a developer-facing room context runtime hook for local
validation of snapshot/event publishing. Future user-facing AI participation
should enter through the room-scoped server and mate boundaries, not hidden
front-end editor access.

The current AI surface is a minimal raw-data panel in the room canvas. It is
secondary to the tldraw workspace and exists to validate the web -> server ->
mate -> web path before product styling.

## Status And Recovery

The web UI shows compact collaboration status in the top bar:

- `Connecting sync`
- `Backend sync`
- `Sync reconnecting`
- `Backend unavailable`
- `Local sync cache`
- `Sync error`
- `Sync configuration error`

Backend unavailable and backend restart behavior is recoverable from the UI.
Because the backend storage is process-local, a restart may reset room state.
The app keeps the same route and configured backend URI; it does not silently
switch to tldraw's hosted demo server.

## tldraw Sync Compatibility

Implemented package versions:

| Package | Version | Usage |
| --- | --- | --- |
| `tldraw` | `5.0.1` | Editor, store types, `TLUserStore`, user records, collaborator APIs. |
| `@tldraw/sync` | `5.0.1` | Client `useSync` hook for WebSocket-backed collaborative stores. |
| `@tldraw/sync-core` | `5.0.1` | Backend `TLSocketRoom`, `InMemorySyncStorage`, socket primitives, and sync close codes. |

The official tldraw sync documentation consulted on June 1, 2026 describes the
same shape used here: client-side `useSync`, server-side `TLSocketRoom`, and
`InMemorySyncStorage` for simple Node examples. It also notes that production
systems need persistent/scalable storage approaches and compatible client/server
package versions.

Compatibility notes from implementation:

- `useSync` automatically appends reserved connection query parameters such as
  `sessionId` and `storeId`; the web app passes `/sync/:roomId` and does not
  append its own custom session query.
- `InMemorySyncStorage` is explicit and process-local in the backend registry.
- Client and server tldraw packages are pinned to `5.0.1` to avoid mixed sync
  protocol versions.

## Non-Durable Storage Limits

The current backend storage is intentionally not durable:

- restarting `apps/server` clears in-memory rooms
- running multiple backend processes splits room state
- there is no authentication or access control
- there is no production asset store
- media-heavy workflows may need real asset storage before production use

These are accepted limitations for this collaboration phase, not hidden
production guarantees.

## Validation

Use the root quality gate before handoff:

```sh
pnpm check
```

This runs backend tests, backend typecheck/build/smoke, web unit tests, web
typecheck/build, integrated Playwright E2E, and backend recovery smoke
sequentially.

Focused commands:

```sh
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/server smoke
pnpm --filter mate smoke
pnpm --filter @production-spec-graph/web dev
pnpm --filter @production-spec-graph/web test:e2e
pnpm --filter @production-spec-graph/web test:recovery
```

Manual local inspection:

1. Start backend and web dev servers.
2. Open `http://127.0.0.1:3000/`.
3. Confirm it redirects to `/rooms/<safe-id>`.
4. Open that room URL in another browser profile/context.
5. Create a simple tldraw shape and verify it appears in both clients.
6. Stop/restart the backend and confirm reconnect/reset status appears without
   leaving the room route.

## Deferred Production Work

The following are intentionally outside the current implementation:

- auth, authorization, permissions, accounts, or invite links
- durable room persistence
- horizontal scaling or multi-process room coordination
- Cloudflare Durable Objects, SQLite, managed database, or production hosting
- custom production asset storage
- custom participant roster beyond tldraw-supported identity/presence cues
