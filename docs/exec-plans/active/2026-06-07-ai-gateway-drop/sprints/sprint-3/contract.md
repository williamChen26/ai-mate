# Sprint 3 Contract: AI Drop Completion Proposal Surface

## Feature
F3: AI Drop Completion Proposal Surface

## Scope
Implement the minimal canvas-facing AI Drop completion proposal surface on top of the Sprint 1 gateway request contract and Sprint 2 `completion-proposal` agent output contract.

This sprint will add a logic-first proposal state and preview path for active completion candidates. The preview must remain non-authoritative until accepted: it may be an ephemeral overlay or an explicitly proposal-scoped, unsynced preview representation, but it must not be committed as normal canvas state before acceptance. `Tab` acceptance applies only the active fresh proposal through an explicit controlled canvas/collaboration boundary that validates the active selection and context before mutating tldraw state.

If the current web/server path lacks a completion-producing entry point, this sprint may add only the narrow AI Drop activation needed to request or inject a deterministic `completion-proposal` for the selected canvas context. That path must reuse the existing gateway and agent output contracts and must not introduce a new AI output protocol.

The UI work is intentionally minimal: enough translucent visual feedback to verify text and flow continuation proposals on the canvas, no visual redesign, no polish pass, no broad AI Edit.

## Out of Scope
- Broad AI Edit or arbitrary agent-driven canvas changes.
- Autonomous hidden canvas mutation from agent output, browser-only editor access, or unvalidated commands.
- Final AI Drop visual design, animations, rich keyboard UX, candidate ranking, or multi-candidate menus.
- Direct conversation gateway UI work for F4.
- Full F5 diagnostics dashboards, except small local state needed to test refusal and apply outcomes.
- Real LLM/provider integration or prompt work.
- Durable storage of proposal state.
- General-purpose server route redesign beyond the narrow completion-proposal activation needed for AI Drop runtime validation.

## Behavior Scenarios
- Scenario: Show a translucent text completion
  - Given the server/mate path returns a Sprint 2 `completion-proposal` output whose candidate type is `text-in-element`
  - And the proposal matches the currently selected text element and current gateway freshness context
  - When the web canvas receives the candidate
  - Then the canvas shows a minimal translucent preview visually associated with the selected text context
  - And the underlying tldraw document/store is not changed before acceptance

- Scenario: Show a translucent flow continuation
  - Given the server/mate path returns a Sprint 2 `completion-proposal` output whose candidate type is `flow-continuation`
  - And the proposal matches the currently selected diagram context and is renderable on the canvas
  - When the web canvas receives the candidate
  - Then the canvas shows a minimal translucent proposed node, connector, or text continuation
  - And the preview communicates only enough state for runtime validation that `Tab` can accept the active proposal
  - And the preview is not authoritative canvas state before acceptance

- Scenario: Accept only the active fresh completion with Tab
  - Given exactly one completion preview is active, fresh, and matched to the current selection/context
  - When the user presses `Tab` while the canvas/proposal owner has keyboard intent
  - Then the proposal is revalidated against current selection and freshness
  - And the proposal is applied through an explicit controlled canvas/collaboration boundary
  - And the preview is cleared after successful application

- Scenario: Refuse stale or mismatched completion
  - Given a completion preview was created for an earlier selection, snapshot freshness, operation freshness, or proposal context
  - When the user changes selection, changes relevant canvas content, continues typing in the target element, or the proposal no longer matches the active context
  - Then the preview is cleared or marked refused/stale
  - And pressing `Tab` does not apply the stale proposal
  - And no orphaned preview remains on the canvas

- Scenario: Cancel without affecting normal editing
  - Given a completion preview is active
  - When the user presses `Escape`, clicks/selects elsewhere, or no proposal is active
  - Then AI Drop proposal state is cleared without mutating canvas content
  - And normal tldraw editing continues when no active fresh proposal owns `Tab`

- Scenario: Refuse malformed or unsupported output
  - Given an agent output is missing required `completion-proposal` data, has an unsupported candidate shape, or fails boundary validation
  - When the web proposal surface attempts to activate it
  - Then the output is refused without previewing or mutating canvas state
  - And the refusal reason is inspectable in focused tests or local diagnostics state

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| AC-3.1 | A minimal AI Drop proposal state accepts only valid Sprint 2 `completion-proposal` output data and records active, cleared, refused/stale, applying, applied, and failed states. | Focused web unit tests for the proposal state module, including valid activation and invalid output refusal. |
| AC-3.2 | The preview surface is custom, minimal, and translucent, and it visually associates text and flow candidates with the current selection without committing them as authoritative tldraw state before acceptance. | Web unit/component tests plus E2E observation that the preview appears before `Tab` while the persisted canvas shape count/content remains unchanged. |
| AC-3.3 | Text-in-element and flow-continuation candidates from the existing `completion-proposal` contract can both be represented in preview-only state. | Focused tests using Sprint 2 output fixtures for `text-in-element` and `flow-continuation`; no new output protocol is invented unless a small adapter is required. |
| AC-3.4 | A narrow AI Drop activation path can make a selected-context completion proposal available to the web proposal state using existing gateway and agent output contracts, without implementing F4 conversation UI or broad AI Edit. | Web/server focused tests or E2E fixture path proving a deterministic `completion-proposal` reaches the proposal surface as `completion-proposal` data. |
| AC-3.5 | `Tab` acceptance applies only the active fresh proposal and routes the mutation through an explicit controlled canvas/collaboration boundary, not through hidden autonomous editor mutation. | Focused unit tests for the acceptance boundary and a web E2E scenario that activates a proposal, presses `Tab`, and observes the proposed canvas/text change after acceptance. |
| AC-3.6 | Stale, selection-mismatched, context-mismatched, malformed, unsupported, and no-active-proposal `Tab` attempts are refused without canvas mutation. | Focused unit tests for each refusal case, plus E2E/runtime coverage for at least one selection-mismatch or stale-proposal refusal. |
| AC-3.7 | Selection changes, relevant canvas edits, continued typing in the target context, `Escape`, successful apply, and failed apply states clear or replace the preview without leaving orphaned preview UI. | Web unit/component tests for cleanup triggers and E2E observation that the preview disappears after cancel/apply/stale transition. |
| AC-3.8 | The canvas remains the primary workspace; AI Drop UI changes are logic-first and minimal, with no broad visual redesign or F4 conversation surface changes. | Code review plus web E2E screenshots/log assertions focused on the existing canvas route and minimal proposal UI. |
| AC-3.9 | New non-obvious proposal modules/functions include concise Chinese comments where helpful, while trivial assignments remain uncommented. | Code review of new/changed files. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
- This sprint adds deterministic proposal state transitions, freshness/selection validation, keyboard acceptance rules, and an explicit canvas apply boundary. These are core state-transition and boundary-validation behaviors, so focused tests should define correctness before implementation.
- The translucent visual treatment itself is simple UI wiring, but it depends on the proposal state machine. Visual polish is intentionally skipped; runtime checks will verify that the minimal preview appears and clears.

Planned evidence:
- RED: write focused web tests first for proposal activation, invalid output refusal, stale/selection mismatch refusal, `Escape` cleanup, no-authoritative-mutation before acceptance, and `Tab` acceptance through the controlled apply boundary. The initial failure should show missing proposal state/apply modules or missing behaviors.
- GREEN: implement the minimal proposal state, preview surface, keyboard handling, and apply boundary until focused tests pass.
- REFACTOR: keep proposal validation/state separate from React rendering and tldraw apply wiring while tests remain green.

### E2E / Runtime Verification
Required final behavior checks:
- Run `pnpm --filter @production-spec-graph/web test:unit` for focused proposal state, rendering, and keyboard behavior.
- Run `pnpm --filter @production-spec-graph/web test:e2e` with a scenario that opens a room, creates or selects canvas context, activates a deterministic `completion-proposal`, verifies a translucent preview before acceptance, presses `Tab`, and observes the accepted canvas/text result.
- Run `pnpm check` before handoff unless a documented tool/permission issue prevents one sub-check.

If the existing E2E harness cannot drive the tldraw editor deeply enough for a full shape-level assertion, the fallback runtime check must still spawn the app through the web E2E command, activate a deterministic proposal through an app-visible test hook or UI trigger, verify preview lifecycle and `Tab` handling, and explain why direct editor-store assertions were not practical in this sprint.

## Modularity & Readability Plan
- Keep proposal validation and lifecycle in a small web-side module, separate from React rendering and tldraw editor mutation wiring.
- Keep the controlled apply boundary explicit, for example a focused helper that accepts the current editor/context plus a validated active proposal and returns an applied/refused result. This boundary is the only place this sprint may mutate canvas state.
- Reuse Sprint 1 gateway freshness/context metadata and Sprint 2 `completion-proposal` output data. Do not create a parallel AI output protocol.
- Keep preview rendering as a minimal canvas-adjacent overlay/proposal component. Avoid synced preview shapes unless the implementation can prove they are proposal-scoped, non-authoritative, and always cleaned up before handoff.
- Add small tests that double as documentation for stale, mismatched, malformed, and no-active-proposal refusal behavior.
- Continue concise Chinese comments around non-obvious proposal validation, freshness checks, and the acceptance boundary.

## Human Checkpoint
Pause after this sprint because it creates the first locally runnable AI Drop vertical slice.

Suggested local commands:
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

What to inspect:
- In a room canvas, trigger or fixture-inject a deterministic completion proposal and confirm the preview is translucent and associated with the selection.
- Confirm the proposal does not alter real canvas state before `Tab`.
- Press `Tab` for a fresh active proposal and confirm it applies through the controlled boundary.
- Change selection or context before pressing `Tab` and confirm stale/mismatched proposals are refused and cleared.
- Confirm the existing raw mate/conversation surface was not redesigned as part of this sprint.

## Technical Approach (brief)
Add a minimal web-side AI Drop proposal lifecycle that consumes existing `completion-proposal` outputs and validates them against current selection/freshness before activation. Render the active proposal as an ephemeral translucent preview surface that is not treated as canvas truth. Handle `Tab` by revalidating the active proposal and passing it to a controlled apply boundary that performs the only allowed canvas mutation. Clear or refuse proposals when selection, context, typing, cancellation, or validation state invalidates the candidate.

## Dependencies
- Sprint 1 F1 gateway request/context/freshness contract is completed and passed.
- Sprint 2 F2 `completion-proposal` output contract and deterministic mate decision boundary are completed and passed.
- Existing route-backed tldraw canvas in `apps/web`.
- Existing web/server test and E2E infrastructure from `docs/exec-plans/quality-commands.md`.

## Estimated Complexity
M
