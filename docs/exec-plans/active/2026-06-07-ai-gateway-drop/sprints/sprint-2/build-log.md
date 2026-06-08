# Sprint 2 Build Log: ReAct Agent Turn and Tool Decision Boundary

## Summary

Implemented the logic-first agent turn boundary for F2. The deterministic mate boundary now accepts the Sprint 1 gateway request, builds an inspectable `agentTurn` with observation, decision summary, tool calls, and final output kind, then returns one of the required non-mutating output paths:

- `completion-proposal`
- `conversation-answer`
- `question` for clarification
- `no-op` for refusal/no-op

Completion proposals are preview-only data. No AI Drop preview UI, Tab acceptance, canvas executor, or AI Edit behavior was added.

## Changed Files

- `packages/shared/src/index.ts`
- `packages/shared/src/_spec/context.test.ts`
- `apps/mate/src/context/agent-turn.ts`
- `apps/mate/src/context/mate-turn.ts`
- `apps/mate/src/context/test-fixtures.ts`
- `apps/mate/src/context/_spec/mate-turn.test.ts`
- `apps/server/src/mate/room-mate-service.ts`
- `apps/server/src/mate/_spec/room-mate-service.test.ts`
- `apps/server/src/http/_spec/app.test.ts`
- `docs/exec-plans/active/2026-06-07-ai-gateway-drop/meta.json`
- `docs/exec-plans/active/2026-06-07-ai-gateway-drop/sprints/sprint-2/contract.md`
- `docs/exec-plans/active/2026-06-07-ai-gateway-drop/sprints/sprint-2/contract-review.md`

## Behavior Scenario Evidence

- Agent calls the text completion tool for active text authoring:
  - Covered by `apps/mate/src/context/_spec/mate-turn.test.ts`: selected text shape plus `canvas-change` summary containing text-edit evidence produces `agentTurn.decision.intent = "text-authoring"`, calls the completion tool as `text-in-element`, and returns preview-only `completion-proposal`.
- Agent calls the flow continuation tool for active diagram extension:
  - Covered by `apps/mate/src/context/_spec/mate-turn.test.ts`: selected diagram-like shape plus connector/node operation summaries produces `flow-continuation`, calls the completion tool as `flow-continuation`, and returns preview-only candidate node/connector data.
- Agent declines misleading selection while the user is navigating or inspecting:
  - Covered by `apps/mate/src/context/_spec/mate-turn.test.ts`: selected shape plus only `selection-change` and `viewport-change` produces `inspect-or-navigate`, no tool calls, and `no-op`.
- Agent asks for clarification when intent evidence is incomplete:
  - Implemented through `agentTurn.finalOutputKind = "clarifying-question"` for completion gateway requests that lack sufficient snapshot and recent authoring evidence.
- Agent answers through the conversation path:
  - Covered by mate and server tests: conversation gateway requests produce `conversation-answer`, no completion tool calls, and non-mutating output.
- Agent preserves compatibility with existing raw mate path:
  - Server raw mate messages are mapped to gateway conversation requests and passed into `prepareMateTurn`; existing action proposal behavior for explicit note creation remains non-mutating and requires acceptance.

## TDD Decision & Evidence

TDD was used.

- RED:
  - Added mate tests for text completion, flow continuation, misleading selection decline, and conversation answer. Initial run failed with `Cannot read properties of undefined (reading 'decision')` because old mate results had no `agentTurn`.
- GREEN:
  - Added shared output kinds for `completion-proposal`, `conversation-answer`, and `no-op`.
  - Added `apps/mate/src/context/agent-turn.ts` for deterministic gateway-aware agent decisions and preview-only completion proposal generation.
  - Extended `prepareMateTurn` to accept optional gateway requests, include `agentTurn`, and route completion/conversation/no-op outputs.
  - Passed `gateway` from server raw mate message mapping into `prepareMateTurn`.
- REFACTOR:
  - Moved agent decision and completion proposal logic out of `mate-turn.ts` into `agent-turn.ts` to keep the turn orchestrator readable.
  - Kept fixtures focused by extending existing room context fixtures with shape types and event summaries rather than adding a new fake protocol.

Round 2 revision evidence:

- Evaluator found that completion decisions were reading full `context.recentEvents` instead of the gateway-bounded `gateway.context.recentOperations.operations`.
- Fixed `planAgentTurn` so gateway-triggered turns use the gateway's bounded ordered operation stack; only legacy turns fall back to full `context.recentEvents`.
- Added ordered operation evidence such as `operation:<index>:<eventId>:<kind>:<summary>` to the decision summary.
- Added a regression test where full context contains an older text edit but the gateway bounded stack contains only selection/viewport operations; the agent now declines completion.
- Added a focused incomplete-evidence test where completion lacks recent authoring operations; the agent now returns `clarifying-question`, makes no tool call, and names the missing authoring evidence.
- Removed an orphaned comment left in `mate-turn.ts` after refactoring.

Round 3 revision evidence:

- Evaluator found the no-op/refusal branch used the bounded gateway stack but only recorded the aggregate `selection-or-viewport-only` label.
- Updated the no-op/refusal branch to include ordered `operation:<index>:<eventId>:<kind>` evidence alongside the aggregate label.
- Added assertions in misleading-selection and bounded-stack regression tests that ordered operation facts are present for no-op/refusal completion decisions.
- `pnpm --filter mate test`, `pnpm --filter mate typecheck`, and `pnpm check` passed on the final Round 3 state.

## E2E / Runtime Verification

Focused checks:

- `pnpm --filter @production-spec-graph/shared test` passed: 1 file, 11 tests.
- `pnpm --filter mate test` passed: 2 files, 15 tests.
- `pnpm --filter mate typecheck` passed.
- `pnpm --filter mate build` passed.
- `pnpm --filter mate smoke` passed.
- `pnpm --filter @production-spec-graph/server test` passed: 7 files, 39 tests.
- `pnpm --filter @production-spec-graph/server typecheck` passed.
- `pnpm --filter @production-spec-graph/server build` passed.
- `pnpm --filter @production-spec-graph/server smoke` passed.

Full handoff gate:

- `pnpm check` passed, including shared, mate, server, web unit/typecheck/build, and 7 Playwright E2E tests.
- After Round 2 fixes, `pnpm check` passed again on the final state.

## Modularity & Readability Notes

- `apps/mate/src/context/agent-turn.ts` owns the new agent decision boundary:
  - `planAgentTurn` separates snapshot facts from recent operation facts.
- Gateway-triggered turns use the gateway-bounded operation stack, not the full context feed.
  - All completion decisions, including no-op/refusal, keep ordered operation facts in decision evidence.
  - `createCompletionProposalOutput` is the deterministic completion tool substitute and returns preview-only data.
- `apps/mate/src/context/mate-turn.ts` remains the turn orchestrator: validate input, observe room, infer legacy intent, plan agent turn, choose output, record memory.
- `packages/shared/src/index.ts` now includes the new output protocol variants. It is still cohesive around shared contracts, but it is large; if future sprints add more gateway protocol, shared contracts should be split into smaller files.
- New non-obvious modules/functions include Chinese comments explaining operation-stack evidence, misleading selection handling, and preview-only completion semantics.
- No UI code was changed and no AI Drop visual surface or Tab acceptance was introduced.

## Human Checkpoint

Pause here before Sprint 3.

Suggested local inspection:

- Read `apps/mate/src/context/agent-turn.ts` first. It is the clearest map of the new agent decision model.
- Read the new tests in `apps/mate/src/context/_spec/mate-turn.test.ts` from the text completion scenario onward.
- Read `packages/shared/src/index.ts` around `completionProposalOutputSchema`, `conversationAnswerOutputSchema`, and `noOpOutputSchema`.
- Run:
  - `pnpm --filter mate test`
  - `pnpm --filter mate smoke`
  - `pnpm --filter @production-spec-graph/server test`
  - `pnpm check`

What to verify conceptually:

- Text and flow completion require both snapshot evidence and recent operation-stack evidence.
- A selected shape alone does not trigger completion.
- Completion tool calls only produce preview-only proposal data.
- Conversation turns do not call completion tools.
- Existing raw mate behavior remains non-mutating.
