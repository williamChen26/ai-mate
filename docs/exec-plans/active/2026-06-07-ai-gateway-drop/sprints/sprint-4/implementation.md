# Sprint 4 Implementation: Conversation Gateway Agent Path

## Summary

Implemented the minimal direct conversation gateway surface for F4. The existing Mate panel now classifies room-scoped mate responses into conversation states, renders a small direct answer/result surface, preserves raw structured metadata, and keeps conversation responses separated from AI Drop preview and `Tab` acceptance.

This sprint stayed logic-first. It did not add a polished chat UI, provider integration, streaming, durable history, AI Edit, or new agent framework. The existing `POST /rooms/:roomId/mate/messages`, `GET /rooms/:roomId/mate`, and diagnostics paths remain the compatibility boundary.

## Files Changed

- `apps/web/src/lib/conversation-gateway.ts`
  - Added a small response/state adapter for direct conversation.
  - Validates raw mate output with the existing shared `agentOutputSchema`.
  - Classifies `idle`, `pending`, `success`, `context-stale`, `context-incomplete`, `unsupported-output`, and `error` states.
  - Explicitly quarantines `completion-proposal` outputs so conversation cannot activate AI Drop.

- `apps/web/src/lib/_spec/conversation-gateway.test.ts`
  - Added focused tests for state creation, output rendering, stale/incomplete context, completion-proposal quarantine, malformed response handling, server failure, and network-style error state.

- `apps/web/src/components/canvas-shell.tsx`
  - Wired the Mate panel to the conversation adapter.
  - Added a minimal `ConversationGatewayResult` surface.
  - Removed the prior conversation-response auto-activation path that called `window.__PSG_AI_DROP__` for `completion-proposal` outputs.

- `apps/web/app/globals.css`
  - Added minimal result-state styling for conversation success, stale/incomplete, unsupported, and error states.

- `apps/web/e2e/_spec/canvas-smoke.spec.ts`
  - Added E2E coverage that a room conversation renders direct result metadata, creates no AI Drop preview, and does not mutate canvas content or arm `Tab`.
  - Existing AI Drop E2E coverage still verifies Sprint 3 preview/acceptance behavior.

## Behavior Notes

- The conversation surface still uses the existing Mate endpoint and raw panel. It adds a readable direct result above the raw JSON rather than replacing diagnostics.
- `conversation-answer`, `question`, `suggestion`, and `no-op` outputs are displayable direct conversation results.
- Stale or incomplete context is visible through `data-state`, freshness/readiness metadata, and raw response JSON.
- `completion-proposal` is intentionally shown as `unsupported-output` in the conversation path. It is not sent to `window.__PSG_AI_DROP__`, does not render `ai-drop-preview`, and cannot be accepted by `Tab`.

## TDD Evidence

The approved Sprint 4 contract selected TDD for response classification, state transitions, response-shape validation, and conversation/AI Drop separation.

- RED:
  - Added `apps/web/src/lib/_spec/conversation-gateway.test.ts` before `apps/web/src/lib/conversation-gateway.ts` existed.
  - Initial focused run failed with the missing `../conversation-gateway.js` module, proving the tests were introduced before implementation.

- GREEN:
  - Implemented `apps/web/src/lib/conversation-gateway.ts` until focused classification tests passed.
  - Wired the Mate panel to the adapter and added E2E assertions for rendered conversation answers, raw metadata, no AI Drop preview, and no canvas mutation.
  - Adjusted the E2E assertion to accept stale-context conversation text after runtime revealed the deterministic mate can correctly answer with a stale-context clarification.

- REFACTOR:
  - Kept validation/classification in a pure web-side adapter.
  - Kept React changes limited to a small result component and submit-state wiring.
  - Preserved AI Drop modules as separate runtime code; conversation code does not call `activateAiDropProposal`, `acceptAiDropProposal`, `applyAiDropProposalToEditor`, or `window.__PSG_AI_DROP__`.

## Verification

- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter mate test`
- `pnpm check`

All commands passed. The first E2E attempt failed because the text assertion did not include the valid stale-context clarification response; the assertion was corrected and the E2E command passed.

## Human Checkpoint

Pause here before Sprint 5. This sprint creates the second locally runnable AI gateway path and changes how the current Mate panel is read.

Suggested commands:

- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection targets:

- Open a room canvas, add or select canvas content, and send a direct conversation message.
- Confirm the panel shows pending, then a direct answer/question/suggestion/no-op or context-stale/context-incomplete state.
- Confirm the raw structured response remains inspectable below the direct result.
- Confirm no AI Drop preview appears from the conversation response.
- Press `Tab` after the conversation answer and confirm no proposal is applied.
- Re-run the Sprint 3 AI Drop deterministic path and confirm it still previews and accepts only through `window.__PSG_AI_DROP__`.
