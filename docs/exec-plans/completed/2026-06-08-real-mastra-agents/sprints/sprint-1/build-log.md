# Sprint 1 Build Log

## Summary

Implemented the real-agent runtime foundation for `apps/mate` while keeping the
default path deterministic and credential-free.

## Behavior Scenario Evidence

- Scenario: Real agent runtime is disabled by default
  - `prepareMateTurn` now includes `runtime` metadata with
    `mode: deterministic`, `outputSource: deterministic-fallback`, and
    `fallbackUsed: true`.
  - `pnpm --filter mate smoke` prints the runtime metadata and asserts the
    default smoke remains credential-free.

- Scenario: Product canvas agents are defined in Mastra
  - Added `mateConversationAgent` and `aiDropCompletionAgent` in
    `apps/mate/src/mastra/agents/canvas-agents.ts`.
  - Updated `apps/mate/src/mastra/index.ts` so the product Mastra registry
    exposes canvas agents, not the weather demo.
  - Updated `apps/mate/README.md` to describe canvas agents and isolate the
    weather demo as scaffold reference.

- Scenario: Runtime adapter can use fake or real execution
  - Added `prepareMateTurnWithRuntime`.
  - Added fake adapter tests that return valid model-like output without network
    calls.
  - Added invalid fake output tests that fall back safely.

- Scenario: Provider readiness is explicit
  - Added `createMateAgentRuntimeConfig` with `MATE_AGENT_MODE` and
    `DEEPSEEK_API_KEY` readiness behavior.
  - Real mode without key reports provider unavailable instead of throwing.

## TDD Evidence

- RED: Added runtime boundary tests for default deterministic metadata,
  DeepSeek readiness, path selection, fake runtime success, and invalid-output
  fallback before the new runtime module existed.
- GREEN: Implemented `apps/mate/src/context/agent-runtime.ts`,
  `prepareMateTurnWithRuntime`, runtime metadata in `mateTurnResultSchema`, and
  product canvas Mastra agents.
- REFACTOR: Kept Mastra framework details under `apps/mate/src/mastra`, and
  kept server changes limited to diagnostics summarization.

## Modularity Notes

- `agent-runtime.ts` owns mode selection, provider readiness, path selection,
  adapter normalization, and fallback metadata.
- `mate-turn.ts` remains the deterministic turn boundary and adds only a small
  async runtime wrapper for future real/fake agent execution.
- `canvas-agents.ts` owns product Mastra prompts and keeps ordinary
  conversation answers out of the tool layer.
- Server diagnostics receives only a bounded runtime summary.

## Quality Commands

Focused commands run:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter mate build
pnpm --filter mate smoke
pnpm --filter @production-spec-graph/server test
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

Pause here before Sprint 2. Inspect:

- `apps/mate/src/context/agent-runtime.ts`
- `apps/mate/src/context/mate-turn.ts`
- `apps/mate/src/mastra/agents/canvas-agents.ts`
- `apps/mate/src/mastra/index.ts`
- `apps/server/src/diagnostics/room-diagnostics.ts`

What to verify:

- Conversation final answers are not forced through an answer tool.
- AI Drop has a dedicated completion agent path for future structured output.
- Default local behavior remains deterministic and does not require
  `DEEPSEEK_API_KEY`.
