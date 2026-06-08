# Sprint 1 Build Log

## Summary

Implemented the provider-backed Mastra runtime adapter and wired it into the
server's default mate service when real mode is configured and DeepSeek is
ready.

## Behavior Scenario Evidence

- Scenario: Real mode creates a Mastra adapter
  - Added `createConfiguredMastraMateAgentRuntimeAdapter`.
  - Tests prove it returns undefined by default and returns a real adapter for
    `MATE_AGENT_MODE=real` plus `DEEPSEEK_API_KEY`.
  - Server default mate service now calls this helper.

- Scenario: Conversation uses Mastra final text
  - Adapter routes conversation requests to `mateConversationAgent`.
  - Fake Mastra tests prove final text normalizes to `conversation-answer`.
  - No answer tool was added.

- Scenario: Completion uses structured output
  - Adapter routes completion requests to `aiDropCompletionAgent`.
  - Completion generation passes `structuredOutput` with the shared
    `completionProposalOutputSchema`.
  - Existing mate output normalization remains the final schema gate.

- Scenario: Provider failures fall back safely
  - Adapter catches generation errors and returns a failed runtime result with a
    bounded reason.
  - `prepareMateTurnWithRuntime` falls back to deterministic output.

## TDD Evidence

- RED: Added fake-agent adapter tests for configured helper behavior,
  conversation routing, completion structured output, tool-call metadata, and
  provider errors.
- GREEN: Implemented adapter, package export, server default wiring, and README
  usage notes.
- REFACTOR: Kept Mastra-specific `generate()` handling inside
  `mastra-runtime-adapter.ts`.

## Modularity Notes

- `mate/runtime` is the provider-backed runtime entrypoint.
- Server code only knows about the configured helper, not Mastra APIs.
- Runtime tool-call extraction remains bounded and avoids prompt/tool argument
  storage.

## Quality Commands

Passed:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter mate build
pnpm --filter mate smoke
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
pnpm --filter @production-spec-graph/server build
pnpm --filter @production-spec-graph/server smoke
```

`pnpm check` was not rerun in this sprint because the previous full run in this
same session reached Playwright and was blocked by an already-running
`127.0.0.1:3001/ready` service. The changed packages were covered by focused
tests, typecheck, build, and smoke.

## Human Checkpoint

To manually test the real provider path:

```sh
MATE_AGENT_MODE=real DEEPSEEK_API_KEY=... pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/web dev
```

Then trigger Mate conversation or AI Drop completion and inspect room
diagnostics. A successful provider turn should show
`runtime.outputSource = "real-agent"`.
