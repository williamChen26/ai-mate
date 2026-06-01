# Sprint 5 Contract: Integrated Verification, Developer Docs, and Quality Commands

## Feature
F5: Integrated Verification, Developer Docs, and Quality Commands

## Scope
This sprint closes the dedicated Node sync backend collaboration run by making the completed F1-F4 work repeatable and inspectable for future Generator and Evaluator handoffs.

The implementation will:
- Update repository quality commands so backend checks, web checks, integrated collaboration E2E, and recovery smoke are documented and executable from the root workflow.
- Add or update root `ARCHITECTURE.md` with the final collaboration architecture, including app boundaries, sync flow, room routing, device/session identity, status/recovery behavior, and non-durable in-memory limits.
- Add or update developer documentation for local startup order, expected ports, environment variables, room URL examples, health/readiness checks, sync endpoint expectations, package/API compatibility, and accepted limitations.
- Preserve the existing F1-F4 runtime behavior while proving it through integrated validation.
- Record final validation evidence in `build-log.md`.

## Out of Scope
- Authentication, authorization, user accounts, permissions, invite flows, or room access control.
- Durable persistence implementation, database integration, horizontal scaling, production deployment, Durable Objects, SQLite, or managed storage.
- Custom production asset storage or media upload/download infrastructure.
- Custom participant roster beyond the tldraw-supported identity/presence diagnostics already implemented.
- Replacing tldraw sync with Socket.IO or another protocol abstraction.
- Changing the product collaboration model beyond documenting and validating the existing route-backed tldraw sync behavior.
- Modifying `spec.md`.

## Behavior Scenarios
- Scenario: Run documented server and web checks
  - Given a developer reads the repository quality commands
  - When they follow the required commands for this run
  - Then they can validate backend tests, backend typecheck/build, backend smoke, web unit/typecheck/build, web integrated E2E, and web recovery smoke
  - And the quality command list and root workflow are no longer web-only

- Scenario: Validate a full local collaboration flow
  - Given the backend and web app are running locally
  - When two independent browser contexts open the same route-backed room
  - Then they observe shared tldraw document changes through the dedicated backend
  - And the validation records executable evidence or a precise manual fallback if timing makes a fully automated observation unreliable

- Scenario: Validate backend service behavior
  - Given the backend package is installed and buildable
  - When the backend health/readiness and smoke checks run
  - Then `/health`, `/ready`, valid WebSocket upgrade, invalid room id rejection, and same-room reuse are verified
  - And the process-local `InMemorySyncStorage` limitation remains visible in runtime/docs evidence

- Scenario: Validate client route, identity, status, and failure behavior
  - Given the web app is configured with a local backend sync URL
  - When runtime validation opens root, valid room, invalid room, same-room two-client, same-device multi-tab, backend-down, and backend-restart paths
  - Then route creation/joining, invalid-route recovery, stable device identity, independent tab/session diagnostics, compact sync status, no hosted-demo fallback, and recovery/reset messaging are observed

- Scenario: Inspect final collaboration architecture docs
  - Given a developer wants to understand or debug the collaboration system
  - When they inspect root `ARCHITECTURE.md` and developer docs
  - Then they can identify the backend app, web app, tldraw sync packages, room registry, route contract, device/session identity model, environment variables, command workflow, and non-production limitations
  - And the docs state that `InMemorySyncStorage` is process-local, non-durable, and not a production persistence/scaling solution

- Scenario: Confirm package/API compatibility
  - Given tldraw sync APIs may change across versions
  - When the final sprint is evaluated
  - Then the implemented client and server package versions are recorded as compatible
  - And any deviations from the planned `useSync`, `TLSocketRoom`, or `InMemorySyncStorage` APIs are documented with rationale

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-5.1 | `docs/exec-plans/quality-commands.md` lists required backend `dev`/runtime, `test`, `typecheck`, `build`, and `smoke` commands; required web `test:unit`, `typecheck`, `build`, `test:e2e`, and `test:recovery` commands; and the integrated root workflow. | Inspect `docs/exec-plans/quality-commands.md`; run the documented root quality command and record the result in `build-log.md`. |
| AC-5.2 | Root `package.json` quality scripts are updated so the root handoff path is no longer web-only and runs backend, web, integrated collaboration, and recovery checks sequentially to avoid known `.next` races. | Run `pnpm check` from the repository root and record PASS/FAIL plus command coverage in `build-log.md`. |
| AC-5.3 | Root `ARCHITECTURE.md` exists and documents the final collaboration architecture: `apps/server`, `apps/web`, raw WebSocket sync route, route-backed rooms, device/session identity, status/recovery behavior, validation commands, tldraw sync package compatibility, and process-local storage limits. | Inspect `ARCHITECTURE.md`; verify it names the implemented package versions and does not claim auth, durability, deployment, scaling, or production asset storage exist. |
| AC-5.4 | Developer docs or active run artifacts document local startup order, expected ports, environment variables, room URL examples, health checks, sync endpoint expectations, and in-memory storage limitations. | Inspect updated docs; run `curl -fsS http://127.0.0.1:3001/health` and `curl -fsS http://127.0.0.1:3001/ready` against a local backend during runtime validation. |
| AC-5.5 | Integrated validation demonstrates two independent clients joining the same `/rooms/:roomId` route and observing shared tldraw document changes through the dedicated backend. | Run `pnpm --filter @production-spec-graph/web test:e2e` or the root workflow that includes it; record the two-context collaboration evidence in `build-log.md`. |
| AC-5.6 | Backend runtime validation covers health/readiness, valid WebSocket upgrade, invalid room id rejection, and same-room reuse. | Run `pnpm --filter @production-spec-graph/server smoke` and record the observed health, readiness, WebSocket, invalid-room, and room reuse evidence. |
| AC-5.7 | Client runtime validation covers root room creation, valid route join, invalid route recovery without sync mount, stable device identity across reload, independent same-device tab/session diagnostics, compact status display, no hosted-demo fallback, backend-down failure state, and backend restart recovery/reset messaging. | Run `pnpm --filter @production-spec-graph/web test:e2e` and `pnpm --filter @production-spec-graph/web test:recovery`; record the covered scenarios and results. |
| AC-5.8 | Final handoff records official tldraw sync docs consulted on 2026-06-01, package/API compatibility findings for `@tldraw/sync@5.0.1`, `@tldraw/sync-core@5.0.1`, `useSync`, `TLSocketRoom`, and `InMemorySyncStorage`, plus accepted limitations and deferred production concerns. | Inspect `build-log.md` and docs for compatibility and limitation notes; verify they match installed package versions from `package.json` files. |

## Test Strategy

### TDD Decision
Use TDD: No

Rationale:
- This sprint is primarily documentation, quality-command integration, and final runtime verification. Strict RED/GREEN/REFACTOR TDD is not the best fit for prose docs, package-script wiring, or handoff command lists.
- Deterministic behavior still must be validated through executable commands rather than review alone. Root script behavior, backend smoke behavior, Playwright E2E behavior, and recovery smoke behavior are the correctness evidence for this sprint.
- If implementation introduces any new deterministic helper logic beyond simple script/docs updates, focused tests should be added before or alongside that helper and the deviation recorded in `build-log.md`.

Planned evidence:
- Focused validation replacing strict TDD:
  - `pnpm --filter @production-spec-graph/server test`
  - `pnpm --filter @production-spec-graph/server typecheck`
  - `pnpm --filter @production-spec-graph/server build`
  - `pnpm --filter @production-spec-graph/server smoke`
  - `pnpm --filter @production-spec-graph/web test:unit`
  - `pnpm --filter @production-spec-graph/web typecheck`
  - `pnpm --filter @production-spec-graph/web build`
  - `pnpm --filter @production-spec-graph/web test:e2e`
  - `pnpm --filter @production-spec-graph/web test:recovery`
  - `pnpm check`
- Documentation validation:
  - Inspect root `ARCHITECTURE.md`.
  - Inspect `docs/exec-plans/quality-commands.md`.
  - Inspect any updated README/developer docs.

### E2E / Runtime Verification
The final behavior check must include the full integrated collaboration path:
- Backend health/readiness check against local `apps/server`.
- Backend smoke covering WebSocket connection, invalid room rejection, and same-room reuse.
- Web E2E covering route-backed room creation/joining, invalid route recovery, device identity persistence, same-device tab/session behavior, status/share UI, and two independent clients sharing a tldraw edit through the backend.
- Web recovery smoke covering backend unavailable before connect and backend interruption/restart after connect.
- Root `pnpm check` proving the repository handoff command exercises the updated integrated validation path.

If a browser-runtime timing issue prevents one automated observation after reasonable retries, the sprint may document a precise manual fallback only for that observation, but the final handoff must still include executable backend and client runtime checks.

## Modularity & Readability Plan
- Keep command orchestration in root `package.json` scripts concise and sequential; avoid shell complexity that obscures which package command failed.
- Keep `docs/exec-plans/quality-commands.md` as the authoritative quality-command checklist for future agents.
- Keep root `ARCHITECTURE.md` high-level and durable: describe system boundaries, data/sync flow, runtime configuration, validation, and limitations without duplicating every sprint detail.
- Update `apps/server/README.md` only if needed to correct stale statements from earlier sprints, especially now that the web client and route-backed rooms exist.
- Avoid mixing future roadmap promises into current architecture docs; clearly separate implemented behavior from deferred production concerns.
- Use short compatibility notes for tldraw sync APIs and installed package versions so future upgrades have a clear audit trail.

## Human Checkpoint
Yes. This is the final collaboration handoff sprint and should pause for manual validation after automated checks pass.

Recommended local commands:
```sh
pnpm check
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/web dev
```

Manual inspection:
- Open `http://127.0.0.1:3000/` and confirm it redirects to `/rooms/<safe-id>`.
- Open the same room URL in a second browser profile/context and confirm a simple tldraw edit syncs.
- Confirm the visible status reaches `Backend sync`.
- Confirm `window.__PSG_SYNC__` points to `ws://127.0.0.1:3001/sync/<roomId>` and not a hosted demo server.
- Stop and restart the backend and confirm the UI surfaces reconnect/reset expectations without leaving the room route.
- Read root `ARCHITECTURE.md` and `docs/exec-plans/quality-commands.md` for accuracy before closing the run.

## Technical Approach (brief)
Update the repository handoff path by folding server, web, E2E, and recovery checks into documented quality commands and the root script workflow. Create or update root `ARCHITECTURE.md` to describe the final F1-F4 collaboration architecture and F5 validation model. Refresh developer docs where they are stale, especially server README statements that still describe future web integration as pending. Run the full command set sequentially, record objective evidence in `build-log.md`, and keep any limitations explicit.

## Dependencies
- F1 completed backend package at `apps/server` with health/readiness, raw WebSocket sync route, room registry, and smoke command.
- F2 completed web sync client using `@tldraw/sync` and stable device identity.
- F3 completed canonical `/rooms/:roomId` route creation/joining and invalid-route recovery.
- F4 completed compact status, identity cues, multi-tab diagnostics, share affordance, and recovery smoke.
- Installed tldraw package set remains compatible across client/server: `tldraw@5.0.1`, `@tldraw/sync@5.0.1`, and `@tldraw/sync-core@5.0.1`.

## Estimated Complexity
M
