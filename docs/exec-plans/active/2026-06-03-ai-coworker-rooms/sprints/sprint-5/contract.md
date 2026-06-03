# Sprint 5 Contract: Agent Output Protocol and Safe Canvas Action Proposals

## Feature
F5: Agent Output Protocol and Safe Canvas Actions

## Scope
Define the first typed agent output protocol for `mate` results beyond plain text, with safety boundaries for canvas-mutating ideas. This sprint remains logic-first and UI-light: raw structured output is acceptable. The key product proof is that `mate` can return a non-mutating suggestion/question and a typed canvas action proposal, while server/web validate and display the proposal state without applying it automatically.

This sprint implements:

- shared Zod schemas and TypeScript types for agent outputs:
  - text suggestion
  - question
  - safe canvas action proposal
  - output freshness metadata
  - proposal validation/status metadata
- a minimal proposed canvas action type, such as creating a text note, with bounded fields and no raw arbitrary instructions
- mate-side deterministic output generation that can return:
  - normal non-mutating suggestion/question
  - a proposed canvas action when the user explicitly asks to add/create content
- server-side output validation for mate turns:
  - validates the typed agent output protocol
  - detects stale proposals using F2 freshness metadata
  - records inspectable accepted/rejected/blocked proposal diagnostics in the raw response
- web-side raw rendering of agent outputs and proposal state in the existing `Mate raw` panel
- focused tests and E2E proving that proposals are displayed as raw data and never automatically mutate the canvas

Important safety decision:

- F5 may define proposal schemas and validation status.
- F5 must not automatically apply a proposal to tldraw.
- If an apply boundary is introduced at all, it must be explicit and may safely reject or no-op until a later sprint. The acceptance proof for this sprint is that proposal data is typed, inspectable, freshness-aware, and not applied automatically.

## Out of Scope
- No polished proposal UI, preview overlay, canvas highlight rendering, or final approval UX.
- No automatic canvas mutation.
- No broad tldraw action executor.
- No arbitrary script/instruction execution.
- No durable proposal persistence beyond current process-local diagnostics.
- No live LLM/model calls or prompt tuning.
- No production auth/permissions/consent model.

## Behavior Scenarios
- Scenario: Mate sends a non-mutating suggestion
  - Given mate has analyzed the room context
  - When the user asks a general question
  - Then mate returns a typed suggestion or question output
  - And the output includes the context freshness it relied on

- Scenario: Mate proposes a canvas action
  - Given the user asks mate to create or add a note
  - When mate prepares the response
  - Then it emits a typed safe canvas action proposal
  - And the proposal includes bounded action data, rationale, freshness metadata, and `requiresAcceptance: true`
  - And no canvas mutation is applied automatically

- Scenario: Stale proposal is blocked
  - Given mate prepares an action proposal from a context feed marked changed since snapshot
  - When server validates the proposal
  - Then the proposal status is marked blocked or stale
  - And the raw response explains that the user should refresh or confirm before action

- Scenario: Malformed output is rejected
  - Given mate or a test double returns unsupported or malformed agent output
  - When server validates the output
  - Then the response rejects or records the output as invalid
  - And the canvas is not mutated

- Scenario: Web renders proposed action state as raw data
  - Given server returns a valid proposal response
  - When web receives it
  - Then the raw panel shows the proposal kind/status/action data
  - And tldraw remains unchanged and interactive

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-5.1 | A typed agent output protocol exists for text suggestions, questions, and safe action proposals. | Shared schema tests and mate/server typecheck verify exported schemas/types. |
| AC-5.2 | Canvas-mutating outputs require validation and explicit user acceptance before apply. | Shared/server tests assert proposals carry `requiresAcceptance: true`; E2E asserts proposal is shown but no canvas shape is added automatically. |
| AC-5.3 | Stale proposals can be detected using snapshot/event freshness metadata. | Mate/server tests use changed-since-snapshot feeds and assert blocked/stale proposal status. |
| AC-5.4 | Unsupported or malformed outputs are rejected with inspectable diagnostics and no canvas mutation. | Server unit tests inject invalid output and assert structured validation error. |
| AC-5.5 | Web can render at least one non-mutating suggestion and one proposed action state without applying it automatically. | E2E sends a general message and a create/add-note message, then checks raw JSON output and canvas shape count. |
| AC-5.6 | Root quality gate remains green. | Run focused tests plus `pnpm check`. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
F5 adds safety-critical schemas, validation, status mapping, and stale proposal rules. These are deterministic protocol and boundary rules where tests should define behavior before implementation.

Planned evidence:
- RED: add shared output schema tests, mate output tests, server validation tests, web/E2E proposal rendering tests before implementation.
- GREEN: implement schemas, mate deterministic proposal generation, server validation/status mapping, and raw web rendering until tests pass.
- REFACTOR: keep shared output protocol separate from F2 input context, keep server proposal validation separate from HTTP route formatting, and keep web rendering raw/simple.

Planned focused coverage:
- valid suggestion output
- valid question output
- valid create-text-note proposal
- malformed unsupported output rejection
- stale proposal blocked
- proposal carries freshness and requires acceptance
- raw web result displays proposal state
- canvas shape count unchanged after receiving proposal

### E2E / Runtime Verification
This sprint changes the live raw AI output path, so E2E is required.

Required runtime path:
- `pnpm --filter @production-spec-graph/shared test`
- `pnpm --filter mate test`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `git diff --check`
- `pnpm check`

The E2E test should open a room, create/publish context, send a general message, assert a typed non-mutating output, then send an add/create message and assert a proposal appears in raw JSON while the current canvas shape count does not increase automatically.

## Modularity & Readability Plan
Expected boundaries:

- `packages/shared`: shared agent output Zod schemas/types, separate from F2 context schemas but exported from the same package.
- `apps/mate`: deterministic output/proposal generation reusing shared output schemas.
- `apps/server/src/mate/`: output validation and proposal status mapping.
- `apps/web`: minimal raw panel display only; no proposal-specific UI polish or executor.

Avoid adding an action executor. Avoid placing proposal validation only in web. Keep comments focused on why proposals are blocked/stale or require acceptance.

## Human Checkpoint
Pause after Sprint 5 because this is the first safe AI action proposal milestone.

Recommended local commands:
- `pnpm --filter @production-spec-graph/shared test`
- `pnpm --filter mate test`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection:
- Start server and web.
- Open a room, add a text shape, and ask a general question.
- Ask mate to add/create a note.
- Confirm raw JSON shows a typed proposal with `requiresAcceptance: true`.
- Confirm the canvas does not change automatically.

## Technical Approach
Add the output schemas to `packages/shared`, then update mate's deterministic turn result to use the shared output protocol and emit a create-text-note proposal for explicit create/add requests. Add server validation/status mapping so stale proposals are blocked and malformed outputs are rejected inspectably. Keep web rendering raw JSON and add E2E assertions that proposals do not mutate the canvas.

## Dependencies
- F2 context freshness metadata.
- F3 deterministic mate turn boundary.
- F4 raw web -> server -> mate -> web path.

## Estimated Complexity
M
