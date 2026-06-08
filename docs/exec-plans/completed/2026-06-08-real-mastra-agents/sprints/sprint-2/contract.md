# Sprint 2 Contract: Canvas Context Prompt Pack and Agent Output Validation

## Scope

Implement F2 from the spec. This sprint gives the real canvas agents a
deterministic, model-readable prompt/context pack and a safe output
normalization boundary. Conversation final answers should remain normal final
data, while AI Drop completion must stay strict structured output.

This sprint does not call DeepSeek directly, does not add web streaming, and
does not wire a server-backed AI Drop endpoint yet.

## Behavior Scenarios

- Scenario: Agent receives canvas semantics, not raw unexplained JSON
  - Given a gateway request includes a snapshot and recent operation stack
  - When mate builds a canvas agent prompt pack
  - Then the prompt explains tldraw shape semantics, selected shapes, bounds,
    freshness, operation ordering, and safety boundaries
  - And it separates current snapshot facts from recent user trajectory

- Scenario: Conversation output remains normal answer data
  - Given a conversation agent returns plain assistant text
  - When mate normalizes the model output
  - Then it becomes a valid `conversation-answer` `agent-output.v1`
  - And no answer tool is required

- Scenario: Completion output is machine-readable
  - Given the AI Drop completion path receives model output
  - When mate normalizes it
  - Then only a valid `completion-proposal` is accepted
  - And plain text or unsupported output is rejected safely

- Scenario: Invalid model output falls back safely
  - Given the model returns malformed, empty, stale, or unsupported output
  - When mate validates it
  - Then the invalid data is refused with a bounded reason
  - And no canvas mutation or AI Drop preview can be created from it

## Acceptance Criteria

- AC-2.1: Add a readable prompt/context pack builder for canvas agents with
  deterministic unit tests.
- AC-2.2: The prompt pack includes trigger/path, room id, selection, selected
  shape summaries, snapshot freshness, bounded recent operations, and explicit
  safety policy.
- AC-2.3: The prompt pack explains that recent operations are ordered intent
  evidence and distinct from current snapshot state.
- AC-2.4: Add output normalization for conversation plain text and structured
  agent output, preserving `agentOutputSchema` validation.
- AC-2.5: AI Drop completion normalization only accepts
  `completion-proposal`; unsupported model output returns a safe invalid result.
- AC-2.6: New non-obvious functions include Chinese comments explaining why
  context/prompt building and output validation are separate from model calls.

## TDD Decision

Use TDD for prompt pack construction and output normalization.

Expected RED/GREEN evidence:

- RED: tests fail because the prompt pack builder and output normalizer do not
  exist.
- GREEN: tests pass after adding deterministic prompt/context serialization and
  strict output normalization.
- REFACTOR: keep prompt construction, output parsing, and Mastra agent
  definitions separate.

Strict TDD is skipped for prompt wording microcopy; tests should assert the
presence of important concepts and structured fields rather than exact full
prompt prose.

## Implementation Plan

1. Add a module such as `apps/mate/src/context/canvas-agent-prompt.ts`.
2. Build compact prompt pack data from `GatewayRequest`, `RoomContextFeed`, and
   selected runtime path.
3. Bound shapes and recent operations in the prompt pack.
4. Add output normalization helpers for:
   - plain conversation text -> `conversation-answer`
   - valid `agent-output.v1` -> accepted when compatible with path
   - invalid/unsupported output -> bounded rejection reason
5. Thread the prompt pack into runtime adapter requests so fake/real adapters
   can consume it in Sprint 3/4.
6. Add tests covering conversation and completion paths.

## Modularity and Readability Plan

- Keep prompt/context pack construction in one cohesive module.
- Keep output normalization pure and framework-independent.
- Do not mix prompt text into server routes or React components.
- Keep Mastra agent definitions focused on agent instructions; detailed
  per-turn canvas context should come from this new prompt pack.

## Verification Plan

Focused commands:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter mate build
pnpm --filter mate smoke
```

If server diagnostics or shared contracts change:

```sh
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
```

Handoff command if practical:

```sh
pnpm check
```

## Human Checkpoint Recommendation

Pause after this sprint. The developer should inspect the generated prompt pack
shape and normalization rules before we wire real conversation streaming in
Sprint 3.
