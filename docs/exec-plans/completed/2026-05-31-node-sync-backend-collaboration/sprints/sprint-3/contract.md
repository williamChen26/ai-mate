# Sprint 3 Contract: Route-Driven Room Creation and Joining

## Feature
F3: Route-Driven Room Creation and Joining

## Scope
Implement route-driven room entry in `apps/web` so the URL becomes the collaboration room contract. Replace Sprint 2's fixed default room id `psg-default-room` with route-derived room id behavior:

- Opening `/` generates one safe unique room id, redirects/navigates to `/rooms/:roomId`, and only then initializes backend sync for that room.
- Opening `/rooms/:roomId` with a valid room id joins exactly that room id and preserves the canonical URL across reloads, shared links, browser back/forward, and multi-tab opens.
- Opening an invalid, unsafe, empty, malformed, or oversized room route never sends the unsafe id to the backend; the app must either show an explicit recoverable invalid-room state or navigate to a newly generated valid `/rooms/:roomId` route before sync starts.
- Canonical room routes are `/rooms/:roomId`. This is readable, matches the spec examples, and avoids query-param room identity.
- `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` remains explicitly required from F2. F3 must not add any silent backend URL fallback while changing room behavior.

## Out of Scope
- Presence/status polish, collaborator display improvements, and reconnect/failure UX beyond the existing F2 configuration error behavior.
- Backend persistence, database storage, room durability, room listing, and room introspection endpoints.
- Authentication, authorization, invite permissions, access control, or user accounts.
- Route sharing UI affordances beyond the URL itself, such as copy-link buttons or invite dialogs.
- F4 failure-recovery, presence, and deeper multi-tab session-status work.
- Changing the F1 backend sync endpoint contract except as needed to consume already-valid route room ids from the web client.

## Behavior Scenarios
- Scenario: Enter without a room id
  - Given a user opens `/`
  - When the app initializes routing
  - Then it creates a safe unique room id
  - And the browser navigates to `/rooms/:roomId`
  - And backend sync is not initialized until the canonical route contains the generated valid room id

- Scenario: Join from a shared room route
  - Given a user opens `/rooms/shared-safe-room`
  - When the app validates the route room id
  - Then it joins exactly `shared-safe-room` instead of creating a new room
  - And a second client opening the same URL joins the same collaborative document

- Scenario: Recover from an invalid room route
  - Given a user opens `/rooms/../../unsafe` or another invalid/oversized/unsupported room id
  - When the app validates the route
  - Then it rejects the unsafe id before building a sync URI
  - And no backend WebSocket request uses the unsafe id
  - And the user reaches an explicit recoverable invalid-room state or a generated valid `/rooms/:roomId` route

- Scenario: Avoid room-generation loops
  - Given a user reaches a generated `/rooms/:roomId` route from `/`
  - When the user reloads, opens the same URL in another tab, or navigates back and forward
  - Then the existing valid route is reused
  - And no duplicate room ids are generated for that same room entry
  - And the app does not enter a redirect loop

- Scenario: Share edits through a route-backed room
  - Given two independent browser contexts open the same `/rooms/:roomId` URL
  - When one client creates or edits a tldraw document shape
  - Then the other client observes the edit through the dedicated backend sync room
  - And both clients expose runtime diagnostics showing the same route-derived room URI

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-3.1 | Opening `/` generates a safe unique room id, navigates to canonical `/rooms/:roomId`, and does not initialize sync with the fixed F2 default room or any room before route validation succeeds. | Focused unit tests for route decisions and Playwright E2E opening `/`, observing canonical URL, and checking runtime sync diagnostics. |
| AC-3.2 | Opening `/rooms/:roomId` with a valid room id joins that exact room id, preserves the canonical URL across reloads, and uses that id when building the sync URI. | Focused unit tests for canonical route parsing/building plus Playwright E2E reload check against a known room URL. |
| AC-3.3 | Invalid, oversized, empty, malformed, or unsafe route room ids are rejected client-side and never sent to the backend as sync room identifiers. | Unit tests for validation and sync URI gating; runtime check or E2E network/diagnostic assertion proving unsafe ids do not appear in backend-bound sync URIs. |
| AC-3.4 | Reload, same-URL multi-tab open, and browser back/forward navigation do not create duplicate room-generation loops or disconnect the user from the intended valid room. | Playwright E2E covering reload, second tab/context on the same URL, and back/forward navigation where practical; unit tests for no-loop redirect decisions. |
| AC-3.5 | Two clients opening the same `/rooms/:roomId` URL share document edits through the existing dedicated backend sync service. | Existing integrated Playwright collaboration test updated from fixed `psg-default-room` to route-backed room URLs; it must start server and web and verify edit propagation between two independent contexts. |
| AC-3.6 | Missing `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` still shows the F2 visible sync configuration error and never falls back silently while route behavior is being added. | Unit test for required backend URL behavior plus existing visible-error runtime coverage if already present. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
- This sprint touches deterministic routing and boundary-safety logic: route room id parsing/validation, safe unique room id generation, canonical route building, sync gating, and no-loop redirect decisions.
- These behaviors are small enough to define with focused unit tests before implementation and are security-relevant because unsafe route data must never reach the backend.
- React/Next wiring and Playwright coverage will validate the user-visible flow after the deterministic logic is green.

Planned evidence:
- RED: Add focused tests first for room route parsing/validation, generated room id safety/uniqueness shape, canonical `/rooms/:roomId` construction, invalid-route handling decisions, root-entry redirect decisions, and preservation of the F2 required backend URL error.
- GREEN: Implement the route helpers and web routing glue until those unit tests pass.
- REFACTOR: Keep route decision logic independent from React components where practical, then rerun the focused unit tests and E2E tests after any cleanup.

### E2E / Runtime Verification
Run the repository's integrated browser validation for the web package after starting the existing F1 server and F2 web dev surface through the configured Playwright flow:

- Open `/` and verify it navigates to `/rooms/:roomId` with a safe id before sync diagnostics show a backend room URI.
- Open `/rooms/e2e-shared-room` in two independent browser contexts and verify both join the exact same room URL and share a document edit.
- Open an invalid/unsafe room URL and verify no unsafe id appears in the client sync URI diagnostics or backend-bound WebSocket target; confirm the UI exposes recoverable behavior or navigation to a valid route.
- Reload a valid room, open the same room in another tab/context, and exercise back/forward where practical to verify no duplicate generation loop.

Expected commands include:

```sh
pnpm --filter @production-spec-graph/web test:unit
pnpm --filter @production-spec-graph/web test:e2e
pnpm --filter @production-spec-graph/web typecheck
pnpm --filter @production-spec-graph/web build
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
pnpm --filter @production-spec-graph/server build
pnpm --filter @production-spec-graph/server smoke
pnpm check
```

If the current `docs/exec-plans/quality-commands.md` remains web-focused, implementation should infer the smallest relevant server checks from Sprint 2's build log and record the exact commands in `build-log.md`.

## Modularity & Readability Plan
Keep route behavior in a small deterministic boundary, likely near the existing web sync configuration helpers, instead of embedding validation and redirect decisions inside a large component. Expected boundaries:

- A route room module for parsing route params, validating room ids, generating safe room ids, building canonical `/rooms/:roomId` paths, and deciding whether to join, redirect/create, or recover from invalid input.
- Existing sync configuration code should consume only validated room ids and should continue enforcing explicit `NEXT_PUBLIC_PSG_SYNC_SERVER_URL`.
- React/Next route components should stay thin: derive the route decision, render existing canvas or recoverable route state, and avoid direct ad hoc string validation.
- Tests should document the accepted room id character set, length bounds, canonical route behavior, and no-loop cases.

Avoid introducing backend coupling, global mutable route state, or broad rewrites of the canvas shell. Add comments only around non-obvious redirect-loop prevention or sync-gating logic.

## Human Checkpoint
Pause after Sprint 3 for manual validation because this sprint changes the primary collaboration entry contract.

Recommended local commands:

```sh
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/web dev
```

Inspect:
- Opening `http://127.0.0.1:3000/` lands on `http://127.0.0.1:3000/rooms/<safe-id>`.
- Reloading that URL keeps the same room.
- Opening the copied `/rooms/<safe-id>` URL in a second browser profile/context joins the same document and shares a simple tldraw edit.
- Opening an unsafe route such as `/rooms/%2E%2E%2Fbad` does not attempt backend sync with the unsafe value and provides the implemented recovery behavior.
- Running web without `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` still shows the existing visible sync configuration error.

## Technical Approach (brief)
Add a deterministic route-room helper layer and tests first, then wire Next routing so `/` becomes a create-and-canonicalize entry point and `/rooms/:roomId` becomes the join entry point. Pass only validated route room ids into the existing F2 sync configuration and `useSync` flow. Update integrated Playwright coverage from fixed `psg-default-room` to route-backed room URLs while preserving the explicit backend URL requirement. Keep invalid route handling recoverable without sending unsafe ids to the backend.

## Dependencies
- F1 backend complete at `apps/server` with `/sync/:roomId?sessionId=:sessionId` and `@tldraw/sync-core@5.0.1`.
- F2 web complete with `@tldraw/sync@5.0.1`, `tldraw@5.0.1`, `useSync` auto-appending `sessionId` and `storeId`, stable device identity, visible missing-config error, and integrated two-context sync E2E.
- Existing Playwright flow that starts both server and web for collaboration validation.

## Estimated Complexity
M
