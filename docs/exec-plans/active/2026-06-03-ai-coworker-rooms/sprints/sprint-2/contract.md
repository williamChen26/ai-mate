# Sprint 2 Contract: Canvas Context and Operation Event Stream

## Feature
F2: Canvas Context and Operation Event Stream

## Scope
Create the shared input-side protocol and runtime path that lets the web app publish room canvas context and recent user operation events to the server. The server should retain a bounded, room-scoped context feed that future `mate` ingestion can consume in F3.

This sprint implements:

- a new workspace shared contracts package, `packages/shared`, named `@production-spec-graph/shared`
- Zod-backed schemas and inferred TypeScript types for AI input-side context only:
  - canvas snapshot envelopes
  - normalized room operation events
  - room context feed/freshness metadata
  - validation results/helpers suitable for server and web use
- server-side room context storage associated with the existing room registry and Sprint 1 agent lifecycle diagnostics
- HTTP endpoints or an equivalent inspectable server boundary for:
  - accepting a latest canvas snapshot for a valid room
  - accepting normalized operation events for a valid room
  - reading the current room context feed for diagnostics/manual checks
- web-side canvas context extraction from the mounted tldraw editor, including at minimum shape inventory, current selection, viewport/focus summary where available, and freshness metadata
- web-side normalized operation event emission for at least canvas/document changes, selection/focus changes, viewport/focus changes, and a chat-input-boundary event helper without building a visible chat UI
- bounded recent-event retention with monotonically increasing freshness/version counters so stale snapshots and changed-since-snapshot cases are detectable
- focused shared/server/web tests plus E2E/runtime evidence that the web app can publish context and the server can report it per room

Important schema decision:

- F2 should **not** define the AI output schema. Agent responses, suggestions, proposed actions, and safe canvas mutations remain F5 territory.
- F2 should define the input schema that future `mate` will consume. Because this protocol crosses `apps/web`, `apps/server`, and later `apps/mate`, the shared package should use Zod so runtime validation and TypeScript types come from one source.

## Out of Scope
- No AI model calls, prompt execution, autonomous agent behavior, or real `mate` ingestion.
- No AI output schema, response schema, suggestion schema, proposed-action schema, or canvas mutation protocol.
- No user-facing chat panel, AI response UI, approval UI, or assistant presence UI.
- No persistent database, durable event log, asset storage, authentication, permissions, privacy consent UI, or multi-process coordination.
- No replacement of tldraw sync as the source of truth and no custom product graph protocol.
- No full-fidelity tldraw document serialization if a compact agent-readable snapshot is enough for this sprint.
- No modification to `spec.md`.

## Behavior Scenarios
- Scenario: Server receives a canvas snapshot for the room
  - Given a web client is connected to a valid room with a mounted tldraw editor
  - When the web app publishes a canvas snapshot for that room
  - Then the server validates the snapshot with the shared schema
  - And the server stores it as the latest snapshot for the same room and current agent lifecycle context
  - And diagnostics include snapshot freshness metadata without exposing a parallel source of truth

- Scenario: User operations are captured as recent behavior
  - Given a user edits canvas content, changes selection/focus, changes viewport/focus, or a chat input boundary helper is invoked
  - When web emits the normalized operation event for the active room
  - Then the server validates and appends the event to the room's bounded recent-event window
  - And `mate` can later consume the ordered event window through a shared typed contract

- Scenario: Snapshot and event freshness is explicit
  - Given the server has a latest snapshot and recent operation events for a room
  - When newer events arrive after the snapshot
  - Then the room context feed exposes counters or timestamps showing the event window has advanced since the snapshot
  - And future agent outputs can reference the snapshot/event freshness they used without this sprint defining output schemas

- Scenario: Empty or quiet rooms still produce context
  - Given a valid room has no shapes, no active selection, or no recent events
  - When web publishes or server reads the room context feed
  - Then the snapshot and event window are valid, serializable, and explicit about being empty
  - And the system does not fabricate canvas meaning or inferred intent

- Scenario: Invalid or cross-room context is rejected
  - Given a client submits malformed context, an invalid room id, or a payload whose embedded room id does not match the route room id
  - When the server validates the request
  - Then it rejects the payload with inspectable error details
  - And the previous room context feed is not mutated

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-2.1 | A shared `@production-spec-graph/shared` package exists with Zod schemas and exported TypeScript types for canvas snapshots, operation events, context freshness, and room context feed data. | Shared package unit tests validate good/bad fixtures and typecheck/build confirms web/server can import the package. |
| AC-2.2 | The shared schema explicitly covers AI input-side data only and does not define agent output, suggestion, action proposal, or canvas mutation schemas. | Source review plus shared tests; `rg` verifies no exported output/action proposal schema in the shared package during this sprint. |
| AC-2.3 | Server can validate, store, and expose the latest canvas snapshot for a valid room, associated with room id and agent lifecycle/session context. | Server tests submit valid/invalid snapshots and assert room-scoped diagnostics/context feed output; invalid payloads do not mutate previous state. |
| AC-2.4 | Server can validate, append, bound, and expose recent operation events for a room, preserving event order and freshness metadata. | Server tests append canvas-change, selection-change, viewport-change, and chat-boundary events; tests assert ordering, bound trimming, counters, and changed-since-snapshot metadata. |
| AC-2.5 | Web can extract and publish a serializable tldraw-derived snapshot and normalized operation events for the active route room. | Web unit tests cover extraction/normalization helpers; E2E opens a room, triggers canvas/selection/viewport behavior or developer hooks, and verifies server context diagnostics. |
| AC-2.6 | Empty canvas, no-selection, quiet-room, and changed-since-snapshot cases are represented without errors or fabricated intent. | Shared/web/server tests cover empty fixtures and changed-after-snapshot counters; E2E or runtime diagnostics verify quiet room context remains valid. |
| AC-2.7 | Existing room sync and Sprint 1 agent lifecycle diagnostics continue to work. | Run `pnpm check`; server smoke and web E2E remain green and `/ready` still exposes `agentLifecycle`. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
F2 creates cross-app runtime protocol schemas, validators, freshness counters, bounded event retention, route/payload room matching, and tldraw context normalization. These are deterministic data transformations and boundary validation rules where tests should define correctness before implementation.

Planned evidence:
- RED: add shared schema tests, server context-store/endpoint tests, and web context extraction/normalization tests before required modules/routes exist. Expected failures are missing package exports, missing server context endpoints/store, and missing web publisher/extractor behavior.
- GREEN: implement shared schemas/types, server store/routes, web extractor/publisher, and E2E/runtime diagnostics until tests pass.
- REFACTOR: keep schema definitions in shared, server storage independent of Fastify route formatting, and web extraction/publishing separate from React shell wiring.

Planned focused coverage:
- valid and invalid canvas snapshot fixtures
- event variants for canvas change, selection/focus, viewport/focus, and chat-boundary
- embedded room id mismatch rejection
- bounded recent-event retention and monotonic counters
- empty snapshot/no selection/quiet room
- changed-since-snapshot metadata
- web publisher request shapes and failure-tolerant behavior

### E2E / Runtime Verification
This sprint changes web-server runtime communication, so runtime verification is required.

Required runtime path:
- `pnpm --filter @production-spec-graph/shared test`
- `pnpm --filter @production-spec-graph/shared typecheck`
- `pnpm --filter @production-spec-graph/shared build`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/server typecheck`
- `pnpm --filter @production-spec-graph/server build`
- `pnpm --filter @production-spec-graph/server smoke`
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web build`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `git diff --check`
- Prefer full `pnpm check` before handoff; update it if needed to include the shared package gate.

The E2E smoke should open a room, wait for the tldraw shell, publish or observe at least one context snapshot and operation event through the implemented runtime path, then query server diagnostics/context feed to verify the room has a latest snapshot, recent events, and freshness metadata. If low-level tldraw interaction events are brittle in Playwright, a developer-facing context hook may be used as the runtime trigger, but it must exercise the same web publisher and server validation/storage path.

## Modularity & Readability Plan
Expected boundaries:

- `packages/shared`: Zod schemas, inferred TypeScript types, fixture-friendly validation helpers, and no app/runtime dependencies.
- `apps/server`: room context store and Fastify route handlers/diagnostics that import shared schemas and keep storage process-local.
- `apps/web`: tldraw context extraction, event normalization, context publisher client, and minimal CanvasShell wiring or developer hook.
- `apps/mate`: no implementation required in F2, but it should be able to import the shared package in F3 without changing F2's protocol.

Avoid placing schema copies in each app. Avoid letting web or server infer AI intent; the context feed should carry facts and freshness, not analysis. Keep comments focused on non-obvious freshness semantics and why AI output schemas are intentionally deferred.

## Human Checkpoint
Pause after Sprint 2 because this is the first complete input-context path from web to server.

Recommended local commands:
- `pnpm --filter @production-spec-graph/shared test`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection:
- Start backend and web.
- Open a room and interact with the canvas enough to produce a snapshot and at least one operation event.
- Inspect the server context diagnostic endpoint for that room.
- Confirm the context feed includes latest snapshot metadata, recent operation events, freshness counters, and Sprint 1 agent lifecycle correlation.
- Confirm no UI or schema claims AI output, autonomous action, or real model behavior exists yet.

## Technical Approach
Create a shared Zod contract package first, then wire server validation/storage against that contract, then make web extract and publish compact tldraw-derived facts into it. Keep the snapshot compact and agent-readable rather than trying to serialize every tldraw internal record. Use bounded in-memory room context storage for this MVP, aligned with the existing process-local room registry.

## Dependencies
- F1 passed room agent lifecycle diagnostics.
- Existing `apps/web` tldraw canvas shell and route-backed room identity.
- Existing `apps/server` Fastify app, room registry, and raw sync route.
- Workspace support for `packages/*` in `pnpm-workspace.yaml`.
- Zod is already present in the lockfile and used by `apps/mate`, but `packages/shared` should own the protocol schemas for web/server/mate reuse.

## Estimated Complexity
L
