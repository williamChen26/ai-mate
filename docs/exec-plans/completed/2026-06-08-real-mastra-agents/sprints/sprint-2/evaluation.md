# Sprint 2 Evaluation

## Verdict

PASS

## Acceptance Criteria Review

- AC-2.1: PASS. `createCanvasAgentPromptPack` exists with deterministic unit
  tests.
- AC-2.2: PASS. Prompt pack includes trigger/path, room id, selection, selected
  shapes, snapshot freshness, bounded recent operations, and safety policy.
- AC-2.3: PASS. Prompt text explicitly distinguishes current snapshot facts
  from recent operation trajectory.
- AC-2.4: PASS. `normalizeCanvasAgentOutput` supports conversation plain text
  and full `agent-output.v1` validation.
- AC-2.5: PASS. Completion path rejects plain text and unsupported output; it
  accepts valid `completion-proposal` only.
- AC-2.6: PASS. New non-obvious prompt/normalization/runtime comments are in
  Chinese and explain the safety reasons.

## Behavior Scenario Review

- Agent receives canvas semantics, not raw unexplained JSON: PASS.
- Conversation output remains normal answer data: PASS.
- Completion output is machine-readable: PASS.
- Invalid model output falls back safely: PASS.

## Quality Evidence

`pnpm check` passed.

Observed covered results:

- Shared: 11 tests passed.
- Mate: 26 tests passed.
- Server: 40 tests passed.
- Web unit: 53 tests passed.
- Web E2E: 10 tests passed.
- Typecheck/build/smoke commands passed across packages.

## Residual Risk

- The prompt pack is now ready for real agents, but live DeepSeek execution is
  still not wired into server/web.
- Sprint 3 should decide the minimal streaming transport/state for
  Conversation Agent.

## Checkpoint

Developer should inspect the prompt/context pack shape before Sprint 3 so the
real Conversation Agent sees the intended board semantics.
