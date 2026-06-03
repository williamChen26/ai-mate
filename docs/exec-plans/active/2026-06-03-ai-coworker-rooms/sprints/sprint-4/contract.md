# Sprint 4 Contract: Logic-First Web AI Interaction Path

## Feature
F4: Web AI Interaction Surface

## Scope
Implement the first runnable web -> server -> mate -> web interaction path with logic and data contracts as the priority. UI should stay intentionally lightweight: a minimal room-scoped input and raw structured response/debug output is enough. The point of this sprint is to prove that a user can send a room message, the server can combine it with the room context feed, `mate` can prepare a context-aware turn result, and web can show pending/success/error state without disrupting the tldraw canvas.

This sprint implements:

- a server-side room-scoped mate turn boundary, exposed through an HTTP endpoint such as `POST /rooms/:roomId/mate/messages`
- server composition of:
  - route room id
  - user message
  - active room context feed from F2
  - agent lifecycle/session correlation from F1
  - F3 deterministic `mate` turn result
- server diagnostics for the latest mate turn per room, either in the message response and/or an inspectable endpoint
- web-side mate client helpers for sending a message and parsing raw response data
- a minimal web AI data surface in the existing room page:
  - room-scoped message input
  - send action
  - pending state
  - error state
  - raw structured result output
  - compact agent availability/readiness data where practical
- tests and runtime/E2E verification proving the full data path works

User-directed UI constraint:

- Keep rendering plain and utilitarian. Do not spend this sprint on visual polish, chat bubbles, assistant persona styling, markdown formatting, animations, or proposed canvas action rendering.
- Raw JSON / raw object rendering is acceptable and preferred if it makes validation easier.

## Out of Scope
- No rich chat UI polish, assistant avatar, markdown renderer, animation, or final design language.
- No safe canvas action proposal schema, apply/accept/reject flow, or canvas mutation.
- No direct mate access to the tldraw editor.
- No live model calls or API key requirement.
- No durable conversation history or long-term memory.
- No production auth/permissions/consent model.
- No broad diagnostics dashboard beyond the message path evidence needed for this sprint.

## Behavior Scenarios
- Scenario: User sends a message from the whiteboard room
  - Given a user is viewing a valid room and the web context publisher can publish a latest snapshot
  - When the user sends a message through the minimal AI input
  - Then web sends the message to the server with active room/session metadata
  - And the server prepares a mate turn for the same room

- Scenario: Server combines message with room context before calling mate
  - Given the server has a latest context feed for the room
  - When it receives the room message
  - Then it validates the request
  - And calls the F3 mate turn boundary with the latest snapshot, recent events, and user message
  - And returns the structured mate result to web

- Scenario: User sees context-aware raw AI output
  - Given mate returns a deterministic suggestion or question
  - When web receives the response
  - Then web displays the raw result data associated with the current room
  - And the response includes observations, interpretation, freshness/staleness, output, and memory data

- Scenario: Web surfaces pending and failure state
  - Given a message send is in flight, invalid, or the server rejects it
  - When the user interacts with the AI input
  - Then web exposes pending, validation/error, and recovery state without blocking the canvas

- Scenario: AI surface does not dominate canvas work
  - Given the canvas is the primary workspace
  - When the raw AI data surface is visible
  - Then tldraw remains mounted and interactive
  - And the AI surface stays secondary and simple

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-4.1 | Web provides a room-scoped input path that sends user messages to a server mate endpoint. | Web unit tests for the client helper; E2E sends a message from a room and asserts a server-backed result. |
| AC-4.2 | Server endpoint validates room/message payloads, reads the latest room context feed, invokes F3 mate, and returns structured raw result data. | Server tests for valid message, empty/invalid message, cross-room safety, and context-aware result fields. |
| AC-4.3 | Web renders pending, success raw result, and error state without requiring polished chat UI. | Web unit and E2E tests assert pending/error/success data-test states and raw JSON output. |
| AC-4.4 | Message payloads include enough room/session metadata for server and mate correlation. | Web tests assert metadata in request body; server response includes room id, agent session id when available, and mate result room id. |
| AC-4.5 | Existing tldraw canvas remains primary and interactive while the raw AI surface exists. | E2E verifies canvas smoke still passes and the AI surface does not replace or hide the tldraw host. |
| AC-4.6 | No F5 safe action protocol or canvas mutation behavior is introduced. | Source review plus targeted `rg` check for action/mutation/apply proposal schema names. |
| AC-4.7 | Root quality gate remains green with the new web/server/mate path. | Run focused tests plus `pnpm check`. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
The sprint is mostly deterministic request validation, server orchestration, response mapping, web client state transitions, and E2E message-path behavior. These should be defined by tests before implementation.

Planned evidence:
- RED: add server endpoint tests, web mate client tests, and E2E message-path tests before modules/routes/UI exist.
- GREEN: implement mate package export, server endpoint/orchestrator, web client helper, minimal raw data surface, and E2E flow.
- REFACTOR: keep server route formatting separate from mate-turn orchestration where useful, keep web fetch/state logic separate from CanvasShell rendering, and avoid UI styling work beyond layout safety.

Planned focused coverage:
- successful room message with existing context feed
- empty/invalid message rejection
- quiet room fallback result
- pending/success/error web states
- room/session metadata in request and response
- canvas remains mounted
- no mutation/action proposal exports

### E2E / Runtime Verification
This sprint creates a runnable user path, so E2E is required.

Required runtime path:
- `pnpm --filter mate test`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `git diff --check`
- `pnpm check`

The E2E test should open a room, create or publish a canvas context snapshot, enter a message in the minimal AI input, submit it, and assert that the raw response contains the current room id, non-mutating mate output, observation/interpretation fields, and freshness metadata.

## Modularity & Readability Plan
Expected boundaries:

- `apps/mate`: export the F3 deterministic turn boundary for server reuse without requiring Mastra runtime credentials.
- `apps/server/src/mate/`: server-side message request validation and mate turn orchestration, separate from Fastify route glue if useful.
- `apps/server/src/http/app.ts`: route registration only, using the orchestration boundary.
- `apps/web/src/lib/mate-client.ts`: fetch helper and response types for room mate messages.
- `apps/web/src/components/`: minimal raw mate panel or local component colocated with CanvasShell if small.
- `apps/web/e2e/`: full web -> server -> mate -> web flow.

Avoid a fancy chat component. Avoid copying F3 result schemas into web/server; reuse exported types where possible or parse server responses conservatively. Keep CSS small and only prevent overlap/hidden canvas issues.

## Human Checkpoint
Pause after Sprint 4 because it is the first interactive full-path proof.

Recommended local commands:
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection:
- Start server and web.
- Open a room, add a small text shape, and use the minimal AI input.
- Confirm the result appears as raw structured data with room id, observations, interpretation, freshness, and non-mutating output.
- Confirm the canvas remains usable and no canvas changes are applied by AI.

## Technical Approach
First expose the deterministic F3 mate turn boundary for server import. Add a server mate message service that validates the route/payload, reads F2 context feed, calls mate, and returns a raw response envelope. Then add a small web client helper and a minimal raw panel in `CanvasShell`. Keep UI plain and testable with `data-testid`s. Finish with E2E proving the message path and root quality checks.

## Dependencies
- F1 agent lifecycle diagnostics.
- F2 room context feed endpoints.
- F3 deterministic mate ingestion boundary.

## Estimated Complexity
M
