# Sprint 4 Build Log

## TDD Record

- RED: `pnpm --filter @production-spec-graph/web test:unit` failed after adding `conversation-gateway.test.ts` because `../conversation-gateway.js` did not exist.
- GREEN: Added `conversation-gateway.ts`; web unit tests passed.
- REFACTOR: Integrated the adapter into `canvas-shell.tsx`, kept conversation result rendering minimal, and removed the conversation-to-AI-Drop auto-activation path.

## Validation Commands

- `pnpm --filter @production-spec-graph/web test:unit`
  - Passed: 11 test files, 52 tests.
- `pnpm --filter @production-spec-graph/web typecheck`
  - Passed.
- `pnpm --filter @production-spec-graph/web test:e2e`
  - First run failed because the new conversation text assertion omitted the valid stale-context clarification text.
  - After correcting the assertion, passed: 10 browser tests.
- `pnpm --filter @production-spec-graph/server test`
  - Passed: 7 test files, 39 tests.
- `pnpm --filter mate test`
  - Passed: 2 test files, 15 tests.
- `pnpm check`
  - Passed full shared, mate, server, web unit/type/build/smoke/E2E gate.

## Notes

- A previous local E2E run left a Node process listening on port `3001`; it was terminated before rerunning Playwright.
- No provider credentials or network model calls were required.

## Human Checkpoint

Pause before Sprint 5. Inspect the conversation panel in a live room and verify:

- direct conversation shows pending then a result;
- stale/incomplete context is visible when returned;
- raw response metadata remains visible;
- conversation responses do not create `ai-drop-preview`;
- pressing `Tab` after a conversation answer does not mutate the canvas;
- Sprint 3 AI Drop still works through the explicit AI Drop runtime.
