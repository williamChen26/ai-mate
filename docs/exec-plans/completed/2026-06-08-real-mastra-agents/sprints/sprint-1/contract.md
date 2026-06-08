# Sprint 1 Contract: Real Agent Runtime Boundary and Mastra Canvas Agent Scaffold

## Scope

Implement F1 from the spec. This sprint introduces the product-level runtime
boundary for real Mastra agents, while preserving the existing deterministic
mate path as the default credential-free behavior.

This sprint should not wire the web UI to a live model and should not require
`DEEPSEEK_API_KEY` for tests, builds, smoke checks, or `pnpm check`.

## Behavior Scenarios

- Scenario: Real agent runtime is disabled by default
  - Given no real-agent mode or provider key is configured
  - When server or tests call the mate turn boundary
  - Then the existing deterministic path returns valid `mate-turn.v1`
  - And diagnostics can identify the output source as deterministic fallback

- Scenario: Product canvas agents are defined in Mastra
  - Given developers inspect `apps/mate/src/mastra`
  - When the Mastra app is loaded
  - Then product-specific conversation and AI Drop completion agents are
    registered or exported behind clear names
  - And the weather demo is not the implied product path

- Scenario: Runtime adapter can use fake or real execution
  - Given tests inject a fake agent runtime
  - When a conversation or completion request is prepared
  - Then mate can consume fake real-agent results without network calls
  - And invalid fake output is rejected through existing schemas

- Scenario: Provider readiness is explicit
  - Given DeepSeek credentials are missing
  - When runtime readiness is checked
  - Then the result reports provider unavailable instead of throwing
  - And default quality commands still pass

## Acceptance Criteria

- AC-1.1: Add a cohesive real-agent runtime boundary in `apps/mate` with
  explicit runtime modes, at minimum deterministic fallback and fake/real-agent
  adapter support.
- AC-1.2: Add product-specific Mastra canvas agent definitions for
  conversation and AI Drop completion, with prompts focused on tldraw context,
  recent operations, structured completion, and safety boundaries.
- AC-1.3: Isolate or rename the weather demo so it no longer looks like the
  product agent path.
- AC-1.4: Preserve the public `prepareMateTurn` behavior and existing server
  tests unless the contract explicitly updates them.
- AC-1.5: Add deterministic unit tests for runtime mode selection, provider
  readiness, fake adapter success, fake adapter invalid-output fallback, and
  default deterministic behavior.
- AC-1.6: Add concise Chinese comments to new non-obvious modules/functions,
  especially mode selection, provider readiness, fallback, and agent prompts.

## TDD Decision

Use TDD for the runtime boundary and mode-selection logic.

Expected RED/GREEN evidence:
- RED: tests fail because the real-agent runtime boundary and mode metadata do
  not exist.
- GREEN: tests pass after adding runtime mode selection, fake adapter support,
  and fallback metadata.
- REFACTOR: keep Mastra framework details isolated from `prepareMateTurn` and
  server orchestration.

Strict TDD may be skipped for prompt text and mechanical Mastra registration,
because those are mostly configuration/string artifacts. They still need
focused tests or typechecks proving exports compile and registration is
reachable.

## Implementation Plan

1. Inspect current `apps/mate/src/mastra` demo files and `prepareMateTurn`
   extension points.
2. Add a small runtime module, likely under `apps/mate/src/context` or
   `apps/mate/src/mastra`, that exposes:
   - runtime mode/config parsing
   - provider readiness summary
   - fake adapter injection for tests
   - source metadata for deterministic/fake/real turns
3. Add product canvas Mastra agents:
   - `mateConversationAgent`
   - `aiDropCompletionAgent`
4. Update Mastra registry to expose product agents and isolate the weather demo
   as demo/reference code or remove it from product registration.
5. Thread runtime metadata into mate turn diagnostics or output-adjacent result
   shape without breaking existing server contracts.
6. Add tests and run focused quality commands.

## Modularity and Readability Plan

- Keep provider/mode selection in a small module.
- Keep prompt text near product agent definitions, not mixed into server routes.
- Do not put Mastra framework objects inside server HTTP code.
- Do not make `prepareMateTurn` large; if it needs runtime metadata, use a
  helper or injected adapter.
- New non-obvious code must include Chinese comments explaining intent and
  safety tradeoffs.

## Verification Plan

Focused commands:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter mate build
pnpm --filter mate smoke
```

Handoff command if practical:

```sh
pnpm check
```

Manual/runtime checkpoint:
- Start Mastra dev only if provider configuration is locally available:
  `pnpm --filter mate dev`
- Inspect Mastra Studio and confirm product canvas agents are visible or
  exported, while default repository tests still pass without credentials.

## Out of Scope

- No web UI streaming implementation.
- No server-backed AI Drop completion endpoint.
- No direct canvas mutation tools.
- No prompt repair loop.
- No durable memory or production provider switching.

## Human Checkpoint Recommendation

Pause after this sprint. The developer should inspect the new runtime boundary
and agent definitions before we wire real Conversation or AI Drop behavior into
server/web paths.
