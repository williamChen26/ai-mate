# Sprint 3 Implementation: AI Drop Completion Proposal Surface

## Summary

Implemented the first minimal AI Drop vertical slice for F3. The web app can now consume an existing Sprint 2 `completion-proposal`, keep it as preview-only state, render a translucent canvas overlay, and accept it with `Tab` through an explicit tldraw apply boundary.

This sprint intentionally stayed logic-first. It did not redesign the raw Mate panel, did not add a rich chat UI, did not implement broad AI Edit, and did not connect a real LLM/provider. The narrow local activation path is a deterministic runtime hook that creates a contract-valid `completion-proposal` from the current selection so the canvas behavior can be tested end to end.

## Files Changed

- `apps/web/src/lib/ai-drop-proposal.ts`
  - Added the AI Drop proposal lifecycle: `cleared`, `active`, `stale`, `refused`, `applying`, `applied`, and `failed`.
  - Validates Sprint 2 `completion-proposal` outputs before previewing.
  - Revalidates freshness, room, selection, target shape, and target text before accepting.

- `apps/web/src/lib/ai-drop-canvas-boundary.ts`
  - Added the only Sprint 3 tldraw mutation boundary.
  - Converts an accepted proposal into a real text shape after `Tab`.

- `apps/web/src/components/canvas-shell.tsx`
  - Added minimal AI Drop runtime wiring.
  - Exposes `window.__PSG_AI_DROP__` for deterministic local/E2E activation.
  - Renders active candidates as an unsynced translucent DOM overlay.
  - Handles `Tab` and `Escape` only when an active proposal exists.
  - Sends real `completion-proposal` outputs from raw Mate responses into the same AI Drop activation path when available.

- `apps/web/app/globals.css`
  - Added minimal translucent preview styling.

- `apps/web/src/lib/_spec/ai-drop-proposal.test.ts`
  - Added focused unit tests covering valid text/flow activation, malformed/unsupported/stale/blocked refusal, selection mismatch, apply success, apply failure, and clear behavior.

- `apps/web/e2e/_spec/canvas-smoke.spec.ts`
  - Added browser coverage for preview-before-acceptance, `Tab` acceptance, and stale proposal refusal after selection changes.

## Behavior Notes

- Preview is not stored in tldraw before acceptance. It is a DOM overlay associated with the proposal target bounds.
- `Tab` calls `acceptAiDropProposal`, which revalidates the current runtime context before invoking `applyAiDropProposalToEditor`.
- Accepted text and flow candidates currently create a real text shape. This proves the controlled apply boundary without expanding into richer AI Edit behavior.
- The deterministic hook is intentionally narrow:
  - `window.__PSG_AI_DROP__.activateTextCompletion({ text })`
  - `window.__PSG_AI_DROP__.activateFlowContinuation({ text })`
  - `window.__PSG_AI_DROP__.activate(output)`
  - `window.__PSG_AI_DROP__.accept()`
  - `window.__PSG_AI_DROP__.cancel(reason)`
  - `window.__PSG_AI_DROP__.getState()`

## TDD Evidence

The approved Sprint 3 contract selected TDD for deterministic proposal state and the apply boundary.

- RED:
  - Added `apps/web/src/lib/_spec/ai-drop-proposal.test.ts` before the proposal lifecycle module existed.
  - The intended initial failure was missing module/functions for activation, refusal, apply transition, failure, and clearing behavior.
  - After adding the target-text freshness rule, the focused tests also caught incomplete fixtures: acceptance was refused because the test snapshot did not include the expected `currentText`. This red failure verified the stricter stale-text guard was active.

- GREEN:
  - Implemented `apps/web/src/lib/ai-drop-proposal.ts` with activation, refresh, apply, finish, and preview helpers until the focused tests passed.
  - Implemented `apps/web/src/lib/ai-drop-canvas-boundary.ts` and the minimal React runtime in `apps/web/src/components/canvas-shell.tsx`.
  - Added E2E coverage for preview-before-acceptance, `Tab` acceptance, and stale selection refusal.

- REFACTOR:
  - Kept the proposal lifecycle pure and tldraw-free.
  - Kept the editor mutation in `applyAiDropProposalToEditor` as the single controlled canvas boundary.
  - Kept the React layer as thin runtime wiring plus DOM preview rendering.
  - In Round 1, added explicit focused tests for context mismatch, no-active `Tab`, and target-text-changed stale cleanup so AC-3.6 and AC-3.7 remain easy to audit.

## Round 1 Feedback Fixes

- Added missing TDD RED/GREEN/REFACTOR evidence to this implementation record.
- Added the required human checkpoint pause and manual inspection instructions below.
- Added two focused unit tests covering context mismatch, no-active `Tab`, and target-text-changed stale cleanup.

## Verification

- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

All commands passed before Round 1 evaluation. After adding the Round 1 focused tests, these commands were rerun and passed:

- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`

## Human Checkpoint

Pause here before starting Sprint 4. This sprint creates the first locally runnable AI Drop vertical slice, so the developer should manually inspect it before more AI capabilities are layered on top.

Suggested commands:

- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection targets:

- Open a room canvas and create/select a text shape.
- Trigger a deterministic text proposal with `window.__PSG_AI_DROP__.activateTextCompletion({ text: "AI Drop accepted note" })`.
- Confirm the translucent preview appears near the selected context.
- Confirm the real tldraw shape count/content does not change before `Tab`.
- Press `Tab` and confirm the proposal becomes a real text shape through the controlled apply boundary.
- Trigger another proposal, change selection or keep editing the target text, and confirm the preview is cleared/refused and `Tab` does not apply it.
- Confirm the existing raw Mate panel and conversation surface were not redesigned in this sprint.
