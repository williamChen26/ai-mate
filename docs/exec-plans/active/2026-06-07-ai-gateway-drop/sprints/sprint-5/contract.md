# Sprint 5 Contract: Gateway Observability and Safety Diagnostics

## Feature
F5: Gateway Observability and Safety Diagnostics

## Scope
Add developer-facing, bounded diagnostics for both existing AI Gateway paths:

- AI Drop completion preview and `Tab` acceptance/refusal lifecycle.
- Direct conversation requests through the room-scoped mate endpoint.

Diagnostics must expose recent gateway turn metadata, trigger kind, context freshness/readiness, agent decision/tool-call/output metadata, output validation, AI Drop preview/apply/refusal status, and explicit no-hidden-canvas-mutation evidence. The implementation should keep diagnostics raw and inspectable for development/evaluation, not turn them into a polished product dashboard.

This sprint may add small structured diagnostic summaries/adapters around the existing server diagnostics endpoint, web diagnostics client, AI Drop proposal lifecycle, conversation gateway classifier, and E2E/runtime assertions. Diagnostic payloads must remain bounded and must not store full private prompt history, broad prompt transcripts, durable telemetry, or unbounded raw agent traces.

## Out of Scope
- No broad polished diagnostics dashboard, analytics UI, charts, filtering, or multi-room observability console.
- No real provider integration, model routing, streaming, prompt studio, prompt history storage, or durable telemetry backend.
- No AI Edit, arbitrary canvas action executor, or non-completion direct canvas mutation.
- No changes that broaden AI Drop beyond preview/accept/refusal diagnostics.
- No changes that route conversation responses into AI Drop or arm `Tab`.
- No persistence beyond the existing process-local room/mate/diagnostics state.
- No large framework rewrite of gateway, mate, web canvas, or diagnostics contracts.

## Behavior Scenarios
- Scenario: Developer inspects an AI Drop turn
  - Given an AI Drop completion proposal was activated from selected canvas context
  - When the developer inspects web-visible diagnostics or runtime state
  - Then diagnostics show the gateway path as `completion` or `ai-drop`
  - And they include selected target context, freshness, output kind, proposal id, preview state, and current refusal/apply status
  - And they show whether `Tab` acceptance applied, failed, or was refused

- Scenario: Developer inspects a conversation turn
  - Given a user sent a direct message through the conversation gateway
  - When diagnostics are requested for the room
  - Then diagnostics show request metadata, gateway trigger kind, context freshness/readiness, agent decision, tool-call metadata, final output kind, and output validation status
  - And diagnostics include stale or unavailable context state without requiring the developer to infer it from the full raw response

- Scenario: Unsafe or stale output is refused
  - Given an agent output is malformed, unsupported, stale, or mismatched to the active AI Drop selection/context
  - When the server, conversation classifier, or AI Drop lifecycle validates it
  - Then the output is refused or quarantined without canvas mutation
  - And diagnostics record a developer-readable reason such as malformed output, unsupported output, freshness mismatch, selection mismatch, target text changed, blocked proposal, or no active proposal

- Scenario: Diagnostics prove no hidden canvas mutation
  - Given AI Drop preview is active or a conversation answer/proposal has returned
  - When the developer checks diagnostics and runtime behavior before explicit acceptance
  - Then diagnostics and tests show preview-only/non-mutating state before `Tab`
  - And conversation output never creates an AI Drop preview, arms `Tab`, or mutates canvas state
  - And only the explicit AI Drop apply boundary can report applied shape ids after fresh `Tab` acceptance

- Scenario: Diagnostics remain bounded and local
  - Given multiple gateway turns may happen in one room
  - When diagnostics are generated
  - Then payloads keep only recent bounded metadata needed for debugging
  - And they avoid storing full user prompt history, unbounded raw traces, or durable telemetry records

- Scenario: Quality checks document runnable behavior
  - Given this sprint changes developer-facing diagnostics for runnable gateway behavior
  - When Generator hands work to Evaluator
  - Then `build-log.md` records focused tests, E2E/runtime commands, and manual inspection steps for both AI Drop and conversation diagnostics

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| AC-5.1 | Room diagnostics include recent AI Gateway turn metadata for conversation path: trigger kind, request id or equivalent correlation, context freshness/readiness, agent decision/tool-call metadata, final output kind, and output validation status. | Focused server tests against `GET /rooms/:roomId/diagnostics`; run `pnpm --filter @production-spec-graph/server test`. |
| AC-5.2 | Web-visible AI Drop diagnostics expose bounded proposal lifecycle metadata: output kind, proposal id, target shape id, preview status, freshness/selection validation status, `Tab` acceptance state, applied shape ids only after success, and refusal/failure reasons. | Focused web unit tests for AI Drop diagnostic/state helpers plus E2E runtime inspection of `window.__PSG_AI_DROP__` or a dedicated developer diagnostics hook; run `pnpm --filter @production-spec-graph/web test:unit` and `pnpm --filter @production-spec-graph/web test:e2e`. |
| AC-5.3 | Diagnostics identify completion tool calls, no-op/refusal decisions, conversation outputs, completion proposals, canvas-action proposals, and unsupported/malformed output validation states without requiring a full raw prompt transcript. | Focused mate/server/web tests using deterministic fixtures for completion, no-op, conversation answer, malformed output, unsupported output, stale proposal, and blocked proposal; run affected package tests. |
| AC-5.4 | Malformed, unsupported, stale, blocked, or selection-mismatched outputs are rejected or quarantined without canvas mutation, and diagnostics record the reason. | Web unit tests for AI Drop and conversation refusal cases, server tests for invalid/blocked mate outputs, and E2E assertions that shape count is unchanged after refused conversation/AI Drop attempts. |
| AC-5.5 | Diagnostic payloads are bounded and local: they do not store full private prompt history, unbounded reasoning traces, durable telemetry records, or raw prompt archives beyond the latest bounded local response/debug metadata already needed for this MVP. | Tests or snapshot assertions verify bounded metadata shape; code review confirms no new durable store or prompt-history collection was added. |
| AC-5.6 | Diagnostics and manual instructions cover both AI Drop and conversation behavior, including no hidden canvas mutation and explicit apply/refusal states. | `build-log.md` includes commands, E2E/runtime evidence, and human checkpoint instructions for both paths. |
| AC-5.7 | New or changed non-obvious modules/functions include concise Chinese comments explaining feature/module/function purpose and why, especially around diagnostics boundaries, safety validation, bounded payloads, and no-mutation evidence. | Code review plus `build-log.md` notes identify the Chinese comments added or explain why no new non-obvious logic required comments. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
- This sprint touches deterministic diagnostic shaping, validation/refusal mapping, bounded payload contracts, and safety state transitions across server and web boundaries.
- The main risks are overexposing unbounded raw data, losing refusal reasons, or implying canvas mutation happened outside the explicit AI Drop apply boundary. Focused tests should define those behaviors before implementation.

Planned evidence:
- RED: Add focused tests first for room diagnostics gateway summaries, AI Drop diagnostic status mapping, conversation quarantine/refusal diagnostics, malformed/stale/selection-mismatch reasons, and bounded payload shape. The initial failures should show missing diagnostic fields/helpers or missing assertions.
- GREEN: Implement the smallest diagnostics summaries/adapters needed for the tests to pass while preserving existing raw diagnostics and gateway behavior.
- REFACTOR: Keep diagnostics shaping separate from React rendering, tldraw mutation wiring, and mate execution while all focused tests remain green.

### E2E / Runtime Verification
Required final behavior checks:
- Run `pnpm --filter @production-spec-graph/server test` for room diagnostics and mate output validation coverage.
- Run `pnpm --filter @production-spec-graph/web test:unit` for AI Drop and conversation diagnostic/refusal helpers.
- Run `pnpm --filter @production-spec-graph/web test:e2e` with scenarios that:
  - send a conversation message, fetch diagnostics, and observe gateway trigger/output/validation metadata;
  - activate an AI Drop proposal, inspect preview diagnostics before `Tab`, press `Tab`, and observe applied diagnostics only after explicit acceptance;
  - refuse at least one stale or selection-mismatched AI Drop proposal and observe no canvas mutation plus a refusal reason.
- Run `pnpm check` before handoff unless a documented tool/permission issue prevents one sub-check.

If the server diagnostics endpoint cannot directly observe browser-local AI Drop lifecycle because AI Drop preview state is intentionally web-local and unsynced, the E2E fallback must inspect a bounded web developer diagnostics hook or runtime API for AI Drop status while still using the server endpoint for conversation diagnostics. The fallback must explain why that split is correct for this sprint.

## Modularity & Readability Plan
- Keep server room diagnostics aggregation in `apps/server/src/diagnostics/room-diagnostics.ts` or a small adjacent helper. It should summarize latest gateway/mate metadata without storing a durable history.
- Keep mate service safety validation in `apps/server/src/mate/room-mate-service.ts`; extract a helper only if diagnostics and validation start mixing unrelated concerns.
- Keep AI Drop diagnostic shaping in `apps/web/src/lib/ai-drop-proposal.ts` or a small adjacent web lib so the state machine remains testable without React or tldraw.
- Keep conversation diagnostic/status mapping in `apps/web/src/lib/conversation-gateway.ts`; do not let conversation code call AI Drop activation or apply APIs.
- Keep `apps/web/src/components/canvas-shell.tsx` changes narrow. If UI/runtime diagnostics wiring grows, extract a small developer diagnostics component or hook instead of expanding the canvas shell with parsing logic.
- Preserve immutable patterns: derive diagnostic summary objects from existing gateway, mate, conversation, and AI Drop state rather than mutating raw responses or proposal state.
- Add concise Chinese comments to new or changed non-obvious modules/functions explaining what the diagnostics boundary does and why it is bounded/local/non-mutating. Avoid comments for trivial JSX, type aliases, and obvious assignments.
- Tests should double as documentation for refusal reasons, bounded payloads, and why server diagnostics cover conversation while web-local diagnostics cover unsynced AI Drop preview lifecycle.

## Human Checkpoint
Pause after Sprint 5 because this completes the developer-facing safety/debug loop for both gateway paths.

Suggested local commands:
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

What to inspect:
- Open a room, send a direct conversation message, click Diagnostics, and confirm gateway trigger, context freshness/readiness, agent decision/tool-call/output metadata, and output validation are visible.
- Activate an AI Drop text completion, inspect the bounded web diagnostics/runtime state before `Tab`, and confirm it is preview-only with no canvas mutation.
- Press `Tab` for a fresh AI Drop proposal and confirm only the explicit apply boundary reports applied shape ids.
- Change selection before `Tab` and confirm diagnostics show a refusal reason and shape count remains unchanged.
- Confirm diagnostic payloads do not include full prompt history, unbounded reasoning traces, durable telemetry, or a polished dashboard surface.
- Review Chinese comments around new diagnostics/safety helpers for usefulness and restraint.

## Technical Approach (brief)
Add bounded diagnostic summary fields around the existing room diagnostics, mate validation, AI Drop proposal lifecycle, and conversation classifier. Reuse existing gateway request, agent turn, output validation, and proposal state contracts instead of introducing a parallel telemetry protocol. Keep server diagnostics responsible for room/mate/conversation metadata and web-local diagnostics responsible for unsynced AI Drop preview/apply/refusal state. Validate final behavior with focused tests plus E2E checks that prove diagnostics and no-hidden-mutation guarantees for both gateway paths.

## Dependencies
- Sprint 1 F1 AI Gateway request/context/freshness contract is completed and passed.
- Sprint 2 F2 agent turn boundary, tool-call metadata, no-op/refusal, and output contracts are completed and passed.
- Sprint 3 F3 AI Drop proposal lifecycle, preview, `Tab` acceptance, and explicit apply boundary are completed and passed.
- Sprint 4 F4 conversation gateway surface, response classification, and conversation/AI Drop separation are completed and passed.
- Existing `GET /rooms/:roomId/diagnostics`, `POST /rooms/:roomId/mate/messages`, web diagnostics client, AI Drop runtime, and web E2E infrastructure.

## Estimated Complexity
M
