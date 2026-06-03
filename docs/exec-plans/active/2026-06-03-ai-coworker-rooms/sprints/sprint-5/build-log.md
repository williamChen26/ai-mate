# Build Log: Sprint 5 — Agent Output Protocol and Safe Canvas Action Proposals

## Round 1

### What Was Built
- Added shared `agent-output.v1` Zod schemas/types in `packages/shared/src/index.ts` for text suggestions, questions, and safe canvas action proposals.
- Added bounded `create-text-note` proposal action data with `mutatesCanvas: true`, `requiresAcceptance: true`, proposal status, rationale, and freshness metadata.
- Updated `apps/mate/src/context/mate-turn.ts` so deterministic mate outputs use the shared agent output protocol.
- Added mate proposal generation for explicit add/create-note requests, including stale proposal blocking when context changed after the snapshot.
- Updated `apps/server/src/mate/room-mate-service.ts` to re-validate mate turn results, reject malformed agent outputs, and return `outputValidation` with `applied: false`.
- Added server tests for pending proposal diagnostics, stale blocked proposals, and invalid output rejection.
- Added E2E coverage proving raw proposal data renders and canvas shape count does not increase automatically.
- Updated Playwright config to avoid reusing stale existing local servers during E2E.
- Updated architecture and quality docs for `agent-output.v1` and proposal safety.

### Acceptance Criteria Status
| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-5.1 | A typed agent output protocol exists for text suggestions, questions, and safe action proposals. | PASS | Shared schemas are exported at `packages/shared/src/index.ts:123`, `packages/shared/src/index.ts:136`, `packages/shared/src/index.ts:141`, and `packages/shared/src/index.ts:160`; shared tests cover valid/invalid outputs. |
| AC-5.2 | Canvas-mutating outputs require validation and explicit user acceptance before apply. | PASS | Proposal schema requires `requiresAcceptance: true` and action `mutatesCanvas: true` at `packages/shared/src/index.ts:146`; server validation always reports `applied: false` in `apps/server/src/mate/room-mate-service.ts:41`. |
| AC-5.3 | Stale proposals can be detected using snapshot/event freshness metadata. | PASS | Mate marks stale proposal status from freshness at `apps/mate/src/context/mate-turn.ts:221`; server blocks stale proposals at `apps/server/src/mate/room-mate-service.ts:194`. |
| AC-5.4 | Unsupported or malformed outputs are rejected with inspectable diagnostics and no canvas mutation. | PASS | Server reparses mate turn output and returns `INVALID_AGENT_OUTPUT` before storing response at `apps/server/src/mate/room-mate-service.ts:126`; server test uses a malformed test double. |
| AC-5.5 | Web can render at least one non-mutating suggestion and one proposed action state without applying it automatically. | PASS | E2E raw mate message covers normal output; proposal E2E checks `canvas-action-proposal`, `requiresAcceptance`, `applied: false`, and unchanged shape count at `apps/web/e2e/canvas-smoke.spec.ts:187`. |
| AC-5.6 | Root quality gate remains green. | PASS | `pnpm check` passed, including 7 E2E tests and recovery smoke. |

### Behavior Scenario Evidence
- Mate sends a non-mutating suggestion: verified by existing raw mate E2E and mate tests; output is now `agent-output.v1` suggestion/question with freshness metadata.
- Mate proposes a canvas action: verified by mate/server tests and E2E message "Add a note for follow up" producing `canvas-action-proposal`.
- Stale proposal is blocked: verified by mate and server tests using `changedSinceSnapshot: true`.
- Malformed output is rejected: verified by server test injecting a malformed mate test double and receiving `INVALID_AGENT_OUTPUT`.
- Web renders proposed action state as raw data: verified by E2E raw panel assertions and unchanged context shape count.

### TDD Decision & Evidence
Use TDD: Yes

Evidence:
- RED: shared tests failed on missing `agentOutputSchema`; mate tests returned suggestion/question instead of proposal; server tests lacked `outputValidation` and invalid-output rejection.
- GREEN: implemented shared schemas, mate proposal output, server output validation, and proposal E2E until focused tests passed.
- REFACTOR: fixed mate test type narrowing for output union, updated Playwright to avoid stale server reuse, and kept web rendering raw without proposal UI polish.

### E2E / Runtime Verification
Commands run:
- `pnpm --filter @production-spec-graph/shared test`: PASS, 7 tests.
- `pnpm --filter mate test`: PASS, 9 tests.
- `pnpm --filter @production-spec-graph/server test`: PASS, 35 tests.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: first run exposed stale server reuse; after setting `reuseExistingServer: false`, PASS with 7 tests.
- `git diff --check`: PASS.
- `pnpm check`: PASS.

### Modularity & Readability Notes
The shared output protocol lives in `packages/shared` next to context contracts but as separate `agent-output.v1` schemas. Mate remains responsible for deterministic proposal generation. Server owns validation/status mapping and never trusts raw mate output without reparsing it. Web remains a raw JSON display surface and has no action executor.

### Human Checkpoint
Pause after Sprint 5.

Recommended local commands:
- `pnpm --filter @production-spec-graph/shared test`
- `pnpm --filter mate test`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection:
- Start server and web.
- Open a room, add a text shape, ask "Can you organize this?"
- Ask "Add a note for follow up."
- Confirm raw JSON shows `kind: "canvas-action-proposal"`, `requiresAcceptance: true`, `outputValidation.applied: false`.
- Confirm the canvas does not change automatically.

### Decisions Made
- Kept proposal apply/execution out of scope.
- Used `create-text-note` as the first bounded action proposal type.
- Kept proposal rendering raw and inspectable rather than introducing a polished approval UI.
- Made Playwright always start fresh local servers so E2E does not silently reuse stale code.

### Known Issues
- There is no apply/accept/reject UI yet.
- The proposal executor is intentionally absent.
- Server still invokes deterministic mate in-process.
