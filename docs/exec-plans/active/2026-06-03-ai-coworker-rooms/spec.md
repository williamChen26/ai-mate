# Spec: AI Coworker Rooms

## Background

The product is a tldraw-first collaborative canvas where an AI coworker works in the same whiteboard room as the user. The current architecture already has `apps/web` joining route-backed tldraw rooms through `apps/server`, with the tldraw editor store as the shared document source of truth. The next product layer should connect three responsibilities into one coherent collaboration system:

1. `apps/server` coordinates room lifecycle, sync state, user operation events, canvas snapshots, and agent session lifecycle.
2. `apps/web` remains the editable whiteboard experience while exposing user operation context, chat input, and AI output handling.
3. `apps/mate` becomes the AI coworker process that receives room context, observes recent user behavior, reasons over the current canvas, and returns suggestions, questions, next actions, or controlled canvas proposals.

This work should turn "AI can inspect a canvas snapshot someday" into "each room has a clear AI coworker lifecycle and protocol." The first implementation should stay honest about production limits: it can use deterministic or stubbed AI behavior before full model integration, but it must establish the contracts that make real-time collaboration safe, inspectable, and testable.

## Goals

1. Define a room-scoped agent lifecycle so every valid room can request a corresponding `mate` session.
2. Establish a shared protocol for canvas snapshots, user operation events, chat messages, and agent outputs.
3. Let `mate` reason from both current canvas state and recent user behavior instead of only isolated chat text.
4. Give `apps/web` a usable AI coworker entry point for user messages and AI responses.
5. Keep agent-authored canvas changes behind explicit, typed, safe, inspectable boundaries.
6. Provide runtime diagnostics so a developer can understand whether a room has sync, snapshot, event, and mate connectivity working.

## Non-Goals

1. Do not require production-grade model orchestration, billing, auth, permissions, invite links, or tenant isolation in this run.
2. Do not require durable room persistence or horizontally scalable multi-process room coordination yet.
3. Do not let the agent mutate the canvas directly through hidden editor access or unvalidated free-form instructions.
4. Do not replace tldraw sync as the source of truth with a parallel whiteboard graph.
5. Do not build an elaborate prompt studio, long-term memory product, or autonomous planning framework before the basic room protocol works.
6. Do not imply that AI observation is private or secure without a later permissions and consent model.

## Feature List

### F1: Room Agent Lifecycle Contract

Define the server-owned lifecycle for requesting, tracking, and ending a `mate` session for each collaborative room. The room should have an inspectable agent state such as not requested, starting, connected, unavailable, reconnecting, or ended, and the server should make this lifecycle observable without requiring the web client to create the AI session by itself.

**Behavior Scenarios:**
- Scenario: Agent is requested when a room becomes active
  - Given a valid room is created or first joined through the server
  - When the server initializes the room runtime
  - Then the server records that a `mate` session is requested for that room
  - And the room exposes an inspectable agent lifecycle state
- Scenario: Room continues when mate is unavailable
  - Given the user joins a room and the canvas sync route is working
  - When the server cannot start or reach the `mate` session
  - Then the whiteboard remains usable
  - And the room exposes an agent-unavailable state instead of failing canvas collaboration
- Scenario: Agent lifecycle is room-scoped
  - Given two different rooms are active
  - When the server requests `mate` participation
  - Then each room has an independent agent session identity and state
  - And events or snapshots from one room are not attributed to another room
- Scenario: Agent session ends with room lifecycle
  - Given a room has no active participants or is explicitly closed by lifecycle policy
  - When the server retires the room runtime
  - Then the corresponding `mate` session is ended or marked inactive
  - And future joins can create or resume according to the documented room policy

**Acceptance Criteria:**
- AC-1.1: A room-scoped agent lifecycle contract exists with explicit states and transitions.
- AC-1.2: Server room initialization requests or schedules a `mate` session without requiring web to own that responsibility.
- AC-1.3: Agent startup failure does not break normal tldraw room sync.
- AC-1.4: Lifecycle state is inspectable through a server diagnostic boundary suitable for tests or manual checks.
- AC-1.5: Room and agent session identity are correlated without leaking events across rooms.

**Priority:** P0 (must-have)
**Dependencies:** None

### F2: Canvas Context and Operation Event Stream

Create the shared context feed that lets `mate` understand what is on the whiteboard and what the user is currently doing. The feed should combine periodic or requested canvas snapshots with recent operation events, including user edits, selection/focus changes, viewport changes, and chat messages where appropriate. It should be serializable and derived from tldraw room state or web/editor state, not from a separate graph.

**Behavior Scenarios:**
- Scenario: Server receives a canvas snapshot for the room
  - Given a web client is connected to a room with current tldraw content
  - When the room context is requested or refreshed
  - Then the server can provide or relay a serializable canvas snapshot for `mate`
  - And the snapshot includes enough metadata to identify its room, source, and freshness
- Scenario: User operations are captured as recent behavior
  - Given a user edits, selects, pans, zooms, or focuses content on the canvas
  - When web emits operation context for the active room
  - Then the server receives normalized operation events
  - And `mate` can consume a recent ordered event window
- Scenario: Snapshot and event freshness is explicit
  - Given `mate` is reasoning over a prior snapshot
  - When newer user operations arrive
  - Then the context feed can indicate that older assumptions may be stale
  - And later agent outputs can reference the snapshot or event window they used
- Scenario: Empty or quiet rooms still produce context
  - Given a room has no shapes or no recent operations
  - When `mate` requests context
  - Then it receives a valid empty snapshot and empty recent-event window
  - And the system does not fabricate canvas meaning

**Acceptance Criteria:**
- AC-2.1: A serializable context protocol exists for canvas snapshots and recent operation events.
- AC-2.2: Web can emit normalized user operation events for at least canvas edits, selection/focus, viewport changes, and chat input boundaries.
- AC-2.3: Server can associate snapshots and operation events with the correct room and agent session.
- AC-2.4: Context freshness metadata allows stale snapshot or stale event-window detection.
- AC-2.5: Empty canvas, no-selection, quiet-room, and changed-since-snapshot cases are represented without errors.

**Priority:** P0 (must-have)
**Dependencies:** F1

### F3: Mate Session Context Ingestion and Memory Boundary

Teach `apps/mate` to act like a room-aware whiteboard coworker by ingesting room snapshots, recent operation events, and user chat messages through the shared protocol. This feature should define what `mate` knows for the current turn, what it treats as stale, and what short-lived room memory it may retain. It may use deterministic or stubbed reasoning first, as long as the input/output boundary matches the future AI integration.

**Behavior Scenarios:**
- Scenario: Mate receives room context before responding
  - Given a user sends a message while in a room
  - When `mate` prepares a response
  - Then it receives the current or latest available canvas snapshot
  - And it receives recent user operation events for that same room
- Scenario: Mate distinguishes observation from interpretation
  - Given a snapshot contains shapes and recent actions
  - When `mate` builds its response context
  - Then raw canvas facts remain separate from inferred user intent
  - And the response can explain uncertainty when the intent is ambiguous
- Scenario: Mate notices stale assumptions
  - Given `mate` created a draft response from an older snapshot
  - When newer operations arrive before output is delivered or applied
  - Then the session can mark the response as possibly stale
  - And it can ask for confirmation or refresh context instead of acting blindly
- Scenario: Mate handles non-chat observations
  - Given the user makes meaningful canvas changes without sending chat
  - When the event window suggests a possible need for help
  - Then `mate` can prepare passive suggestions or next-step ideas according to the configured product policy
  - And it does not interrupt with uncontrolled autonomous edits

**Acceptance Criteria:**
- AC-3.1: `mate` has a room-scoped ingestion boundary for snapshots, operation events, and chat messages.
- AC-3.2: The session context separates raw canvas data, recent user actions, inferred intent, and uncertainty.
- AC-3.3: Responses can cite or carry the snapshot/event freshness metadata they were based on.
- AC-3.4: Deterministic or stubbed behavior can demonstrate context-aware suggestions before full model integration.
- AC-3.5: `mate` does not mutate the canvas directly; it only emits typed outputs through the agreed protocol.

**Priority:** P0 (must-have)
**Dependencies:** F2

### F4: Web AI Interaction Surface

Add the user-facing AI coworker surface to `apps/web`: a way to send chat-like input to `mate`, show AI responses, show agent room status, and render suggestions without covering or confusing the whiteboard. The surface should feel like an AI colleague in the same room, not a detached generic chatbot.

**Behavior Scenarios:**
- Scenario: User sends a message from the whiteboard room
  - Given a user is viewing a valid room
  - When they enter a message for the AI coworker
  - Then web sends the message with the active room identity and context boundary
  - And the user can see pending, success, or failure state
- Scenario: User sees context-aware AI output
  - Given `mate` returns a suggestion, question, or next-step recommendation
  - When web receives the output
  - Then it displays the response in the room AI surface
  - And the output is visibly associated with the current room rather than a global chat
- Scenario: User understands agent availability
  - Given the server reports the room agent as starting, connected, unavailable, or reconnecting
  - When the user views the room
  - Then web reflects that state compactly
  - And canvas editing remains available regardless of agent status
- Scenario: AI surface does not dominate canvas work
  - Given the user is actively drawing, editing, or navigating the canvas
  - When AI suggestions are present
  - Then the canvas remains the primary workspace
  - And the user can ignore, dismiss, or continue without losing whiteboard focus

**Acceptance Criteria:**
- AC-4.1: Web provides a room-scoped AI input path for user messages to `mate`.
- AC-4.2: Web renders room-scoped AI responses, loading state, error state, and agent availability state.
- AC-4.3: AI UI behavior preserves the tldraw canvas as the first-screen primary workspace.
- AC-4.4: Web message payloads include enough room/session metadata for server and `mate` correlation.
- AC-4.5: Empty, failed, delayed, and successful AI response states are verifiable through runtime or E2E checks.

**Priority:** P0 (must-have)
**Dependencies:** F3

### F5: Agent Output Protocol and Safe Canvas Actions

Define how `mate` can return outputs beyond plain text: suggestions, questions, comments, highlights, proposed canvas edits, or next-step plans. Any output that changes the canvas must be typed, validated, previewable or explainable, and explicitly accepted before it is applied through the normal tldraw-aware action boundary.

**Behavior Scenarios:**
- Scenario: Mate sends a non-mutating suggestion
  - Given `mate` has analyzed the room context
  - When it returns a suggestion or question
  - Then web can display it without changing the canvas
  - And the output includes the context freshness it relied on
- Scenario: Mate proposes a canvas action
  - Given `mate` wants to help by creating, editing, moving, or highlighting canvas content
  - When it emits an action proposal
  - Then the proposal is validated against the current canvas context
  - And the canvas is not mutated until the user explicitly accepts
- Scenario: Stale action proposal is blocked or refreshed
  - Given `mate` produced an action proposal from an older snapshot
  - When the user has changed overlapping canvas content
  - Then the proposal is marked stale, blocked, or refreshed
  - And the user receives clear conflict guidance
- Scenario: Failed action remains inspectable
  - Given an agent output is malformed, unsupported, or unsafe
  - When server or web validates it
  - Then the system rejects it without mutation
  - And diagnostics record why it was rejected

**Acceptance Criteria:**
- AC-5.1: A typed agent output protocol exists for text suggestions, questions, and safe action proposals.
- AC-5.2: Canvas-mutating outputs require validation and explicit user acceptance before apply.
- AC-5.3: Stale or conflicting proposals can be detected using snapshot/event freshness metadata.
- AC-5.4: Unsupported or malformed outputs are rejected with inspectable diagnostics and no canvas mutation.
- AC-5.5: Web can render at least one non-mutating suggestion and one proposed action state without applying it automatically.

**Priority:** P1 (should-have)
**Dependencies:** F4

### F6: Runtime Observability and Manual Validation Loop

Provide developer-facing observability for the full room-to-agent path so each sprint can be manually validated. Diagnostics should answer: is the room active, is sync connected, has the agent session been requested, is `mate` connected, what snapshot/event version is current, and what was the last AI input/output result?

**Behavior Scenarios:**
- Scenario: Developer inspects a live room
  - Given backend and web are running locally
  - When a developer opens the room diagnostics
  - Then they can see room sync status, agent lifecycle status, event feed status, and snapshot freshness
  - And the information is scoped to the selected room
- Scenario: Developer validates full path manually
  - Given a room contains canvas content and the AI surface is visible
  - When the developer sends an AI message
  - Then they can observe the message travel through web, server, and `mate`
  - And they can inspect the resulting AI response or failure state
- Scenario: Diagnostics expose degraded mode
  - Given `mate` is unavailable or event delivery fails
  - When the user continues using the canvas
  - Then diagnostics identify the degraded component
  - And normal whiteboard sync remains independently checkable
- Scenario: Harness records validation evidence
  - Given a sprint changes the collaboration path
  - When Generator hands off the sprint
  - Then the build log includes local commands and what to inspect manually
  - And Evaluator can verify behavior using the repository quality commands where practical

**Acceptance Criteria:**
- AC-6.1: Diagnostics expose room sync, agent lifecycle, snapshot freshness, event feed, and AI request/response status.
- AC-6.2: The full web -> server -> mate -> web message path has a documented manual validation flow.
- AC-6.3: Degraded mate availability is observable without breaking normal canvas collaboration.
- AC-6.4: Sprint build logs include concrete local commands and manual inspection steps for collaboration behavior.
- AC-6.5: Validation remains compatible with the root `pnpm check` gate and focused server/web commands documented for this repo.

**Priority:** P1 (should-have)
**Dependencies:** F4

## Risks & Dependencies

1. The system can accidentally split source of truth if snapshots become a separate model of the canvas. The contract must keep tldraw room/editor state canonical.
2. Realtime observation can become noisy. The first event stream should normalize meaningful operations and retain a bounded recent window rather than forwarding every low-level editor detail as product meaning.
3. Agent startup should not become a hard dependency for whiteboard collaboration. The server must degrade gracefully when `mate` is offline.
4. Stale context is central to trust. Agent outputs should carry freshness metadata from the snapshot and event window they used.
5. Direct canvas mutation by AI is risky. Proposed edits need typed validation, preview/explanation, and explicit acceptance.
6. Privacy and consent are not solved in this run. Future production work must decide how users know an AI is observing the room and what data is retained.
7. Current backend storage is in-memory and process-local, so lifecycle and diagnostics should be designed for local MVP behavior before production durability.

## Open Questions

1. Should `mate` be a separate long-running app/process, a server-managed worker module, or an external service endpoint in the first implementation?
2. What is the first useful `mate` behavior: summarize the board, infer user's current intent, suggest next steps, critique structure, or propose concrete canvas edits?
3. Should passive suggestions appear automatically from observed operations, or only after explicit user chat in the first product slice?
4. How often should canvas snapshots be sent: on demand, after debounce, after meaningful operations, or when `mate` asks for refresh?
5. Which user operations are meaningful enough for MVP context: shape create/update/delete, text edit, selection, viewport, pointer activity, tool change, or all tldraw store changes?
6. What consent language or UI signal is needed before saying the AI "实时监控" user behavior?

## Suggested Sprint Order

1. Sprint 1: F1 Room Agent Lifecycle Contract. First make server own the concept that every room may have a `mate` coworker, while preserving normal room sync if AI is unavailable.
2. Sprint 2: F2 Canvas Context and Operation Event Stream. Build the shared language for snapshots and recent user behavior so the AI can know the board and the user's current activity.
3. Sprint 3: F3 Mate Session Context Ingestion and Memory Boundary. Make `mate` consume the room protocol and produce context-aware deterministic/stubbed responses.
4. Sprint 4: F4 Web AI Interaction Surface. Add the user-facing chat and response surface in the actual whiteboard room.
5. Sprint 5: F5 Agent Output Protocol and Safe Canvas Actions. Move beyond text into proposed actions, still behind explicit validation and acceptance.
6. Sprint 6: F6 Runtime Observability and Manual Validation Loop. Harden the system so you can see and verify the whole room-agent path during development.

## First Execution Recommendation

Start with Sprint 1 and keep it deliberately small: no real model call, no AI UI polish, no canvas edits. The only goal is to prove that when a room exists, the server can create and report a room-scoped `mate` lifecycle without breaking existing tldraw sync. Once that foundation is real, the rest of the project becomes a sequence of understandable connections rather than one giant fog bank.
