# Sprint 4 Contract: Conversation Gateway Agent Path

## Feature
F4: Conversation Gateway Agent Path

## Scope
Refine the current raw Mate message panel into a minimal direct conversation gateway path that sends user messages to the same room-aware AI Gateway and agent turn boundary used by AI Drop. This sprint should make direct conversation readable as a conversation surface with pending, success, error, and context-stale states while keeping raw structured metadata inspectable for development.

The conversation path must remain distinct from AI Drop preview and `Tab` acceptance. Conversation responses may render conversational answers, questions, suggestions, no-op/refusal reasons, and safe action proposal metadata, but they must not create AI Drop previews, invoke `window.__PSG_AI_DROP__`, intercept `Tab`, or mutate tldraw state by default. Any existing raw `/rooms/:roomId/mate/messages` compatibility should be preserved unless a narrow adapter rename is needed; no real provider integration is part of this sprint.

## Out of Scope
- No broad AI Edit or direct non-completion canvas mutation.
- No new AI Drop preview behavior, no changes to the `Tab` acceptance contract, and no automatic activation of completion proposals from the conversation path.
- No final chat UX, rich message threading, markdown renderer, prompt studio, animations, or broad UI polish.
- No real LLM/provider integration, credentials, streaming, durable chat history, auth, billing, or multi-agent planner.
- No generic agent framework rewrite or replacement of the existing server/mate gateway contracts.
- No F5 diagnostics dashboard expansion beyond the raw request/response metadata needed to inspect this conversation path.

## Behavior Scenarios
- Scenario: User asks the agent from the room
  - Given the user is in a valid tldraw room with the backend sync state ready
  - When they submit a non-empty message through the conversation gateway
  - Then the web app publishes the latest room snapshot, records a `chat-boundary` operation, and posts the message to the room-scoped mate endpoint
  - And the server maps the message to an AI Gateway `conversation` trigger with room context, recent operations, chat boundary metadata, and source identity
  - And the UI shows a pending state until the response resolves

- Scenario: Agent answer renders without canvas mutation
  - Given the room agent returns a `conversation-answer`, `question`, `suggestion`, or `no-op` output
  - When the UI receives the response
  - Then a minimal conversation result appears in the conversation surface
  - And the raw structured response remains inspectable
  - And no AI Drop preview is created, no `Tab` acceptance path is armed, and no canvas edit is applied

- Scenario: Conversation can reference canvas context
  - Given the current room contains selected or visible canvas content and recent room operations
  - When the user asks a context-aware question
  - Then the agent answer can use observed canvas facts from the gateway request and mate turn
  - And the UI exposes the answer together with enough metadata to see the gateway trigger kind, output kind, and context freshness

- Scenario: Stale or incomplete context is visible
  - Given the context feed is stale or missing required gateway inputs such as a latest snapshot, recent operations, or chat boundary
  - When the conversation turn returns
  - Then the UI marks the result as context-stale or context-incomplete without throwing
  - And the raw metadata identifies the freshness/readiness state used for the turn

- Scenario: Conversation remains separated from AI Drop preview and Tab acceptance
  - Given a conversation turn returns any output kind, including a malformed or unexpected `completion-proposal`
  - When the web conversation surface handles the response
  - Then it classifies the result for conversation display or refusal only
  - And it does not call the AI Drop runtime, does not render `ai-drop-preview`, and does not let `Tab` apply anything from that conversation response

- Scenario: Current raw diagnostics remain inspectable
  - Given this project is still validating AI plumbing
  - When a developer requests diagnostics after a conversation turn
  - Then they can inspect structured room metadata, latest mate response, gateway routing, freshness, output kind, and validation state
  - And the diagnostics path remains developer-facing rather than a polished product dashboard

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| AC-4.1 | The conversation gateway uses the existing Sprint 1 AI Gateway `conversation` trigger and Sprint 2 agent turn concepts, including observation, decision summary, tool-call metadata, final output kind, source identity, chat boundary, snapshot facts, recent operations, and freshness. | Focused server/mate tests assert posted room messages still produce `gateway.trigger.kind === "conversation"` and inspectable `mate.agentTurn` data; run `pnpm --filter @production-spec-graph/server test` and `pnpm --filter mate test` if mate code changes. |
| AC-4.2 | The web conversation surface supports non-empty message submit plus pending, success, error, context-stale, and context-incomplete states for direct agent answers. | Focused web unit/component tests cover state transitions and response classification; run `pnpm --filter @production-spec-graph/web test:unit`. |
| AC-4.3 | Conversational outputs render as direct conversation results without creating AI Drop previews or mutating canvas state by default. | Web unit tests assert `conversation-answer`, `question`, `suggestion`, and `no-op` outputs are displayed in conversation state and do not call the AI Drop runtime or apply boundary; E2E checks no `ai-drop-preview` appears and shape count is unchanged after a conversation answer. |
| AC-4.4 | The conversation path explicitly refuses or quarantines `completion-proposal` outputs instead of routing them into AI Drop from the conversation surface. | Focused web tests inject a `completion-proposal` response through the conversation handler and assert a conversation refusal/unsupported-output state, no `window.__PSG_AI_DROP__.activate` call, and no active preview. |
| AC-4.5 | Existing raw mate route behavior is preserved through a documented compatibility path: `POST /rooms/:roomId/mate/messages`, `GET /rooms/:roomId/mate`, and diagnostics still return structured raw data. | Server route tests plus web E2E continue to post a room message, inspect raw response/diagnostics metadata, and validate non-mutating output; run `pnpm --filter @production-spec-graph/server test` and `pnpm --filter @production-spec-graph/web test:e2e`. |
| AC-4.6 | Stale and incomplete context are represented visibly in the conversation UI using gateway freshness/readiness metadata rather than silently treating the answer as fully current. | Focused web tests classify stale and incomplete gateway responses; E2E or server fixture runtime check exercises at least one stale/incomplete conversation response and observes the UI state. |
| AC-4.7 | Message validation remains boundary-safe: empty messages are blocked client-side, malformed server responses and network/server errors produce inspectable error states, and external response shapes are validated before display. | Web unit tests for empty, network failure, server failure, malformed success payload, and unsupported output; existing server validation tests continue to cover invalid payloads. |
| AC-4.8 | UI scope stays logic-first and minimal: no broad visual polish, no AI Edit, no provider integration, and no changes that weaken AI Drop preview/`Tab` acceptance behavior from Sprint 3. | Code review plus E2E coverage that existing AI Drop preview/acceptance tests still pass; run `pnpm --filter @production-spec-graph/web test:e2e`. |
| AC-4.9 | New or changed non-obvious modules/functions include concise Chinese comments explaining feature/module/function purpose and why, especially around conversation/AI Drop separation, output classification, and freshness states. | Code review plus `build-log.md` notes identify the Chinese comments added or explain why no new non-obvious logic required comments. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
- This sprint includes deterministic response classification, UI state transitions, boundary validation of external server response shapes, and separation between conversation outputs and AI Drop preview activation. These are core state and protocol behaviors where focused tests should define correctness before implementation.
- The visual work is intentionally minimal, but the conversation state adapter and output classifier are high-risk because the current web path auto-activates `completion-proposal` outputs into AI Drop. Tests should pin the new separation before the UI wiring changes.

Planned evidence:
- RED: Write focused web tests first for conversation response classification, pending/success/error/stale/incomplete states, empty-message blocking, malformed response handling, and explicit refusal of `completion-proposal` without AI Drop activation. If server mapping changes, add server tests for conversation gateway metadata before implementation.
- GREEN: Implement the smallest conversation state adapter/client validation and minimal panel wiring needed to pass those tests while preserving existing endpoints.
- REFACTOR: Keep response parsing/classification separate from React rendering and keep conversation wiring separate from AI Drop runtime while tests remain green.

### E2E / Runtime Verification
Required final behavior checks:
- Run `pnpm --filter @production-spec-graph/web test:unit` for conversation state, client validation, and output separation.
- Run `pnpm --filter @production-spec-graph/server test` if server route or response-envelope code changes.
- Run `pnpm --filter @production-spec-graph/web test:e2e` with a scenario that opens a room, creates canvas context, sends a conversation message, observes a rendered direct answer, verifies raw metadata remains inspectable, verifies no `ai-drop-preview` appears, and verifies canvas shape count is unchanged.
- Run `pnpm check` before handoff unless a documented tool/permission issue prevents one sub-check.

If a full stale/incomplete browser scenario is brittle in the existing E2E harness, a focused unit/component fixture may cover stale/incomplete UI classification, but the E2E command must still prove the normal room message reaches the agent and renders an answer without AI Drop activation or canvas mutation.

## Modularity & Readability Plan
- Reuse the existing shared `agentOutputSchema`, `conversation-answer` output kind, gateway request metadata, and mate response envelope; do not introduce a parallel conversation protocol.
- Prefer a small web-side conversation response/state module that validates the raw mate response, extracts display-safe output text/state, classifies freshness/readiness, and rejects unsupported or malformed shapes.
- Keep React changes in `apps/web/src/components/canvas-shell.tsx` minimal. If the panel logic grows, extract a cohesive conversation component rather than expanding the canvas shell with unrelated parsing and state logic.
- Preserve the Sprint 3 AI Drop modules as a separate runtime. Conversation code must not call `activateAiDropProposal`, `acceptAiDropProposal`, `applyAiDropProposalToEditor`, or `window.__PSG_AI_DROP__`.
- Keep server orchestration in `apps/server/src/mate/room-mate-service.ts` only if compatibility or response metadata needs a narrow adjustment; update provider/shared contracts before consumers if any contract shape changes.
- Use immutable state transitions and create new conversation result objects instead of mutating raw response data, gateway objects, mate results, or AI Drop state.
- Add concise Chinese comments around non-obvious conversation gateway boundaries, output classification, freshness/readiness mapping, and the explicit separation from AI Drop. Avoid commenting trivial JSX, assignments, or obvious TypeScript.
- Tests should act as documentation for why direct conversation may display answers and metadata but must not create preview state or arm `Tab`.

## Human Checkpoint
Pause after Sprint 4 because it creates the second locally runnable AI gateway path and changes the current raw Mate user surface.

Suggested local commands:
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

What to inspect:
- Open a room canvas, add or select canvas content, and send a direct conversation message.
- Confirm the conversation surface shows pending, then a direct answer/question/suggestion/no-op state with raw metadata still inspectable.
- Confirm context-stale or context-incomplete metadata is visible when fixture/runtime conditions produce it.
- Confirm no AI Drop preview appears from conversation responses and pressing `Tab` after a conversation answer does not apply a proposal.
- Re-run or manually inspect the Sprint 3 AI Drop path to confirm deterministic preview and `Tab` acceptance still work only through the explicit AI Drop runtime.

## Technical Approach (brief)
Add a small web-side conversation result adapter that validates the existing raw mate response envelope, extracts display-safe direct response content, classifies pending/success/error/stale/incomplete/unsupported states, and preserves raw metadata for inspection. Wire the existing room message form to this adapter and keep the UI intentionally simple. Remove the current conversation-to-AI-Drop auto-activation behavior so completion proposals returned on the conversation path are refused or shown as unsupported metadata rather than previewed. Keep the server and mate contracts unchanged unless a narrow compatibility adjustment is required for clearer metadata.

## Dependencies
- Sprint 1 F1 AI Gateway request/context/freshness contract is completed and passed.
- Sprint 2 F2 agent turn boundary and `conversation-answer` output kind are completed and passed.
- Sprint 3 F3 AI Drop proposal lifecycle, preview surface, and `Tab` acceptance boundary are completed and passed.
- Existing `POST /rooms/:roomId/mate/messages`, `GET /rooms/:roomId/mate`, room diagnostics, web context publishing, and web E2E infrastructure.

## Estimated Complexity
M
