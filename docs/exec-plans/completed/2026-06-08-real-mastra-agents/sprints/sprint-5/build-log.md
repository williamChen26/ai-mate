# Sprint 5 Build Log

## Summary

Implemented product-shaped ReAct tool boundaries and bounded runtime
tool-call diagnostics.

## Behavior Scenario Evidence

- Scenario: Completion tool creates proposal data
  - Added `completionProposalTool` in
    `apps/mate/src/mastra/tools/canvas-tools.ts`.
  - The tool returns shared `completion-proposal` data and has no canvas
    mutation executor.
  - Unit tests validate preview-only proposal output through the shared schema.

- Scenario: Conversation uses final answer, not answer tool
  - `mateConversationAgent` is configured with only `canvasContextTool`.
  - No `answerConversationTool` was added.
  - Runtime tests verify plain text fake conversation output normalizes to
    `conversation-answer` with empty tool calls.

- Scenario: Tool calls are inspectable
  - Runtime metadata now includes bounded `toolCallCount` and `toolCalls`.
  - Server diagnostics expose runtime tool-call summaries with tool name,
    status, output kind, preview-only flag, and optional reason.
  - Diagnostics continue to avoid prompt text, full prompt history, and raw
    model payloads.

- Scenario: Deterministic fallback remains explainable
  - Deterministic, skipped, failed, fake, and real runtime metadata all include
    explicit mode/path/source/status/fallback fields.
  - Invalid fake output fallback preserves bounded tool-call metadata so
    failures remain inspectable.

## TDD Evidence

- RED: Added focused runtime/tool tests for bounded tool-call metadata and
  schema-valid completion tool output.
- GREEN: Implemented tool definitions, runtime metadata normalization, agent
  registration, and diagnostics surfacing.
- REFACTOR: Kept tool metadata normalization in the runtime boundary instead of
  spreading ReAct bookkeeping through server routes.

## Modularity Notes

- Mastra tool definitions live in one cohesive file near canvas agents.
- Runtime tool-call metadata is small, schema-validated, and capped at 12
  entries.
- Conversation final answers remain ordinary output data; only useful actions
  or proposals are represented as tools.

## Quality Commands

Focused commands run:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
pnpm --filter @production-spec-graph/web test:unit
pnpm --filter @production-spec-graph/web typecheck
```

All passed.

Full handoff command attempted:

```sh
pnpm check
```

Result: Partial pass. Shared tests/typecheck/build, mate
tests/typecheck/build/smoke, server tests/typecheck/build/smoke, web
unit/typecheck/build all passed. The final Playwright E2E step did not start
because `http://127.0.0.1:3001/ready` was already occupied by an existing
server and the Playwright config uses `reuseExistingServer: false`.

## Human Checkpoint

To inspect the new diagnostics manually:

1. Start server and web normally.
2. Trigger a fake/real completion path that reports `propose-completion`.
3. Open room diagnostics and check `mate.gatewaySummary.runtime.toolCalls`.
4. Confirm conversation turns do not show an answer tool and diagnostics do not
   include prompt text or raw model history.
