# Sprint 5 Contract: ReAct Tooling and Agent Diagnostics

## Feature

F5: ReAct Tooling and Agent Diagnostics

## Scope

Add the first product-shaped ReAct tool boundaries for canvas agents and expose
bounded tool-call diagnostics. This sprint keeps ordinary conversation answers
as final output data, not as a required answer tool. AI Drop completion may use
a proposal tool because it represents a meaningful non-mutating action proposal.

## Behavior Scenarios

- Scenario: Completion tool creates proposal data
  - Given the Completion Agent decides a candidate is appropriate
  - When it uses the completion proposal tool
  - Then the tool returns typed `completion-proposal` data
  - And the tool does not mutate the canvas

- Scenario: Conversation uses final answer, not answer tool
  - Given the Conversation Agent can answer directly
  - When it completes the turn
  - Then the final answer is normalized as `conversation-answer`
  - And no mandatory answer tool appears in agent or runtime diagnostics

- Scenario: Tool calls are inspectable
  - Given a fake or real runtime reports tool calls
  - When diagnostics are requested
  - Then diagnostics show bounded tool names, statuses, optional output kind,
    and fallback state
  - And diagnostics do not store prompt text or full prompt history

- Scenario: Deterministic fallback remains explainable
  - Given provider output is invalid or unavailable
  - When fallback is used
  - Then runtime metadata identifies mode, path, fallback source, failure
    reason, and bounded tool-call summary if one was reported

## Acceptance Criteria

- AC-5.1: Product Mastra tools exist for read-only canvas context access and
  completion proposal generation.
- AC-5.2: `mateConversationAgent` is not configured with a mandatory
  `answerConversationTool`; normal text remains valid final conversation output.
- AC-5.3: Runtime metadata and room diagnostics distinguish deterministic,
  fake, and real turns and expose bounded tool-call summaries.
- AC-5.4: Diagnostics avoid raw prompt text, full prompt history, and raw model
  payload storage.
- AC-5.5: Tests cover tool-call metadata, fallback metadata, invalid output
  refusal, and conversation-without-answer-tool behavior.

## TDD Decision

Use focused TDD for deterministic runtime metadata and diagnostics because
those are stable contracts. Strict TDD is skipped for Mastra `createTool`
integration because the framework object is mostly type-checked at build time
and live tool execution depends on Mastra runtime behavior. We will still add
schema/helper tests around product tool payloads where practical.

## Implementation Plan

1. Add product canvas tool definitions under `apps/mate/src/mastra/tools/`.
2. Register tools on the relevant canvas agents:
   - conversation: read-only canvas context tool only
   - completion: read-only canvas context tool plus completion proposal tool
3. Extend mate runtime metadata with a bounded `toolCalls` array and
   `toolCallCount`.
4. Normalize fake/real runtime adapter-reported tool calls into metadata for
   success and fallback cases.
5. Surface runtime tool-call diagnostics through server room diagnostics.
6. Add focused tests and update harness sprint records.

## Runtime / E2E Verification Plan

This sprint mainly changes logic and diagnostics. Run:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
pnpm --filter @production-spec-graph/web test:unit
pnpm --filter @production-spec-graph/web typecheck
```

If practical, run `pnpm check` before final handoff. Browser E2E is not required
for this sprint unless diagnostics changes affect web behavior.

## Modularity And Readability Plan

- Keep tool definitions in one cohesive file near Mastra agent definitions.
- Keep runtime tool-call metadata small and schema-validated.
- Avoid adding a generic tool framework beyond the two first product tools.
- Add Chinese comments to new non-obvious functions and safety decisions.

## Human Checkpoint

After Sprint 5, inspect diagnostics for a fake completion turn and confirm:

- conversation answers do not require an answer tool
- completion tool calls are visible as bounded summaries
- prompt text and raw model payloads are not stored in diagnostics
