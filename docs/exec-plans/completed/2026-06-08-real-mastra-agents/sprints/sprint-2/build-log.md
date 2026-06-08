# Sprint 2 Build Log

## Summary

Implemented a deterministic canvas agent prompt/context pack and model output
normalization boundary. Fake/real runtime adapters now receive a tested
`promptPack` instead of rebuilding canvas context themselves.

## Behavior Scenario Evidence

- Scenario: Agent receives canvas semantics, not raw unexplained JSON
  - Added `createCanvasAgentPromptPack` in
    `apps/mate/src/context/canvas-agent-prompt.ts`.
  - The pack includes system instructions, compact user prompt JSON,
    selection, selected shape summaries, freshness, bounded recent operations,
    and safety policy.
  - Tests assert the prompt explains structured canvas context and ordered
    intent evidence.

- Scenario: Conversation output remains normal answer data
  - `normalizeCanvasAgentOutput` converts plain conversation text into
    `conversation-answer` `agent-output.v1`.
  - No answer tool is introduced.

- Scenario: Completion output is machine-readable
  - Completion path rejects plain text with
    `plain-text-not-supported-for-completion`.
  - Completion path accepts only schema-valid `completion-proposal`.

- Scenario: Invalid model output falls back safely
  - Normalizer returns bounded `{ ok: false, reason }` for unsupported or
    malformed output.
  - Runtime adapter request now carries `promptPack`, and existing runtime
    fallback behavior remains unchanged.

## TDD Evidence

- RED: Added tests for prompt pack semantics, bounded operation use,
  conversation text normalization, completion text rejection,
  completion-proposal acceptance, and conversation/completion path mismatch.
- GREEN: Implemented `canvas-agent-prompt.ts` and threaded `promptPack` into
  runtime adapter requests.
- REFACTOR: Kept prompt construction separate from Mastra agent definitions and
  output normalization separate from model execution.

## Modularity Notes

- `canvas-agent-prompt.ts` owns prompt/context pack generation and model output
  normalization.
- `agent-runtime.ts` remains responsible for runtime mode/adapters and now
  exposes `promptPack` to adapters.
- `mate-turn.ts` only constructs the prompt pack at the runtime boundary.

## Quality Commands

Focused commands run:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter mate build
pnpm --filter mate smoke
pnpm --filter @production-spec-graph/server typecheck
```

Full handoff command run:

```sh
pnpm check
```

Result: PASS. Full check included shared tests/typecheck/build, mate
tests/typecheck/build/smoke, server tests/typecheck/build/smoke, web
unit/typecheck/build, and 10 Playwright E2E tests.

## Human Checkpoint

Pause here before Sprint 3. Inspect:

- `apps/mate/src/context/canvas-agent-prompt.ts`
- `apps/mate/src/context/_spec/canvas-agent-prompt.test.ts`
- `apps/mate/src/context/agent-runtime.ts`
- `apps/mate/src/context/mate-turn.ts`

What to verify:

- The prompt pack explains tldraw canvas semantics enough for a model to reason
  from structured context.
- Recent operations are treated as ordered intent evidence, separate from the
  current snapshot.
- Conversation answers are normal final data; AI Drop completion stays strict
  structured output.
