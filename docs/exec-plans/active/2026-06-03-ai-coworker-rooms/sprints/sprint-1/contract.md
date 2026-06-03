# Sprint 1 Contract: Room Agent Lifecycle Contract

## Feature
F1: Room Agent Lifecycle Contract

## Scope
Implement the first server-owned lifecycle boundary for a room-scoped `mate` coworker session. When a valid tldraw sync room is initialized, the server should create or schedule a corresponding agent lifecycle record for that room and expose the room's agent state through inspectable diagnostics.

This sprint implements:

- a typed room-agent lifecycle model with explicit states and transitions
- deterministic session identity/correlation between a room and its `mate` lifecycle record
- server-side room initialization wiring that requests the room's agent lifecycle without requiring web to own the request
- graceful degraded behavior when `mate` startup is unavailable or stubbed
- diagnostic output that shows each room's agent lifecycle state alongside room readiness information
- focused server tests for lifecycle state transitions, per-room isolation, unavailable/degraded mode, and diagnostic serialization
- runtime smoke coverage proving normal sync/readiness behavior still works while agent lifecycle diagnostics are present

For this sprint, `mate` may be represented by a stub adapter or lifecycle service boundary. The important outcome is the server contract: every room can have an inspectable `mate` lifecycle, and failure to reach the agent path does not break whiteboard sync.

## Out of Scope
- No real AI model calls, prompt execution, chat workflow, autonomous agent behavior, or canvas interpretation.
- No `apps/web` AI panel, chat input, agent response rendering, user operation stream, or canvas snapshot upload.
- No live `apps/mate` process orchestration beyond a typed/stubbed lifecycle boundary if needed.
- No canvas mutation, action proposal, approval UI, or AI-authored tldraw operations.
- No authentication, authorization, participant permissions, consent UI, persistent storage, or production process supervision.
- No horizontal scaling or multi-process room coordination.
- No modification to `spec.md`.

## Behavior Scenarios
- Scenario: Agent is requested when a room becomes active
  - Given a valid room is created or first joined through the server sync route
  - When the server initializes the room runtime
  - Then the server records that a `mate` session lifecycle has been requested for that room
  - And the room exposes an inspectable agent lifecycle state with a room id, agent session id, state, and timestamps

- Scenario: Room continues when mate is unavailable
  - Given the user joins a valid room and the canvas sync route is working
  - When the room-agent lifecycle boundary reports that `mate` cannot be started or reached
  - Then the tldraw sync room remains usable
  - And diagnostics expose an agent-unavailable or degraded state instead of failing room sync

- Scenario: Agent lifecycle is room-scoped
  - Given two different valid rooms are active
  - When the server requests `mate` participation for both rooms
  - Then each room has an independent agent lifecycle record and session id
  - And diagnostics never attribute one room's agent state to another room

- Scenario: Agent session ends with room lifecycle
  - Given a room has an active or unavailable agent lifecycle record
  - When the server retires, closes, or removes the room through the existing room lifecycle boundary
  - Then the corresponding agent lifecycle record is ended or marked inactive
  - And future joins can create a new lifecycle record according to the documented policy

- Scenario: Diagnostics remain serializable
  - Given one or more rooms have agent lifecycle records
  - When a server diagnostic or readiness boundary is requested
  - Then the agent lifecycle data is JSON-serializable and safe for tests/manual inspection
  - And it does not expose canvas contents, user messages, or model prompts in this sprint

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-1.1 | A room-scoped agent lifecycle contract exists with explicit states and transitions for requested/starting, connected or unavailable, ended, and recoverable degraded behavior. | Server unit tests cover valid transitions and refused/normalized invalid transitions; typecheck verifies exported lifecycle types. |
| AC-1.2 | Server room initialization requests or schedules a `mate` lifecycle record without requiring any web client AI-specific call. | Server tests create or access a valid room through the existing room registry/sync boundary and assert an agent lifecycle record is created for that room. |
| AC-1.3 | Agent startup failure or stub unavailability does not break normal tldraw room sync behavior. | Server tests simulate an unavailable lifecycle adapter and assert room creation/readiness still succeeds; `pnpm --filter @production-spec-graph/server smoke` verifies the runtime sync/readiness path remains healthy. |
| AC-1.4 | Lifecycle state is inspectable through a server diagnostic boundary suitable for tests and manual checks. | Server tests assert readiness/diagnostic JSON includes room-scoped agent state, session id, timestamps, and degraded/unavailable information where relevant. |
| AC-1.5 | Room and agent session identity are correlated per room without leaking state across rooms. | Server tests create two rooms and assert distinct agent session ids, isolated states, and room-specific diagnostic entries. |
| AC-1.6 | Room retirement or explicit cleanup ends or inactivates the corresponding agent lifecycle record according to the documented policy. | Server unit tests exercise the room cleanup/lifecycle boundary and assert the agent record is ended/inactive or intentionally retained with documented status. |
| AC-1.7 | This sprint does not introduce real AI calls, web AI UI, canvas snapshot ingestion, or canvas mutation. | Source review plus `rg` checks for model-call/chat/snapshot/action surfaces; server typecheck/build pass without web AI changes. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
This sprint centers on deterministic lifecycle state, room/session identity correlation, degraded-state handling, and serializable diagnostics. Those are core protocol/state-transition rules where focused tests should define the behavior before implementation.

Planned evidence:
- RED: add focused server tests for room-agent lifecycle creation, unavailable adapter behavior, per-room isolation, diagnostic serialization, and cleanup/end-state behavior before the lifecycle module and wiring exist. Expected failures are missing exports, missing diagnostic fields, or unmet state assertions.
- GREEN: implement the lifecycle model, room registry wiring, unavailable/stub adapter path, and diagnostics until the focused server tests pass.
- REFACTOR: keep lifecycle state logic independent of Fastify/WebSocket details where practical, then keep the server route/registry wiring thin while tests stay green.

Planned focused coverage:
- valid initial lifecycle creation for a room
- stable room-to-agent session correlation for repeated access to the same room
- distinct lifecycle records for distinct rooms
- unavailable/degraded state when the `mate` boundary cannot start
- serializable readiness/diagnostic output
- cleanup/end-state behavior when a room is retired or removed

### E2E / Runtime Verification
This sprint changes backend room runtime behavior, so runtime verification is required.

Required runtime path:
- Run `pnpm --filter @production-spec-graph/server test`.
- Run `pnpm --filter @production-spec-graph/server typecheck`.
- Run `pnpm --filter @production-spec-graph/server build`.
- Run `pnpm --filter @production-spec-graph/server smoke`.

The smoke path should continue proving health/readiness, valid WebSocket upgrade, invalid room rejection, and multiple sessions in one room. If the existing smoke command does not inspect agent diagnostics, implementation should add the smallest focused runtime assertion that `/ready` or an equivalent diagnostic boundary exposes the room's agent lifecycle state after a valid room is touched.

Before handoff, run `git diff --check`. The full root `pnpm check` is preferred if time/permissions allow; if not run, the build log must record why the focused server gate is sufficient for this contract and what remains for final integration.

## Modularity & Readability Plan
Keep lifecycle responsibilities separated:

- A pure lifecycle module should own state names, transitions, session identity creation/correlation, timestamps, degraded/unavailable metadata, and JSON serialization.
- The existing room registry or sync-room boundary should call the lifecycle module when a room is created/accessed, but should not embed agent state transition logic inline.
- Fastify diagnostics/readiness formatting should read from the lifecycle/room registry and expose a small stable JSON shape.
- Tests should describe the room-agent behavior in plain fixtures and avoid coupling to tldraw internals where lifecycle behavior does not require them.

Avoid adding broad AI abstractions in this sprint. Comments should be limited to non-obvious lifecycle policy, especially why unavailable `mate` state is degraded rather than fatal.

## Human Checkpoint
Pause after Sprint 1 for manual validation before building F2.

Recommended local commands after implementation:
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/server typecheck`
- `pnpm --filter @production-spec-graph/server build`
- `pnpm --filter @production-spec-graph/server smoke`
- `pnpm --filter @production-spec-graph/server dev`

Manual inspection:
- Start the backend and open `http://127.0.0.1:3001/ready`.
- Touch or join a valid room through the existing sync route or smoke flow.
- Re-check readiness/diagnostics and confirm the room has an agent lifecycle state and room-scoped agent session id.
- Confirm backend health/readiness still works when the agent boundary is unavailable or stubbed.
- Confirm there is no claim of real AI behavior, chat, canvas snapshot understanding, or autonomous canvas editing yet.

## Technical Approach
Introduce a small room-agent lifecycle boundary inside the server and have room initialization request a lifecycle record through that boundary. Expose the resulting state through diagnostics/readiness so tests and humans can inspect it. Keep the `mate` side stubbed or unavailable-safe for now; the server contract matters more than actual AI behavior in Sprint 1. Preserve existing raw tldraw sync behavior as the primary runtime path.

## Dependencies
- Existing `apps/server` Fastify sync backend and room registry.
- Existing tldraw sync route and readiness/smoke diagnostics.
- `docs/exec-plans/quality-commands.md` server quality commands.
- The new run spec at `docs/exec-plans/active/2026-06-03-ai-coworker-rooms/spec.md`.

## Estimated Complexity
M
