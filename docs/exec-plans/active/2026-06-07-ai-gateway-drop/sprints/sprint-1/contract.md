# Sprint 1 Contract: AI Gateway Trigger and Context Contract

## Feature
F1: AI Gateway Trigger and Context Contract

## Scope
Define and implement the logic-first AI Gateway trigger/context contract for entering AI from a room. This sprint will add or evolve shared/runtime-verifiable request contracts so the system can distinguish AI Drop completion triggers from direct conversation triggers, validate boundary inputs, and build room-scoped gateway requests from both the latest room snapshot and a bounded ordered recent operation stack.

The gateway contract must preserve the current room message path by mapping existing raw `mate` message behavior into or behind the new boundary. UI changes are limited to the smallest wiring needed to keep existing raw room message behavior functional, if any.

## Out of Scope
- No AI Drop preview surface, translucent completion element, or `Tab` acceptance behavior.
- No ReAct agent decision loop, completion tool implementation, or AI Edit.
- No autonomous or hidden canvas mutation.
- No final chat UX, UI polish, animation, layout refinement, or broad visual redesign.
- No production LLM provider integration or credential-dependent behavior.
- No durable memory, auth, billing, prompt studio, or generic agent framework rewrite.

## Behavior Scenarios
- Scenario: Trigger AI Drop from selected canvas content
  - Given a user has selected a text shape, flow node, connector-adjacent element, or other canvas element
  - When the user invokes the AI Drop completion path
  - Then the gateway creates a room-scoped completion request with selection, recent operations, snapshot freshness, viewport, and source identity
  - And the request identifies missing or uncertain context instead of fabricating intent

- Scenario: Trigger direct conversation from the room
  - Given a user is in a valid room and sends a message to AI
  - When the message enters the gateway
  - Then the gateway creates a room-scoped conversational request with the latest room context and chat boundary information
  - And the conversation path is distinct from completion preview or `Tab` acceptance

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

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| AC-1.1 | The gateway contract defines distinct request types for AI Drop completion and direct conversation. | Focused shared/server tests construct both trigger types and assert discriminated validation behavior. |
| AC-1.2 | Gateway requests include room id, source identity, trigger type, selection facts, viewport facts, recent operations, canvas snapshot freshness, and chat boundary metadata where applicable. | Focused contract tests validate accepted complete payloads and rejected malformed payloads. |
| AC-1.3 | The contract documents and encodes which context must come from the server collaboration/context feed and which front-end-only runtime signals may supplement it. | Code review plus tests asserting source metadata for server-derived snapshot/events and front-end-only selection/viewport/chat-boundary supplements. |
| AC-1.4 | Stale, empty-selection, no-selection, and missing-context states are represented explicitly without throwing or silently guessing. | Focused tests cover stale snapshot/event freshness, empty selection, no selection, and missing optional runtime signals. |
| AC-1.5 | Existing raw `mate` behavior can be mapped to or preserved behind the new gateway boundary without breaking the current room message path. | Runtime smoke: post a room mate message through the existing server endpoint and verify the response still returns a structured non-mutating mate result. |
| AC-1.6 | The room context contract treats the latest snapshot and bounded ordered recent operation stack as separate but jointly required inputs for intent inference. | Focused tests fail when gateway intent context is built from snapshot alone, verify event ordering is preserved, and verify operation count is bounded. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
- This sprint defines protocol mapping, boundary validation, freshness handling, and ordered context transformation. These are deterministic contract behaviors where focused tests can define correctness before implementation.
- The highest-risk product issue is accidentally treating the latest canvas snapshot as sufficient AI context. Tests should pin that the bounded ordered recent operation stack is required and preserved alongside the snapshot.

Planned evidence:
- RED: add focused tests for completion vs conversation gateway request validation, explicit incomplete-context states, and snapshot-plus-ordered-operation-stack requirements before implementing the gateway contract.
- GREEN: implement the minimal shared/server contract and mapping needed for those tests to pass.
- REFACTOR: keep schemas/helpers cohesive and remove duplication while preserving passing focused tests.

### E2E / Runtime Verification
Run at least one executable runtime check that exercises the preserved room message path after the gateway contract exists:

- Preferred: `pnpm --filter @production-spec-graph/server test` plus `pnpm --filter @production-spec-graph/server smoke` if the smoke covers mate message behavior in this checkout.
- If the server smoke does not post a mate message, run a small local server process and `curl` a valid `POST /rooms/:roomId/mate/messages` request, then verify the response includes room id, trigger/source metadata or mapped gateway metadata, context freshness, and a non-mutating mate result.
- Final handoff should also run `pnpm check` unless a tool or permission issue blocks it, in which case the exact failed command and fallback must be recorded in `build-log.md`.

## Modularity & Readability Plan
Expected implementation should keep the gateway boundary cohesive and avoid spreading ad hoc request-shaping across web, server, and mate code:

- Prefer shared Zod-backed contracts in `packages/shared` for gateway request types, context source metadata, explicit incomplete-context states, and freshness/operation-stack invariants.
- Keep server orchestration in a small route/service adapter that maps existing room context feed and raw `mate` message inputs to the gateway request contract.
- Do not introduce UI-centric AI logic in `apps/web`; any web changes should only pass front-end-only runtime signals that the server feed cannot reliably know.
- Avoid oversized files by extracting gateway schema/build helpers if existing shared or server modules would mix unrelated concerns.
- New implementation code should include concise Chinese comments where helpful to explain what a feature/module/function does and why, especially around gateway boundaries, freshness checks, source attribution, and operation-stack handling. Do not comment trivial assignments or obvious TypeScript syntax.
- Tests should act as documentation for context requirements, especially the fact that latest snapshot and bounded ordered recent operations are separate, jointly required inputs.

## Human Checkpoint
Pause after the sprint reaches a locally runnable gateway contract and preserved raw room message path.

Developer inspection commands:
- `pnpm --filter @production-spec-graph/shared test`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/server smoke`
- `pnpm check`

What to inspect:
- Gateway request fixtures show distinct completion and conversation triggers.
- AI context includes both latest snapshot facts and the bounded ordered recent operation stack, not snapshot alone.
- Existing raw `mate` room message behavior remains non-mutating and room-scoped.
- Chinese comments clarify non-obvious gateway/readability decisions without cluttering straightforward code.

## Technical Approach (brief)
Introduce a shared gateway contract that discriminates completion and conversation triggers while reusing the existing room context feed, freshness metadata, source identity, and normalized operation events. Add a small builder or adapter that assembles validated gateway requests from server collaboration context plus allowed front-end-only supplements. Preserve existing raw `mate` message behavior by mapping conversation messages through this boundary or by wrapping current behavior with equivalent metadata. Keep tests focused on protocol validation, stale/incomplete states, and the snapshot-plus-operation-stack requirement.

## Dependencies
- Existing `packages/shared` Zod-backed room context, canvas snapshot, operation event, freshness, and agent output/proposal contracts.
- Existing `apps/server` room context and raw mate message endpoints.
- Existing `apps/mate` deterministic non-mutating turn behavior.
- Existing `apps/web` room identity/source identity and context publishing behavior, if minimal client signal wiring is needed.

## Estimated Complexity
M
