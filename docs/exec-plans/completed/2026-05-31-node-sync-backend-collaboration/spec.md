# Spec: Dedicated Node Sync Backend Collaboration

## Background
The current product direction is tldraw-first: the tldraw editor, document store, and future sync/presence layer are the source of truth for the shared workspace. The previous active MVP only left collaboration as readiness work; this run replaces that with a real collaboration slice built around tldraw sync.

The corrected requirement is to add a mature standalone Node backend application under `apps/`, alongside the existing `apps/web` Next.js application. The backend should host the tldraw WebSocket sync server, use process-local `InMemorySyncStorage` for this phase, and expose a backend shape that can grow into a serious service rather than a helper script inside the web app.

This spec aligns with the official tldraw sync guidance at https://tldraw.dev/docs/sync: the client should use `useSync` from `@tldraw/sync`, the server should use compatible `@tldraw/sync-core` primitives such as `TLSocketRoom` and `InMemorySyncStorage`, and implementation must verify exact package APIs during the sprint rather than relying on undocumented internals.

## Goals
1. Add a dedicated Node backend app under `apps/` that is a first-class monorepo workspace package, not a script inside `apps/web`.
2. Provide a raw WebSocket-compatible tldraw sync endpoint backed by per-room `TLSocketRoom` instances and process-local `InMemorySyncStorage`.
3. Connect the existing web client to the backend through tldraw sync so multiple browsers/devices can collaborate in the same room.
4. Give every browser/device a stable privacy-safe device identity and ensure each tab/session can act as an independent collaboration client.
5. Make room entry route-driven: join an existing room when the route contains a valid room id, otherwise create a room route and enter it.
6. Add observable status, presence, and failure recovery behavior so collaboration is understandable during development.
7. Update repository quality commands and verification docs so server and integrated collaboration checks are part of future handoffs.

## Non-Goals
1. No durable persistence is required in this phase; `InMemorySyncStorage` process-local behavior is intentional and must be documented.
2. No authentication, authorization, account system, permissions model, invite system, or room access control is required.
3. No production deployment, horizontal scaling, Durable Objects, SQLite persistence, managed database, or cloud infrastructure work is required.
4. No media asset storage backend is required beyond whatever baseline behavior is already available; production-grade asset upload/download is deferred.
5. No AI coworker, agent actions, prompt execution, chat UI, or autonomous edits are required.
6. No custom flowchart graph protocol should be reintroduced as the collaboration source of truth.
7. No Socket.IO-style protocol abstraction should be introduced for the tldraw sync connection, because tldraw sync expects a raw WebSocket-compatible endpoint.

## Product/Engineering Approach
The backend should be planned as a mature Node service package. The recommended direction is Fastify with `@fastify/websocket`: Fastify is a mainstream Node framework with strong TypeScript ergonomics, clear plugin/module boundaries, health endpoints, testability, and raw WebSocket support. This fits tldraw sync better than a Socket.IO-style abstraction. NestJS is mature, but its default WebSocket gateway patterns can bias implementation toward higher-level protocols that may not match the raw WebSocket endpoint tldraw sync expects; it can be reconsidered only if the sprint contract documents a compatibility reason and preserves raw WebSocket behavior.

The backend should expose clean boundaries for app entrypoints, configuration, health/readiness endpoints, WebSocket sync routing, room registry management, and server tests. The room registry should guarantee one active sync room per room id within the running Node process. Because storage is in memory, restarting the process or running multiple server processes is expected to lose or split room state; this is a known limitation, not a defect for this phase.

The web app should remain tldraw-first. The collaborative store should be created through `useSync` and passed into the tldraw editor surface. The app should not use tldraw's hosted demo server for this run. Device identity should be opaque, stable for a browser/device across reloads, and not derived from personal data. Route state should be the user's room contract: a valid room id joins that room, and no room id creates a shareable room route.

Each sprint should produce an inspectable vertical slice. Backend-only work must have health/WebSocket smoke checks. Client work must have browser-visible collaboration behavior. Final validation should include at least two independent clients joining the same room and observing shared tldraw document changes.

## Feature List

### F1: Backend App Foundation and In-Memory Sync Endpoint
Create a standalone Node backend application under `apps/` as a mature monorepo package. It should expose health/readiness HTTP endpoints and a raw WebSocket tldraw sync endpoint backed by a process-local room registry, with one `TLSocketRoom` plus `InMemorySyncStorage` per valid room id.

**Behavior Scenarios:**
- Scenario: Start the backend service
  - Given the repository dependencies are installed
  - When a developer runs the backend package's documented dev command
  - Then a Node backend service starts on a configured host and port
  - And its health/readiness endpoint returns an observable healthy response without requiring the web app
- Scenario: Join a valid sync room
  - Given the backend service is running
  - When a raw WebSocket client connects to the tldraw sync endpoint with a valid room id and session identity
  - Then the backend attaches the connection to that room's sync server
  - And later clients using the same room id attach to the same in-process room instance
- Scenario: Reject unsafe room input
  - Given a client requests a sync endpoint with an empty, oversized, malformed, or unsafe room id
  - When the backend receives the request
  - Then the request is rejected before creating a sync room
  - And no unvalidated room id is used in logs, registry keys, or sync state
- Scenario: Observe process-local storage limits
  - Given a room has active in-memory tldraw state
  - When the backend process restarts
  - Then the room state is not expected to survive
  - And this limitation is visible in backend docs or runtime developer-facing diagnostics

**Acceptance Criteria:**
- AC-1.1: A dedicated backend workspace package exists under `apps/` with clear app entrypoints and separate boundaries for configuration, HTTP health/readiness, WebSocket sync routing, and room registry behavior.
- AC-1.2: The backend package provides `dev`, `build`, `typecheck`, and `test` scripts, with host, port, allowed origin, and sync route settings controlled through explicit configuration boundaries.
- AC-1.3: Health/readiness endpoints can be checked independently from the web app and report a deterministic healthy response in local development.
- AC-1.4: The sync endpoint is raw WebSocket-compatible with tldraw sync, uses `TLSocketRoom` plus `InMemorySyncStorage` where package compatibility permits, keeps one room instance per valid room id per process, and does not use Socket.IO protocol semantics.
- AC-1.5: Backend tests or runtime smoke checks cover health/readiness, valid WebSocket upgrade, invalid room id rejection, two sessions joining the same room id, and the documented process-local storage caveat.

**Priority:** P0 (must-have)
**Status:** Pending
**Dependencies:** None

### F2: Web Client Sync Store and Stable Device Identity
Connect `apps/web` to the dedicated backend through tldraw sync. Each browser/device should receive a stable opaque device id and use the synchronized tldraw store as the collaboration source of truth, while preserving the existing full-screen editable canvas shell.

**Behavior Scenarios:**
- Scenario: Create a stable device identity
  - Given a browser opens the web app for the first time
  - When the app initializes collaboration state
  - Then it creates an opaque device id for that browser/device
  - And the same id is reused after reloads in the same browser profile
- Scenario: Connect the tldraw editor to backend sync
  - Given the web app has a valid room id and backend sync URL
  - When the tldraw canvas mounts
  - Then the app creates a synchronized store through tldraw sync
  - And the editor remains editable while using the backend room as its shared document source
- Scenario: Share edits between clients
  - Given two independent browsers or devices join the same valid room
  - When one client creates, edits, or deletes a tldraw shape
  - Then the other client observes the document change through sync
  - And both clients remain in the same room without relying on a hosted demo server
- Scenario: Handle missing backend configuration
  - Given the web app cannot determine a valid backend sync URL
  - When a user enters a room route
  - Then the app does not silently connect to the wrong service
  - And it exposes a recoverable sync configuration/status problem

**Acceptance Criteria:**
- AC-2.1: The web app uses `useSync` from `@tldraw/sync` or the compatible current tldraw sync client API to create the tldraw store for collaborative rooms.
- AC-2.2: Device identity is stable across reloads for the same browser/device, differs across independent browser profiles/devices, is opaque/random, and is not derived from personal data.
- AC-2.3: Backend sync URL and protocol selection are configuration-driven for local and future deployed environments, with no dependency on tldraw's hosted demo sync server.
- AC-2.4: The existing tldraw canvas remains the first-screen editable experience while connected to the synchronized store, including loading and error states that avoid a blank page.
- AC-2.5: Focused tests or browser runtime checks verify device id persistence, sync store configuration, and document sharing between at least two clients in the same room.

**Priority:** P0 (must-have)
**Status:** Pending
**Dependencies:** F1

### F3: Route-Driven Room Creation and Joining
Make room routing the entry contract for collaboration. On app entry, a valid room id in the route should join that room. If no room id is present, the app should create a safe room id, update to a canonical room route, and enter it without creating navigation loops.

**Behavior Scenarios:**
- Scenario: Enter without a room id
  - Given a user opens the app at an entry route with no room id
  - When the app initializes
  - Then it creates a safe unique room id
  - And the browser lands on a canonical shareable route for that room before joining sync
- Scenario: Join from a shared room route
  - Given a user opens a URL containing a valid existing room id
  - When the app initializes
  - Then it joins that room id instead of creating a new one
  - And a second client opening the same URL joins the same collaborative document
- Scenario: Recover from an invalid room route
  - Given a user opens a URL containing an invalid, unsafe, or unsupported room id
  - When the app validates the route
  - Then it does not send the unsafe id to the backend
  - And the user reaches a valid recoverable room state or explicit invalid-room state
- Scenario: Preserve room intent across browser actions
  - Given a user is inside a valid room route
  - When the user reloads, opens the URL in another tab, or uses browser back/forward navigation
  - Then the app preserves the intended room behavior
  - And it does not repeatedly create new rooms for the same entry action

**Acceptance Criteria:**
- AC-3.1: App entry without a room id generates a safe unique room id and navigates to a canonical room route before connecting to backend sync.
- AC-3.2: App entry with a valid room id joins that exact room and preserves the URL across reloads and shared links.
- AC-3.3: Invalid, oversized, or unsafe room ids are validated client-side and never sent to the backend as sync room identifiers.
- AC-3.4: Reload, multi-tab open, and back/forward navigation do not create duplicate room-generation loops or disconnect the user from the intended room.
- AC-3.5: E2E or browser runtime checks cover no-room creation, valid-room joining, invalid-room recovery, reload behavior, and link sharing between two clients.

**Priority:** P0 (must-have)
**Status:** Pending
**Dependencies:** F2

### F4: Presence, Status, Multi-Tab Behavior, and Failure Recovery
Make collaboration understandable to users and developers. The web app should expose compact sync status, collaborator presence where supported by tldraw sync, safe share affordances, multi-tab behavior that avoids session collisions, and clear recovery behavior when the backend is unavailable or restarted.

**Behavior Scenarios:**
- Scenario: See collaboration status
  - Given a user is in a collaborative room
  - When the sync client is connecting, synced, reconnecting, or in an error state
  - Then the app exposes a compact status that matches the current state
  - And the canvas remains visually coherent during each state
- Scenario: Distinguish collaborators
  - Given two clients join the same room
  - When both clients interact with the canvas
  - Then collaborator presence or identity cues distinguish the participants where tldraw sync supports it
  - And a browser/device keeps a stable identity cue across reloads
- Scenario: Use multiple tabs on one device
  - Given a browser/device already has a stable device id
  - When the same room is opened in multiple tabs
  - Then each tab behaves as an independent collaboration client session
  - And the tabs do not overwrite each other's live session state or collapse into one visible participant incorrectly
- Scenario: Recover from backend interruption
  - Given clients are connected to an in-memory backend room
  - When the backend becomes unavailable or restarts
  - Then clients surface disconnect/reconnect or data-reset behavior without crashing
  - And the user/developer can tell that process-local storage may have lost room state

**Acceptance Criteria:**
- AC-4.1: The web UI exposes compact collaboration status for connecting, synced, reconnecting/disconnected, and error states without covering or breaking the tldraw canvas.
- AC-4.2: Presence or collaborator identity is configured so independent clients can be distinguished, and the same browser/device keeps stable identity cues across reloads where the tldraw API supports it.
- AC-4.3: Multi-tab use in the same browser/device creates independent collaboration sessions while preserving the stable device id, with no session-id collision or shared mutable tab state.
- AC-4.4: Backend unavailable and backend restart scenarios produce recoverable UI behavior and documented expectations for possible in-memory room reset.
- AC-4.5: Browser/runtime checks cover two-client presence/status, same-device multi-tab behavior, backend-down connection failure, and reconnect or reset after backend restart.

**Priority:** P1 (should-have)
**Status:** Pending
**Dependencies:** F3

### F5: Integrated Verification, Developer Docs, and Quality Commands
Finish the collaboration run by making it repeatable for future Generator and Evaluator phases. Repository quality commands must include the new server checks, integrated collaboration validation, and documentation for local development, environment variables, known in-memory limits, and official tldraw sync compatibility notes.

**Behavior Scenarios:**
- Scenario: Run documented server and web checks
  - Given a developer reads the repository quality commands
  - When they follow the required commands for this run
  - Then they can validate backend tests, backend typecheck/build, web checks, and integrated collaboration behavior
  - And the quality command list is no longer web-only
- Scenario: Validate a full local collaboration flow
  - Given the backend and web app are running locally
  - When two independent browser contexts open the same room route
  - Then they can observe shared tldraw document changes through the dedicated backend
  - And the result is recorded through automated evidence or a precise manual fallback if timing makes full automation unreliable
- Scenario: Inspect service configuration docs
  - Given a developer wants to run or debug collaboration locally
  - When they inspect the docs for this run or repository quality docs
  - Then they can find ports, environment variables, backend URL expectations, health endpoint checks, and room route behavior
  - And the docs state that storage is process-local and non-durable
- Scenario: Confirm package/API compatibility
  - Given tldraw sync APIs may change across versions
  - When the final sprint is evaluated
  - Then the implemented client and server package versions are recorded as compatible
  - And any deviations from the planned `useSync`, `TLSocketRoom`, or `InMemorySyncStorage` APIs are documented with rationale

**Acceptance Criteria:**
- AC-5.1: `docs/exec-plans/quality-commands.md` includes required backend `dev`/runtime, `build`, `typecheck`, and `test` commands, plus web and integrated collaboration checks.
- AC-5.2: Developer docs or active run artifacts document local startup order, expected ports, environment variables, room URL examples, health checks, sync endpoint expectations, and the in-memory storage limitation.
- AC-5.3: Integrated validation demonstrates two independent clients joining the same route-backed room and observing shared tldraw changes through the dedicated backend.
- AC-5.4: Validation evidence covers backend health, WebSocket upgrade, room id validation, client route creation/join, device identity persistence, and failure/reconnect behavior.
- AC-5.5: Final handoff records the official tldraw sync docs consulted, package/API compatibility findings, and any accepted limitations or deferred production concerns.

**Priority:** P0 (must-have)
**Status:** Pending
**Dependencies:** F4

## Risks & Dependencies
1. `InMemorySyncStorage` is process-local and non-durable. Room data is lost on restart and split across multiple backend processes; this is acceptable only because persistence and scaling are non-goals for this phase.
2. tldraw sync package APIs and version compatibility can change. The implementation must verify current `@tldraw/sync`, `@tldraw/sync-core`, `TLSocketRoom`, `InMemorySyncStorage`, and `useSync` APIs against installed package versions.
3. tldraw recommends matching backend and client versions. If client and server packages diverge, users may fail to sync or see refresh-required behavior.
4. The backend framework must preserve raw WebSocket semantics. Introducing Socket.IO or another higher-level protocol could make the endpoint incompatible with tldraw sync.
5. Room ids can become injection, log pollution, or denial-of-service vectors if they are long, unsafe, or unbounded. Client and server validation are both required.
6. Device id storage creates privacy and tracking concerns. IDs must be opaque, local to the browser/device, and not derived from account, machine, or personal information.
7. Multi-tab behavior can confuse stable device identity with live session identity. Tabs need independent sessions while retaining a stable device-level identity.
8. CORS and WebSocket origin handling can block legitimate local development or allow unwanted origins if too loose. Allowed origins must be explicit and environment-aware.
9. E2E collaboration tests can be timing-sensitive because WebSocket connection, tldraw store loading, and canvas rendering are asynchronous. Tests need observable sync readiness or carefully bounded retries.
10. Media assets may not behave like production collaboration without a real asset store. This phase should focus on core document sync and document any asset limitations.
11. The existing quality command file is web-only. Future sprint contracts may under-validate backend work unless F5 updates it before handoff.

## Open Questions
1. Should the backend package be named `apps/server`, `apps/api`, or another repository-standard name?
2. What canonical room route should the web app use, such as `/rooms/:roomId`, `/r/:roomId`, or a query-param route?
3. What local development ports should be reserved for the backend and web app to avoid conflicts with the existing Next.js setup?
4. Should invalid room URLs silently create a new safe room, or should they show an explicit invalid-room recovery state first?
5. What collaborator display name/color policy should be used before real accounts exist?
6. Should the first phase include any server-side room introspection endpoint for tests and debugging, or keep room state observable only through health and WebSocket behavior?
7. Are media/image uploads expected in the first collaboration demo, or should the demo explicitly validate only shapes/text/strokes that sync through the document store?
8. Which origins should be allowed in local development and in any future deployed preview environment?

## Suggested Sprint Order
1. Sprint 1: F1 Backend App Foundation and In-Memory Sync Endpoint. This creates the standalone backend service and the raw WebSocket tldraw sync room foundation.
2. Sprint 2: F2 Web Client Sync Store and Stable Device Identity. This connects the existing canvas shell to the backend and establishes stable client identity.
3. Sprint 3: F3 Route-Driven Room Creation and Joining. This makes collaboration shareable and deterministic through room URLs.
4. Sprint 4: F4 Presence, Status, Multi-Tab Behavior, and Failure Recovery. This makes real collaboration understandable and resilient during local development.
5. Sprint 5: F5 Integrated Verification, Developer Docs, and Quality Commands. This closes the loop with repeatable validation and repo-level handoff commands.
