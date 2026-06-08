# Spec: AI Gateway and AI Drop

## Background

The product is a tldraw-first collaborative canvas where AI should behave like a coworker in the same room, not as a hidden browser helper or a detached chatbot. The current architecture already has route-backed rooms, tldraw sync through the server, room context feeds, recent operation events, a deterministic `mate` boundary, raw conversation plumbing, and typed non-mutating agent outputs.

This run introduces the first real AI capability module around two entry points:

1. AI Drop: selection-aware, Tab-accepted autocomplete that can complete text inside a selected element or continue a flow/canvas structure when the selected context implies a diagram.
2. Conversation Gateway: a direct chat-style gateway that triggers an agent answer from the same room context.

The intended model is agentic: an agent should observe the latest room state, reason about user intent, decide whether a completion tool is appropriate, and use explicit collaborative canvas boundaries for canvas-facing work. The agent must not rely only on a one-time latest canvas snapshot. It should combine the current room snapshot with a bounded recent operation stack from the collaborative room, including edits, selections, viewport moves, chat boundaries, and other normalized user actions, so it can infer what the user is trying to do now. This run should primarily settle product logic, architecture direction, protocols, state transitions, and validation strategy. UI should remain minimal and low-interference: enough to prove the gateway and completion loop, but not optimized for visual polish, layout refinement, or broader experience design until the product direction is stable.

## Goals

1. Define a cohesive AI Gateway module that owns AI trigger routing for AI Drop and direct conversation.
2. Make AI Drop selection-aware so the agent can infer whether the user is editing text, extending a flow, or doing something that should not receive a completion.
3. Give the ReAct-style agent an explicit completion tool path instead of hard-coding completion behavior into the UI.
4. Render completion candidates as a custom translucent completion element that is preview-only until the user accepts with `Tab`.
5. Preserve the tldraw room and collaboration backend as the source of truth for canvas state and edits.
6. Reuse or evolve the existing demo `mate` agent boundary without forcing a large framework rewrite.
7. Prioritize logic, product direction, protocol clarity, and testable agent behavior over UI optimization or experience polish in this run.
8. Treat recent user operations as first-class agent context, alongside the latest canvas snapshot, so intent inference can consider both current state and the user's recent editing trajectory.

## Non-Goals

1. Do not implement broad AI Edit in this run; non-completion direct canvas editing remains out of scope.
2. Do not allow the agent to mutate the canvas through hidden browser-only editor access or unvalidated free-form commands.
3. Do not build a full prompt studio, agent marketplace, multi-agent planner, billing, auth, or durable memory system.
4. Do not require production-grade LLM provider switching if a deterministic or stubbed model adapter is needed for local validation.
5. Do not replace tldraw sync or the room context feed with a separate flowchart protocol.
6. Do not over-design a generic abstraction layer before these two gateway paths are understandable and verifiable.
7. Do not optimize the AI surfaces for final visual design, rich interaction polish, animations, or comprehensive UX refinement in this run; keep UI changes minimal and only as necessary to validate the core gateway behavior.

## Feature List

### F1: AI Gateway Trigger and Context Contract

Define the product and protocol boundary for entering AI from the canvas. The gateway should distinguish AI Drop triggers from direct conversational triggers, gather the freshest available room context, and record which contextual facts came from server collaboration state versus front-end-only runtime signals.

**Behavior Scenarios:**
- Scenario: Trigger AI Drop from selected canvas content
  - Given a user has selected a text shape, flow node, connector-adjacent element, or other canvas element
  - When the user invokes the AI Drop completion path
  - Then the gateway creates a room-scoped completion request with selection, recent operations, snapshot freshness, viewport, and source identity
  - And the request identifies missing or uncertain context instead of fabricating intent
- Scenario: Trigger direct conversation from the room
  - Given a user is in a valid room and sends a message to AI
  - When the message enters the gateway
  - Then the gateway creates a room-scoped conversational request with the latest room context and chat boundary information
  - And the conversation path is distinct from completion preview or Tab acceptance
- Scenario: Prefer collaboration context over browser-only context
  - Given context can be read from the server collaboration feed
  - When the gateway prepares an agent turn
  - Then it prefers server room context and recent operation events
  - And it uses front-end APIs only for context that cannot be reliably captured from the candidate feed, such as live selection-change, viewport-change, and chat-boundary signals
- Scenario: Build intent from snapshot plus recent operation stack
  - Given the collaborative room has a latest snapshot and a bounded stack of recent normalized user operations
  - When the gateway prepares an AI Drop or conversation request
  - Then the request includes both the snapshot facts and the ordered recent operation stack
  - And downstream agent logic can distinguish current canvas state from the user's recent editing trajectory
- Scenario: Handle stale or incomplete context
  - Given the snapshot or event window changed while the agent is preparing a result
  - When the gateway receives or returns the agent turn
  - Then the response carries freshness metadata and can be blocked, refreshed, or shown as uncertain according to the trigger type

**Acceptance Criteria:**
- AC-1.1: The gateway contract defines distinct request types for AI Drop completion and direct conversation.
- AC-1.2: Gateway requests include room id, source identity, trigger type, selection facts, viewport facts, recent operations, canvas snapshot freshness, and chat boundary metadata where applicable.
- AC-1.3: The contract documents which context must come from the server collaboration/context feed and which front-end-only runtime signals may supplement it.
- AC-1.4: Stale, empty-selection, no-selection, and missing-context states are represented explicitly without throwing or silently guessing.
- AC-1.5: Existing raw `mate` behavior can be mapped to or preserved behind the new gateway boundary without breaking the current room message path.
- AC-1.6: The room context contract treats the latest snapshot and bounded ordered recent operation stack as separate but jointly required inputs for intent inference.

**Priority:** P0 (must-have)
**Dependencies:** None

### F2: ReAct Agent Turn and Tool Decision Boundary

Evolve the current demo agent into a readable ReAct-style room agent boundary. The agent should observe the gateway request, reason over intent, decide whether to call a completion tool, and return either a completion proposal, a conversational answer, a clarifying question, or no-op guidance. Canvas-facing operations should remain typed and mediated by the collaboration-aware boundaries.

**Behavior Scenarios:**
- Scenario: Agent decides to call the completion tool
  - Given a completion trigger includes a selected text shape with partial text and recent text-edit operations in that element
  - When the agent combines the snapshot and recent operation stack to infer that the user is adding text inside that element
  - Then it calls the completion tool with the selected element context
  - And returns a candidate that can be previewed without mutating the canvas
- Scenario: Agent completes a flow continuation
  - Given a completion trigger includes a selected diagram node and recent flow-like canvas activity such as creating connected nodes, arrows, or adjacent text
  - When the agent combines the snapshot and recent operation stack to infer that the user is extending a process
  - Then it calls the completion tool with structured continuation intent
  - And returns candidate canvas additions or connective text as a previewable completion
- Scenario: Agent uses operations to avoid false intent
  - Given a selected shape exists but the recent operation stack shows the user is panning, selecting, or inspecting rather than authoring content
  - When the agent decides whether AI Drop should complete anything
  - Then it declines completion or asks a clarifying question
  - And it does not treat selection alone as sufficient evidence of authoring intent
- Scenario: Agent declines inappropriate completion
  - Given the selection or recent behavior does not support a confident completion
  - When the agent evaluates whether to call the completion tool
  - Then it returns a no-op, clarification, or conversational hint rather than forcing a ghost element
- Scenario: Agent answers through conversation
  - Given a direct chat request asks a question about the room or a general topic
  - When the agent processes the conversational turn
  - Then it answers in the conversation path without creating a completion proposal
  - And any canvas mutation remains out of scope unless a later accepted action boundary exists

**Acceptance Criteria:**
- AC-2.1: The agent turn model separates observation, reasoning trace or decision summary, tool calls, and final output in a way that is inspectable in tests or diagnostics.
- AC-2.2: A completion tool interface exists for text-in-element and flow-continuation style completion candidates.
- AC-2.3: The agent can return at least completion proposal, conversational answer, clarifying question, and no-op/refusal output kinds.
- AC-2.4: Completion tool results are preview-only and do not mutate tldraw state by themselves.
- AC-2.5: The existing demo agent is either preserved behind compatibility behavior or intentionally evolved into this boundary with documented migration notes.
- AC-2.6: Agent intent decisions are based on both latest snapshot facts and recent operation-stack facts, with tests or diagnostics covering cases where selection alone would be misleading.

**Priority:** P0 (must-have)
**Dependencies:** F1

### F3: AI Drop Completion Proposal Surface

Provide the canvas-facing AI Drop experience: a minimal custom completion element or preview surface that appears with controlled transparency, is visually associated with the selected context, and can be accepted with `Tab`. The preview should be ephemeral or clearly proposal-scoped until acceptance, and accepting it should apply the intended change through the normal canvas/collaboration path. This feature should prove the logic and state model first; avoid broader visual polish or UX redesign.

**Behavior Scenarios:**
- Scenario: Show a translucent text completion
  - Given the agent returns a text completion for a selected text element
  - When the candidate is still fresh for the current selection
  - Then the canvas shows a translucent completion element aligned with the selected text context
  - And no authoritative canvas mutation occurs before acceptance
- Scenario: Show a translucent flow continuation
  - Given the agent returns a flow continuation candidate for selected diagram context
  - When the candidate is renderable on the canvas
  - Then the canvas previews the proposed next node, connector, or text in a translucent completion state
  - And the preview communicates that `Tab` accepts the candidate
- Scenario: Accept completion with Tab
  - Given a completion preview is visible and fresh
  - When the user presses `Tab`
  - Then the proposed text or canvas continuation is applied through the controlled tldraw/collaboration path
  - And the preview is cleared after success or replaced by an inspectable failure state
- Scenario: Clear stale or irrelevant completion
  - Given the user changes selection, viewport, canvas content, or continues typing after a completion is proposed
  - When the proposal no longer matches the active context
  - Then the preview disappears or is marked stale
  - And pressing `Tab` does not apply a stale completion

**Acceptance Criteria:**
- AC-3.1: A custom AI Drop preview surface exists for completion candidates with minimal translucent styling and selection association sufficient for runtime validation.
- AC-3.2: Text completion and flow-continuation completion candidates can be represented without committing canvas changes before acceptance.
- AC-3.3: `Tab` acceptance applies only the active fresh completion through an explicit canvas/collaboration boundary.
- AC-3.4: Selection changes, context freshness changes, escape/cancel behavior, and failed apply states are handled without leaving orphaned previews.
- AC-3.5: The canvas remains the primary workspace and the completion preview does not block normal editing when no candidate is active.

**Priority:** P0 (must-have)
**Dependencies:** F2

### F4: Conversation Gateway Agent Path

Replace or refine the raw mate panel into a direct conversational gateway that sends user messages to the same room-aware agent. This path should answer through a minimal chat-style surface and diagnostics while remaining separate from completion preview and Tab acceptance. The goal is to verify routing, context, and agent output behavior, not to finalize conversation UX.

**Behavior Scenarios:**
- Scenario: User asks the agent from the room
  - Given the user is in a valid tldraw room
  - When they send a message through the conversation gateway
  - Then the message is routed to the room agent with room context and chat boundary metadata
  - And the UI shows pending, success, and failure states
- Scenario: Agent answers without canvas mutation
  - Given the agent returns a conversational answer
  - When the UI receives the response
  - Then the answer appears in the conversation surface
  - And no AI Drop preview or canvas edit is created unless the agent output explicitly belongs to the completion path
- Scenario: Conversation can reference canvas context
  - Given the current room contains selected or visible canvas content
  - When the user asks a context-aware question
  - Then the agent can answer using observed canvas facts and state uncertainty when context is stale or insufficient
- Scenario: Current raw diagnostics remain inspectable
  - Given this project is still validating AI plumbing
  - When a developer inspects the conversation turn
  - Then they can see enough structured request/response metadata to debug gateway routing, freshness, and output kind

**Acceptance Criteria:**
- AC-4.1: The conversation gateway uses the same AI Gateway and agent turn concepts as AI Drop while keeping a distinct conversational trigger type.
- AC-4.2: The UI supports message submit, pending, success, error, and context-stale states for direct agent answers.
- AC-4.3: Conversational answers do not create completion previews or mutate the canvas by default.
- AC-4.4: Existing raw mate route behavior is preserved, migrated, or replaced with a documented compatibility path.
- AC-4.5: Runtime or E2E validation can prove a room message reaches the agent and returns a rendered answer.

**Priority:** P0 (must-have)
**Dependencies:** F2

### F5: Gateway Observability and Safety Diagnostics

Make the new AI paths inspectable enough for development and evaluation. Diagnostics should show which gateway triggered, what context was used, whether a completion tool was called, why a candidate was shown or declined, and whether acceptance applied or refused a canvas change.

**Behavior Scenarios:**
- Scenario: Developer inspects an AI Drop turn
  - Given a completion was triggered from selected canvas context
  - When diagnostics are requested
  - Then they show trigger type, selected context, freshness, agent decision, tool call status, output kind, and preview/apply status
- Scenario: Developer inspects a conversation turn
  - Given a user sent a direct message to the agent
  - When diagnostics are requested
  - Then they show request metadata, context freshness, agent output kind, and any stale or unavailable state
- Scenario: Unsafe or stale output is refused
  - Given an agent output is malformed, unsupported, stale, or mismatched to the active selection
  - When the gateway or UI validates it
  - Then the output is refused without canvas mutation
  - And diagnostics record the reason in a developer-readable form
- Scenario: Quality checks document runnable behavior
  - Given a sprint implements a user-visible gateway behavior
  - When Generator hands work to Evaluator
  - Then build logs include the commands and manual validation steps needed to inspect AI Drop and conversation paths

**Acceptance Criteria:**
- AC-5.1: Room diagnostics include recent AI Gateway turn metadata for completion and conversation paths.
- AC-5.2: Diagnostics identify completion tool calls, no-op decisions, output validation, preview state, Tab acceptance state, and refusal reasons.
- AC-5.3: Malformed, unsupported, stale, or selection-mismatched outputs are rejected without canvas mutation.
- AC-5.4: Diagnostic payloads are bounded and avoid storing full private prompt history beyond what this local MVP explicitly needs for debugging.
- AC-5.5: Quality commands and manual checkpoint instructions are updated when needed to cover both AI Drop and conversation behavior.

**Priority:** P1 (should-have)
**Dependencies:** F3, F4

## Risks & Dependencies

1. The phrase "selected election" is interpreted as selected canvas element or selection context. If a more specific product concept exists, the next contract should name it before implementation.
2. AI Drop can become tightly coupled to front-end editor APIs if the gateway does not clearly separate server-observed room context from front-end-only live signals.
3. A custom completion element can accidentally become a real synced shape too early. The contract for F3 must decide and test whether it is ephemeral preview state or a proposal-scoped tldraw shape that is cleaned up safely.
4. ReAct-style traces can leak too much detail or become noisy. The first implementation should expose a concise decision summary and structured tool-call metadata rather than a large framework.
5. Flow continuation is harder than text completion because canvas intent may be ambiguous. The agent must be allowed to decline, clarify, or produce a conservative preview.
6. Real model integration may require credentials or network access. Sprints should keep deterministic tests and local smoke behavior available even when model calls are stubbed.
7. `Tab` conflicts with browser focus and tldraw shortcuts. The UI contract must ensure acceptance only happens when an active completion owns the keyboard intent.
8. Raw tldraw sync data may not directly express product-level intent. The recent operation stack should store normalized, bounded, room-scoped user operations that are useful to the agent, while still preserving freshness and avoiding a second source of truth.

## Open Questions

1. Should the AI Drop preview be implemented as an ephemeral overlay, a custom tldraw shape record, or a proposal shape that is explicitly unsynced until acceptance?
2. What keyboard gesture should dismiss a candidate: `Escape`, continued typing, selection change, or all of them?
3. For the first flow continuation, should the candidate create only one next node, or can it propose a small chain of multiple nodes and connectors?
4. How minimal should the conversation surface stay while the gateway protocol stabilizes: raw panel with better structure, or a small purpose-built panel without visual polish?
5. Which real model/provider should back the first non-stubbed agent turn, and should this run require credentials or remain deterministic until the UI path is stable?
6. Which normalized operation types are mandatory for the first intent model beyond the current set: text-edit, shape-create, shape-update, connector-create, selection-change, viewport-change, and chat-boundary?

## Suggested Sprint Order

1. Sprint 1: F1 AI Gateway Trigger and Context Contract. This is the foundation for both AI Drop and conversation and should be inspectable before any UI preview work begins.
2. Sprint 2: F2 ReAct Agent Turn and Tool Decision Boundary. This decides how the agent uses a completion tool, declines completion, or answers conversationally.
3. Sprint 3: F3 AI Drop Completion Proposal Surface. This creates the minimal custom translucent completion preview and Tab acceptance behavior needed to validate the logic.
4. Sprint 4: F4 Conversation Gateway Agent Path. This turns direct chat into the second official gateway path using the same agent boundary, keeping UI intentionally simple.
5. Sprint 5: F5 Gateway Observability and Safety Diagnostics. This completes the developer-facing safety and debugging loop after both gateway paths exist.
