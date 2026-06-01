# Sprint 4 Contract: Presence, Status, Multi-Tab Behavior, and Failure Recovery

## Feature
F4: Presence, Status, Multi-Tab Behavior, and Failure Recovery

## Scope
Implement a compact, developer-understandable collaboration layer on top of the existing F1-F3 tldraw sync flow. This sprint will improve the web app's visible sync status, collaborator identity cues where the installed tldraw 5.0.1 APIs support them, same-device multi-tab session behavior, a safe room-share affordance if it can stay route-local, and recoverable UI behavior when the configured backend is unavailable or interrupted.

The route-driven room contract from Sprint 3 remains the source of room identity. The explicit `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` requirement from Sprint 2 remains unchanged. The backend remains a dedicated `apps/server` process using process-local in-memory tldraw sync storage.

## Out of Scope
- Authentication, authorization, invite systems, access control, account names, or user profiles.
- Durable persistence, production deployment, horizontal scaling, managed storage, or asset storage hardening.
- Changing the canonical room route away from `/rooms/:roomId`.
- Reintroducing `NEXT_PUBLIC_PSG_SYNC_ROOM_ID` or any non-route room selection mechanism.
- Replacing tldraw sync, adding Socket.IO, or depending on tldraw hosted demo sync.
- Building a large custom collaboration roster if tldraw 5.0.1 does not expose stable collaborator/presence APIs for it.
- Updating repository-wide quality command documentation; F5 owns final docs and quality command expansion, though this sprint may run inferred backend checks before handoff.

## Behavior Scenarios
- Scenario: See collaboration status
  - Given a user opens a valid collaborative room route
  - When the tldraw sync store is connecting, synced, reconnecting/disconnected, using local cache, or in an error state
  - Then the app exposes a compact status cue that matches the observable sync state
  - And the status cue does not cover, resize, or break the tldraw canvas
  - And developer diagnostics expose the current room, device id, tab/session id, status, and connection state without relying on unsafe room input

- Scenario: Distinguish collaborators
  - Given two independent browser contexts join the same valid room
  - When both clients initialize tldraw sync and interact with the canvas
  - Then collaborator identity cues distinguish participants where the installed tldraw APIs support user identity or presence
  - And each browser/device keeps a stable privacy-safe identity cue across reloads
  - And any fallback diagnostics clearly show distinct device identities without promising unsupported tldraw internals

- Scenario: Use multiple tabs on one device
  - Given one browser profile already has a stable device id in local storage
  - When the same room URL is opened in two tabs from that same profile
  - Then both tabs preserve the same stable device id
  - And each tab creates an independent live session id
  - And the tabs do not overwrite each other's diagnostics, session state, or collaborator behavior in a way that collapses them into one active client

- Scenario: See a safe share affordance
  - Given a user is in a valid room route
  - When the user uses the room share affordance
  - Then the app offers only the current canonical room URL for sharing or copying
  - And it does not expose tokens, auth claims, server internals, or unsafe route input
  - And the affordance remains compact and does not obscure the canvas

- Scenario: Recover from backend interruption
  - Given one or more clients are connected to an in-memory backend room
  - When the backend is unavailable before connect, disconnects after connect, or restarts with process-local storage reset
  - Then clients surface a recoverable disconnected/reconnecting/error or reset expectation without crashing
  - And the user/developer can tell that room state may have been lost because the backend uses non-durable process-local storage
  - And reloading or reconnecting to the same valid route does not create a new room id or silently switch to a hosted demo server

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-4.1 | The web UI exposes compact collaboration status for connecting/loading, synced online, offline/reconnecting/disconnected, local-cache, and error states, with stable layout that keeps the tldraw canvas usable. | `pnpm --filter @production-spec-graph/web test:unit` for deterministic status mapping plus `pnpm --filter @production-spec-graph/web test:e2e` assertions against visible status text/state during normal and failure paths. |
| AC-4.2 | Presence or collaborator identity is configured through supported tldraw 5.0.1 APIs so independent clients can be distinguished; stable device-level identity cues survive reloads where supported. Unsupported tldraw internals must be documented in `build-log.md` rather than simulated. | Implementation-time API verification from installed package types/runtime, focused tests for identity cue derivation, and a two-browser Playwright check that observes distinct clients through tldraw-visible cues where possible plus `window.__PSG_SYNC__` diagnostics as a stable fallback. |
| AC-4.3 | Same-device multi-tab behavior preserves one stable device id while creating independent tab/session ids for each tab, with no shared mutable tab state or session-id collision. | Unit tests for session/device derivation plus Playwright opening two pages in the same browser context and asserting same `deviceId`, different `sessionId`, same route room URI, and both pages remain editable/synced. |
| AC-4.4 | A safe share affordance, if implemented in this sprint, exposes only the current canonical `/rooms/:roomId` URL and provides visible copy/fallback feedback without leaking backend URL, auth data, or unsafe route input. If browser clipboard permissions make automation brittle, fallback to verifying the displayed/generated URL string and button feedback. | Focused unit test for share URL construction plus Playwright interaction on a valid room route. If the Clipboard API is unavailable in CI, verify the affordance state and generated URL without requiring OS clipboard access. |
| AC-4.5 | Backend unavailable before connect produces a recoverable visible sync configuration/connection failure state and no blank page or crash. The app must not silently connect to tldraw demo sync or generate a new room id. | Executable runtime check via Playwright or an equivalent web runtime script against a running web app configured to an unavailable local backend port; assert visible failure/status, stable `/rooms/:roomId`, no uncaught runtime error, and diagnostics still point at the configured backend URL. |
| AC-4.6 | Backend interruption/restart after clients connect surfaces reconnect/reset behavior and documents the process-local storage reset expectation. After backend restart, reconnecting clients remain on the same route and either resync or visibly indicate the in-memory reset without crashing. | Executable runtime recovery check that controls a local backend process lifecycle where practical; otherwise a documented fallback runtime check starts web and backend separately, kills/restarts backend, then verifies status/reconnect/reset behavior from browser diagnostics and UI. |
| AC-4.7 | Existing F1-F3 guarantees are preserved: route room ids remain canonical, invalid room routes do not start sync, explicit `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` is still required, and two independent clients can still share a tldraw document edit in the same route-backed room. | Existing and extended `pnpm --filter @production-spec-graph/web test:e2e`, `pnpm --filter @production-spec-graph/web test:unit`, plus inferred backend checks `pnpm --filter @production-spec-graph/server test`, `typecheck`, `build`, and `smoke`. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
- Use TDD for deterministic collaboration state logic: mapping tldraw store statuses/connection states to UI labels, deriving privacy-safe identity display metadata, creating independent tab/session diagnostics, and constructing safe share URLs.
- Strict TDD is not required for the tldraw/React wiring itself because the exact supported presence/status API surface must be verified against installed `tldraw@5.0.1` and `@tldraw/sync@5.0.1` during implementation. That wiring will be validated through typecheck and browser runtime checks instead of pretending pure unit tests can prove tldraw internals.
- Backend interruption behavior is asynchronous and process-lifecycle dependent, so deterministic helper behavior should be tested first, while final confidence should come from executable runtime checks.

Planned evidence:
- RED: Add focused unit tests before implementation for status label/model mapping, collaborator identity cue derivation, same-device multi-tab session independence, and canonical share URL construction.
- GREEN: Implement the smallest helper modules and component wiring needed for those tests to pass, then update Playwright scenarios for normal presence/status, multi-tab, backend-down, and backend-restart/reconnect/reset behavior.
- REFACTOR: Keep pure helpers outside React, keep tldraw-specific wiring localized to the canvas collaboration layer, and keep tests green after any cleanup.

### E2E / Runtime Verification
The primary executable final-behavior check should be `pnpm --filter @production-spec-graph/web test:e2e`, extended or supplemented so it covers:
- Two independent browser contexts in one route-backed room: visible status reaches the expected synced state, collaborator/device identity cues are distinguishable where tldraw supports them, and a document edit still syncs.
- Same-device multi-tab behavior: two pages in the same browser context share `deviceId`, use different `sessionId` values, remain on the same room route, and both stay editable.
- Backend unavailable before connect: web runs with `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` pointing to an unused local port and shows recoverable connection/error status without blanking the canvas shell or changing rooms.
- Backend interruption/restart after connect: a runtime check controls the local backend lifecycle, observes disconnected/reconnecting/error status after stop, restarts the backend, and verifies reconnect or visible process-local reset expectations.

If Playwright's configured `webServer` lifecycle makes backend restart control impractical inside the existing E2E command, implementation may add a focused runtime script or a dedicated Playwright project/script for recovery. The build log must state the exact command, why that path was used, and what was observed.

## Modularity & Readability Plan
- Keep deterministic collaboration presentation logic in small library modules, likely under `apps/web/src/lib/`, such as status view-model mapping, identity cue derivation, and share URL construction.
- Keep `CanvasShell` focused on composition: calling `useSync`, passing supported user/presence configuration to tldraw, rendering compact chrome, and exposing stable diagnostics.
- Avoid expanding `CanvasShell` into a large mixed-responsibility file. If status, share UI, or diagnostics become non-trivial, extract small component/helper boundaries under `apps/web/src/components/`.
- Validate boundary inputs before use: room ids continue through existing route validation, share URLs are built from canonical browser location/route state, and backend URLs remain explicit config.
- Use immutable object creation for diagnostics and view models so multiple tabs/pages do not share mutable state.
- Add comments only around non-obvious tldraw API compatibility or process-lifecycle recovery behavior. Unit and E2E tests should document normal status, multi-tab, and interruption expectations.

## Human Checkpoint
Pause after Sprint 4 for manual validation before proceeding to F5.

Recommended local commands:

```sh
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/web dev
```

Manual inspection:
- Open one `/rooms/<safe-id>` URL in two independent browser profiles and confirm visible status/presence cues distinguish clients where supported.
- Open the same URL in two tabs in one browser profile and confirm diagnostics show the same device id but different session ids.
- Use the share affordance and confirm it exposes only the current room URL.
- Stop and restart the backend while the room is open. Confirm the UI surfaces disconnect/reconnect or reset expectations and does not crash, change room ids, or fall back to demo sync.

## Technical Approach (brief)
Start by extracting pure status, identity-cue, session-diagnostic, and share-url helpers with focused unit tests. Wire those helpers into the existing route-backed `CanvasShell` while verifying installed tldraw 5.0.1 user/presence/status APIs before relying on them. Extend Playwright coverage to exercise two-client, same-context multi-tab, backend-down, and backend-interruption flows against the real local backend and web app. Keep backend changes minimal unless a small test/runtime hook is required to make interruption verification reliable.

## Dependencies
- F1 completed backend package at `apps/server` with health/readiness and raw tldraw sync endpoint.
- F2 completed web sync store wiring, stable device id, per-tab session id, and explicit backend URL config.
- F3 completed route-driven rooms at `/rooms/:roomId` with invalid route recovery.
- Installed package compatibility with `tldraw@5.0.1`, `@tldraw/sync@5.0.1`, and `@tldraw/sync-core@5.0.1`.
- Local browser/runtime permissions sufficient for Playwright and backend process lifecycle checks.

## Estimated Complexity
M
