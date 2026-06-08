# Sprint 1 Contract: Provider-Backed Mastra Runtime Adapter

## Feature

F1: Provider-Backed Mastra Runtime Adapter

## Behavior Scenarios

- Scenario: Real mode creates a Mastra adapter
  - Given `MATE_AGENT_MODE=real` and `DEEPSEEK_API_KEY` are configured
  - When the server creates its default mate service
  - Then the service can invoke product Mastra canvas agents

- Scenario: Conversation uses Mastra final text
  - Given the conversation path reaches the adapter
  - When Mastra returns final text
  - Then mate normalizes it to `conversation-answer`
  - And no answer tool is required

- Scenario: Completion uses structured output
  - Given the completion path reaches the adapter
  - When Mastra returns a structured AI Drop proposal
  - Then mate validates it as `completion-proposal`
  - And bounded tool-call metadata is preserved

- Scenario: Provider failures fall back safely
  - Given Mastra throws or returns unusable output
  - When the runtime result is normalized
  - Then deterministic fallback is used
  - And diagnostics include a bounded failure reason

## Acceptance Criteria

- AC-1.1: Add a `mate/runtime` package export with
  `createMastraMateAgentRuntimeAdapter` and a configured helper.
- AC-1.2: Adapter routing selects `mateConversationAgent` for conversation and
  `aiDropCompletionAgent` for completion.
- AC-1.3: Completion calls request structured `completion-proposal` output while
  existing mate normalization remains the final safety gate.
- AC-1.4: Mastra `toolCalls` / `toolResults` are converted to existing bounded
  runtime tool-call summaries.
- AC-1.5: Server default `createRoomMateService()` receives the configured
  adapter when real mode is provider-ready, and remains credential-free by
  default.
- AC-1.6: Focused tests cover adapter creation, routing, output conversion,
  tool-call metadata, provider errors, and default server wiring.

## TDD Decision

Use TDD for the adapter because it is deterministic with injected fake Mastra
agents. Live provider calls are not tested automatically; the tests mock the
Mastra `generate()` surface and keep CI credential-free.

## Implementation Plan

1. Add `apps/mate/src/context/mastra-runtime-adapter.ts`.
2. Export it through a new `mate/runtime` package subpath.
3. Add injected-agent tests for conversation, completion, tool calls, and
   errors.
4. Wire server app default mate service to use the configured adapter helper.
5. Add server test for credential-free default and configured helper injection.

## Runtime Verification Plan

Run:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
```

Attempt `pnpm check` if the local Playwright ports are available.

## Modularity And Readability Plan

- Keep Mastra-specific calls inside the adapter file.
- Keep server wiring to one helper call in app construction.
- Preserve existing output validation, fallback, and diagnostics boundaries.
- Add Chinese comments around adapter routing, structured output, and bounded
  tool-call extraction.

## Human Checkpoint

After the sprint, a developer can set `MATE_AGENT_MODE=real` and
`DEEPSEEK_API_KEY`, start server/web, then inspect diagnostics to confirm
`runtime.outputSource = "real-agent"` on successful turns.
