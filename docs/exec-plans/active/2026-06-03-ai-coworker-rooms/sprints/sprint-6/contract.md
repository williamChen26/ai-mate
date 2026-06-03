# Sprint 6 Contract: Runtime Observability and Manual Validation Loop

## Feature
F6: Runtime Observability and Manual Validation Loop

## Scope
Add developer-facing diagnostics that make the current room-to-agent path inspectable without adding product polish. This sprint should aggregate the state already established in F1-F5: sync room identity, agent lifecycle, context freshness, event feed, latest mate request/response, and proposal validation status. UI remains raw-data oriented.

This sprint implements:

- server room diagnostics endpoint, such as `GET /rooms/:roomId/diagnostics`
- diagnostics response including:
  - room id and room active/sync presence
  - agent lifecycle record/state and degraded/unavailable reason
  - context snapshot/event freshness summary
  - latest context snapshot summary, such as shape count and recent event count
  - latest mate response status, output kind, proposal status, and validation status
  - process-local/non-durable storage notes
- web client helper for fetching room diagnostics
- minimal raw diagnostics trigger/rendering inside the existing `Mate raw` panel
- docs/manual validation updates explaining how to inspect a live room
- tests and E2E proving diagnostics update after context publish and mate message

Important scope decision:

- This is observability only. Do not add a dashboard, polished UI, metrics backend, logs storage, tracing system, auth, or durable history.
- Raw JSON display is acceptable and preferred for this sprint.

## Out of Scope
- No production observability stack, OpenTelemetry integration, dashboards, or metrics persistence.
- No auth/permissions/tenant visibility controls.
- No long-term AI request/response history.
- No action proposal apply/accept/reject UI.
- No canvas mutation executor.
- No visual design polish beyond preventing overlap or broken layout.

## Behavior Scenarios
- Scenario: Developer inspects a live room
  - Given backend and web are running locally and a room is active
  - When a developer requests room diagnostics
  - Then diagnostics include room id, room presence, agent lifecycle, context freshness, recent event counts, and latest mate output status
  - And all data is scoped to the selected room

- Scenario: Developer validates full path manually
  - Given a room contains canvas content and the raw AI surface is visible
  - When the developer sends a mate message and then fetches diagnostics
  - Then diagnostics expose the latest AI request/response state
  - And diagnostics include context freshness and output/proposal validation status

- Scenario: Diagnostics expose degraded mode
  - Given no external mate adapter is configured but the deterministic in-process mate boundary can answer
  - When diagnostics are fetched
  - Then agent lifecycle degraded/unavailable state remains visible
  - And normal context/mate raw response diagnostics remain independently inspectable

- Scenario: Diagnostics are safe for quiet rooms
  - Given a room has no canvas snapshot and no mate response
  - When diagnostics are fetched
  - Then diagnostics return explicit empty/null state instead of throwing or fabricating activity

- Scenario: Harness records validation evidence
  - Given the run is near completion
  - When the sprint is handed off
  - Then build/evaluation logs include local commands and what to inspect manually
  - And root `pnpm check` covers the diagnostics path.

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-6.1 | Diagnostics expose room sync/presence, agent lifecycle, snapshot freshness, event feed summary, and AI request/response status. | Server tests assert `/rooms/:roomId/diagnostics` for quiet and active rooms. |
| AC-6.2 | The full web -> server -> mate -> web message path has a documented manual validation flow and diagnostics response. | Docs updated; E2E sends a message, fetches diagnostics, and checks latest mate output/proposal state. |
| AC-6.3 | Degraded mate availability is observable without breaking normal canvas collaboration. | Server tests assert agent lifecycle unavailable/degraded is visible while diagnostics still report context/mate data. |
| AC-6.4 | Sprint build/evaluation logs include concrete local commands and manual inspection steps. | Build log and evaluation artifacts include commands and inspection notes. |
| AC-6.5 | Validation remains compatible with the root `pnpm check` gate. | Run focused tests plus `pnpm check`. |
| AC-6.6 | Web exposes diagnostics through a minimal raw data path without replacing canvas or adding polished dashboard UI. | Web unit/E2E checks diagnostics helper/button/raw JSON and confirms tldraw remains mounted. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
F6 adds deterministic aggregation and diagnostics contracts across existing state. Tests should define quiet room behavior, active room behavior, degraded lifecycle visibility, and latest mate response summarization before implementation.

Planned evidence:
- RED: add server diagnostics tests, web diagnostics client tests, and E2E diagnostics assertions before endpoint/helper/UI exists.
- GREEN: implement server diagnostics aggregation, web helper/button/raw JSON rendering, and docs.
- REFACTOR: keep diagnostics aggregation separate from route glue where practical and avoid duplicating business logic.

Planned focused coverage:
- quiet room diagnostics
- active room with snapshot/event feed
- latest mate response and outputValidation summary
- degraded agent lifecycle visibility
- web diagnostics fetch success/failure
- E2E after proposal message

### E2E / Runtime Verification
This sprint adds runtime diagnostics for the current full path, so E2E is required.

Required runtime path:
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `git diff --check`
- `pnpm check`

The E2E test should open a room, create/publish context, send a mate message or proposal request, click/fetch diagnostics, and assert raw diagnostics include room id, agent lifecycle, context freshness, latest mate output kind, and output validation status.

## Modularity & Readability Plan
Expected boundaries:

- `apps/server/src/diagnostics/`: room diagnostics aggregation from registry/context/mate service.
- `apps/server/src/http/app.ts`: route registration only.
- `apps/web/src/lib/room-diagnostics-client.ts`: fetch helper.
- `apps/web/src/components/canvas-shell.tsx`: one small raw diagnostics trigger/display inside the existing raw panel.
- Docs: update architecture and quality commands/manual inspection notes.

Avoid introducing a metrics/logging framework. Avoid broad UI work. Keep diagnostics output explicit and stable enough for tests.

## Human Checkpoint
Pause after Sprint 6 and summarize the whole run because this completes the planned feature list.

Recommended local commands:
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection:
- Start server and web.
- Open a room, create a text shape, send a mate message, and request diagnostics.
- Confirm raw diagnostics include room id, agent lifecycle, context freshness, event count, latest mate output/proposal validation, and process-local storage notes.
- Confirm canvas remains usable.

## Technical Approach
Add a diagnostics aggregator that reads the room registry, context store feed, and room mate service latest response. Expose it through a room-scoped endpoint. Add a small web client and button to show raw diagnostics in the existing raw panel. Extend E2E to validate diagnostics after a real message/proposal flow. Update docs and close the harness run only after tests pass.

## Dependencies
- F1 room agent lifecycle.
- F2 context feed.
- F3 mate ingestion.
- F4 raw web/server/mate path.
- F5 agent output/proposal validation.

## Estimated Complexity
S
