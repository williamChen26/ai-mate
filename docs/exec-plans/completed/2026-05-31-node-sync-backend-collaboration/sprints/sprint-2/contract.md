# Sprint 2 Contract: Web Client Sync Store and Stable Device Identity

## Feature
F2: Web Client Sync Store and Stable Device Identity

## Scope
Connect `apps/web` to the completed dedicated backend sync endpoint from F1 using the tldraw 5 client sync API. This sprint will add the compatible `@tldraw/sync` client dependency if absent, keep `tldraw` aligned with `5.0.1`, and update web package/API usage that blocks tldraw 5 compatibility, including the existing `apps/web/src/lib/tldraw-agent-actions.ts` typed-shape issue if needed for typecheck/build.

The web app will create or load a stable opaque device id in the browser, derive an independent per-tab/session id for sync, build the backend WebSocket sync URL from explicit configuration, and mount the existing full-screen tldraw canvas with a synchronized store for one known/default room. The known/default room is only a temporary F2 entry contract used to prove backend collaboration before F3 introduces route-driven room creation and joining.

Minimal loading and error states are in scope only to avoid blank pages and silent wrong-service connections while the sync store initializes or configuration is missing.

## Out of Scope
Route-driven room generation or joining, canonical room URLs, invalid room route recovery, share links, presence/status polish beyond minimal loading/error states, collaborator identity UI, multi-tab presence semantics beyond independent session ids, authentication, authorization, persistence, hosted demo sync, deployment work, and production media asset storage are out of scope.

## Behavior Scenarios
- Scenario: Create a stable device identity
  - Given a browser opens the web app for the first time
  - When the app initializes collaboration state
  - Then it creates an opaque random device id for that browser profile
  - And the same id is reused after reloads in the same browser profile
  - And a separate browser context/profile receives a different device id

- Scenario: Build a backend sync connection for the known/default room
  - Given the web app has a configured backend sync base URL and default room id
  - When the collaborative canvas initializes
  - Then it constructs a raw WebSocket URL for `/sync/:roomId?sessionId=:sessionId`
  - And the URL uses the configured backend rather than tldraw's hosted demo sync service
  - And unsafe or missing configuration produces a visible recoverable error state instead of a silent fallback

- Scenario: Connect the tldraw editor to backend sync
  - Given the backend service is running and the web app has a valid known/default room
  - When the tldraw canvas mounts
  - Then the app creates a synchronized store through `useSync` from `@tldraw/sync` or the compatible tldraw 5.0.1 client API
  - And the existing first-screen editable canvas remains usable while the backend room is the shared document source

- Scenario: Share edits between independent clients
  - Given two independent browser contexts open the web app with the same known/default room configuration
  - When one client creates, edits, or deletes a simple tldraw shape
  - Then the other client observes the document change through the dedicated backend
  - And neither client connects to a hosted demo sync server

- Scenario: Maintain tldraw 5 client compatibility
  - Given the web package uses `tldraw@5.0.1`
  - When web typecheck, build, unit tests, and E2E/runtime checks run
  - Then package imports, action helpers, and shape partial types are compatible with tldraw 5.0.1 and `@tldraw/sync`

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| AC-2.1 | `apps/web` depends on the compatible `@tldraw/sync` client package and resolves `tldraw@5.0.1` without using tldraw's hosted demo sync server. | Run `pnpm --filter @production-spec-graph/web list tldraw @tldraw/sync --depth 0`; inspect package usage for absence of hosted demo sync URLs. |
| AC-2.2 | The web app creates an opaque random stable device id, persists it across reloads in the same browser profile, and produces different ids for independent browser contexts/profiles. | Focused unit tests for the device identity module plus a browser/runtime check that reloads one context and opens a second independent context. |
| AC-2.3 | Backend sync URL/session URL construction is configuration-driven and targets the F1 endpoint shape `/sync/:roomId?sessionId=:sessionId` for the known/default room, with no silent fallback when configuration is missing or invalid. | Focused unit tests for sync configuration and URL construction, including missing/invalid configuration cases. |
| AC-2.4 | The tldraw canvas mounts with a synchronized store created by `useSync` or the compatible tldraw 5.0.1 sync client API, while retaining the existing full-screen editable canvas shell and minimal loading/error states. | `pnpm --filter @production-spec-graph/web test:unit`, `pnpm --filter @production-spec-graph/web typecheck`, and `pnpm --filter @production-spec-graph/web build`; E2E/runtime browser observation of the canvas loading without a blank page. |
| AC-2.5 | Two independent web clients in the same known/default room can share a document through the dedicated backend: a simple shape created/edited/deleted in one client becomes observable in the other. | Start `apps/server` and `apps/web`, then run a Playwright/browser runtime collaboration check with two independent contexts against the same configured room. |
| AC-2.6 | Web client package/API usage is aligned with tldraw 5.0.1, including fixing the broad `TldrawShapePartial` compatibility issue in `apps/web/src/lib/tldraw-agent-actions.ts` if it blocks typecheck/build. | `pnpm --filter @production-spec-graph/web typecheck` and targeted tests for any changed deterministic action/type helper behavior. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
- Stable device id creation and persistence is deterministic boundary logic with privacy and identity requirements.
- Sync base URL/session URL construction is deterministic configuration and protocol mapping logic that must not accidentally target the wrong service.
- tldraw 5 action/type compatibility is deterministic type/data-shape behavior when helper code must be changed to satisfy the new package API.
- The React `useSync` wiring and visual loading/error shell are mostly integration behavior, so they should be validated through focused component/runtime checks rather than over-specified unit tests.

Planned evidence:
- RED: add focused tests for stable device identity storage/reuse/new-context behavior, sync URL/session URL construction and missing-config errors, and any required tldraw 5 action/type helper compatibility before implementation.
- GREEN: implement the collaboration client modules and compatibility fixes until the focused tests, web typecheck, and build pass.
- REFACTOR: keep identity/config/sync-url helpers separate from React component wiring, and clean up duplicated literals while keeping focused tests green.

### E2E / Runtime Verification
Final behavior must be verified with a runtime two-client collaboration check:

1. Start the F1 backend locally with the documented server dev command.
2. Start `apps/web` with local backend sync configuration and a single known/default room id.
3. Open two independent browser contexts to the same app entry point.
4. Create, edit, or delete a simple tldraw shape in client A.
5. Observe the corresponding document change in client B through the dedicated backend.

If full Playwright automation is timing-sensitive because tldraw canvas operations or sync readiness are not directly observable, the sprint may use a precise browser runtime smoke with bounded waits and documented manual observation steps. Build/typecheck alone is not sufficient for AC-2.5.

## Modularity & Readability Plan
Likely files/modules to change:
- `apps/web/package.json` and lockfile: add `@tldraw/sync` and keep tldraw packages aligned with `5.0.1`.
- `apps/web/src/lib/device-identity.ts` or similar: own stable device id generation, persistence, and browser-storage boundary validation.
- `apps/web/src/lib/sync-config.ts` or similar: own environment parsing, default room id, sync URL/session URL construction, and missing/invalid config errors.
- `apps/web/src/components/CanvasShell.tsx` or the current tldraw canvas entry component: wire `useSync` into the existing full-screen editor and show minimal loading/error states.
- `apps/web/src/lib/tldraw-agent-actions.ts`: update only the tldraw 5 typed-shape compatibility surface if required by package alignment.
- Existing web unit/E2E test files or new focused tests beside the modules above.

The implementation should keep deterministic identity/config logic outside React components so tests document the boundary behavior. Component changes should stay limited to sync-store wiring and minimal status rendering; route behavior must not be introduced in this sprint. Avoid large mixed-purpose modules by keeping tldraw sync configuration, identity generation, and canvas rendering in separate cohesive files.

## Human Checkpoint
Pause after Sprint 2 because it creates the first locally inspectable web collaboration slice.

Recommended local commands:

```sh
pnpm --filter @production-spec-graph/server dev
pnpm --filter @production-spec-graph/web dev
pnpm --filter @production-spec-graph/web test:unit
pnpm --filter @production-spec-graph/web typecheck
pnpm --filter @production-spec-graph/web build
pnpm --filter @production-spec-graph/web test:e2e
```

What to inspect:
- The web app loads the existing full-screen tldraw canvas while connected to the local backend.
- Two independent browser contexts in the same known/default room share simple shape edits.
- Reloading one context preserves the same browser/device id, while an independent browser context uses a different device id.
- Network traffic targets the local dedicated backend `/sync/:roomId?sessionId=...` endpoint and not a hosted demo sync service.

## Technical Approach (brief)
Add the official tldraw sync client package matching the installed tldraw 5.0.1 stack, then introduce small web-side modules for stable device identity and sync URL construction. Wire the existing canvas shell to a synchronized tldraw store for a single known/default room, using an independent session id per tab and the stable device id as browser/device identity input where the API supports it. Keep fallback UI minimal: loading while sync initializes and a clear recoverable error if required sync configuration is missing or invalid. Update only the tldraw 5 compatibility issues needed to make the web package typecheck and run.

## Dependencies
F1 must be complete and locally runnable: `apps/server` exposes `/health`, `/ready`, and raw WebSocket sync at `/sync/:roomId?sessionId=:sessionId`, backed by process-local `TLSocketRoom` plus `InMemorySyncStorage` using `@tldraw/sync-core@5.0.1`.

The web package currently resolves `tldraw@5.0.1`; `@tldraw/sync` is not yet installed/listed and must be added in this sprint.

## Estimated Complexity
M
