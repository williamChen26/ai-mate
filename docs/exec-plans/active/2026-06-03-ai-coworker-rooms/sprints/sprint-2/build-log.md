# Build Log: Sprint 2 — Canvas Context and Operation Event Stream

## Round 1

### What Was Built
- `packages/shared`: added `@production-spec-graph/shared`, a Zod-backed shared contracts package for AI input-side canvas snapshots, room operation events, context feeds, and freshness metadata.
- `packages/shared/src/context.test.ts`: added shared schema tests for valid/invalid snapshots, input event variants, explicit rejection of an `agent-output` event kind, and empty room context feeds.
- `apps/server/src/context/room-context-store.ts`: added process-local room context storage with snapshot validation, event validation, bounded event windows, freshness counters, room mismatch rejection, and empty feed generation.
- `apps/server/src/context/room-context-store.test.ts`: added deterministic store tests for snapshot storage, cross-room rejection, bounded event order, changed-since-snapshot freshness, and quiet rooms.
- `apps/server/src/http/app.ts`: added context GET/POST endpoints, minimal CORS support for context publishing from the web app, and context-store wiring.
- `apps/server/src/http/app.test.ts`: added endpoint tests for snapshot/event submission, diagnostics reads, cross-room rejection, and CORS preflight.
- `apps/server/src/sync/room-registry.ts`: exposed room-scoped agent session lookup so context feeds can include Sprint 1 lifecycle correlation.
- `apps/web/src/lib/room-context.ts`: added tldraw-derived snapshot extraction, rich-text text extraction, operation event helpers, fetch publisher, network-error tolerant publish behavior, context base URL derivation, and `window.__PSG_ROOM_CONTEXT__` runtime hook registration.
- `apps/web/src/lib/room-context.test.ts`: added web extraction/publisher tests, chat-boundary text redaction test, and network failure handling test.
- `apps/web/src/components/canvas-shell.tsx`: registered the room context runtime hook from the mounted tldraw editor.
- `apps/web/e2e/canvas-smoke.spec.ts`: added runtime E2E coverage for web -> server context publishing and adjusted shape-sync assertions to use context shape inventory rather than brittle full-text accessibility matching.
- `package.json`, `apps/server/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`: wired the shared package into workspace scripts and app dependencies.
- `ARCHITECTURE.md` and `docs/exec-plans/quality-commands.md`: documented the shared contracts package, context endpoints, and updated quality gate.

### Acceptance Criteria Status
| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-2.1 | A shared `@production-spec-graph/shared` package exists with Zod schemas and exported TypeScript types for canvas snapshots, operation events, context freshness, and room context feed data. | PASS | `packages/shared/src/index.ts`; shared tests/typecheck/build pass. |
| AC-2.2 | The shared schema explicitly covers AI input-side data only and does not define agent output, suggestion, action proposal, or canvas mutation schemas. | PASS | Shared exports only snapshot/event/feed schemas; `agent-output` appears only as a rejected test fixture in `context.test.ts`. |
| AC-2.3 | Server can validate, store, and expose the latest canvas snapshot for a valid room, associated with room id and agent lifecycle/session context. | PASS | `room-context-store.test.ts` and `http/app.test.ts` verify snapshot storage, `/rooms/:roomId/context`, and agent session correlation. |
| AC-2.4 | Server can validate, append, bound, and expose recent operation events for a room, preserving event order and freshness metadata. | PASS | Store tests append canvas-change/chat-boundary events with event limit trimming and changed-since-snapshot metadata. |
| AC-2.5 | Web can extract and publish a serializable tldraw-derived snapshot and normalized operation events for the active route room. | PASS | Web unit tests cover extraction/publishing; E2E publishes through `window.__PSG_ROOM_CONTEXT__` to the backend and reads server context diagnostics. |
| AC-2.6 | Empty canvas, no-selection, quiet-room, and changed-since-snapshot cases are represented without errors or fabricated intent. | PASS | Shared empty feed test, server quiet-room test, web empty snapshot publisher test, and E2E changed-since-snapshot assertion. |
| AC-2.7 | Existing room sync and Sprint 1 agent lifecycle diagnostics continue to work. | PASS | `pnpm check` passed; server smoke still reports `agentLifecycle`, web E2E sync test still passes. |

### Behavior Scenario Evidence
- Server receives a canvas snapshot for the room: verified by `http/app.test.ts` POST `/rooms/alpha/context/snapshot` and E2E publishing via `window.__PSG_ROOM_CONTEXT__.publishSnapshot()`.
- User operations are captured as recent behavior: verified by shared event tests, server store tests for canvas/chat events, and E2E `emitCanvasChange` + `emitChatBoundary` producing recent events on the server feed.
- Snapshot and event freshness is explicit: verified by store tests and E2E asserting `changedSinceSnapshot: true` after events arrive after the snapshot.
- Empty or quiet rooms still produce context: verified by `createEmptyRoomContextFeed` shared test and server quiet-room test.
- Invalid or cross-room context is rejected: verified by server store and endpoint tests returning `ROOM_MISMATCH` without mutating previous context.

### TDD Decision & Evidence
Use TDD: Yes

Rationale:
F2 introduced runtime schemas, boundary validation, route/payload matching, event retention, freshness counters, and context normalization. These are deterministic protocol rules where tests should define behavior first.

Evidence:
- RED: initial focused tests failed because `packages/shared/src/index.ts` did not exist, `@production-spec-graph/shared` could not resolve from server/web, `room-context-store.js` did not exist, and web `room-context.js` did not exist.
- GREEN: implemented shared schemas, server context store/routes, web extractor/publisher/hook, and E2E coverage until shared/server/web tests passed.
- REFACTOR: fixed real runtime findings from E2E/recovery by adding context endpoint CORS and making web publish failures network-error tolerant so backend restarts do not create page errors.

### E2E / Runtime Verification
Commands run:
- `pnpm --filter @production-spec-graph/shared test`: PASS, 1 file / 4 tests.
- `pnpm --filter @production-spec-graph/shared typecheck`: PASS.
- `pnpm --filter @production-spec-graph/shared build`: PASS.
- `pnpm --filter @production-spec-graph/server test`: PASS, 6 files / 27 tests.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS with elevated local-port permission.
- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 7 files / 34 tests.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS with elevated local-port/browser permission, 5 tests.
- `pnpm --filter @production-spec-graph/web test:recovery`: PASS with elevated process/port permission.
- `git diff --check`: PASS.
- `pnpm check`: PASS with elevated local-port/browser permission.

Runtime issues found and fixed:
- Browser context publishing initially failed with `Failed to fetch` because context POST endpoints needed CORS preflight support.
- Recovery smoke initially failed because backend restarts caused context publish fetch rejections to surface as page errors. Publisher network failures now return inspectable `{ ok: false }` results.

### Modularity & Readability Notes
The shared package owns schemas and inferred types. Server context storage is separate from Fastify route formatting and uses shared schemas for validation. Web extraction/publishing is isolated in `room-context.ts`; `CanvasShell` only registers the mounted runtime hook. No app defines duplicate schema copies. The context feed carries facts and freshness only; no AI intent, output, proposal, or mutation schema was introduced.

### Human Checkpoint
Pause after Sprint 2.

Recommended local commands:
- `pnpm --filter @production-spec-graph/shared test`
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection:
- Start backend and web.
- Open a room and wait for sync.
- In the browser console, inspect `window.__PSG_ROOM_CONTEXT__`.
- Call `await window.__PSG_ROOM_CONTEXT__.publishSnapshot()`.
- Call `await window.__PSG_ROOM_CONTEXT__.emitCanvasChange({ summary: "manual check" })`.
- Call `await window.__PSG_ROOM_CONTEXT__.emitChatBoundary("hello")`.
- Call `await window.__PSG_ROOM_CONTEXT__.getServerContext()` or open `http://127.0.0.1:3001/rooms/<roomId>/context`.
- Confirm the feed includes latest snapshot metadata, recent events, freshness counters, and `agentSessionId`, while no AI output/action schema exists.

### Decisions Made
- Added `packages/shared` now because F2 is the first cross-app protocol. Zod is used there so runtime validation and TypeScript types stay in one source.
- Deferred AI output schema to F5. F2 only defines AI input-side context and user operation facts.
- Used process-local context storage, matching existing room/sync non-durable storage.
- Used a developer-facing web runtime hook for E2E/manual validation instead of visible UI, because F4 owns the user-facing AI surface.
- Added minimal CORS only for configured origins so browser publishing can work without adding a new CORS dependency.

### Quality Command Results
- `pnpm check`: PASS.
- `git diff --check`: PASS.

### Known Issues
- Context publishing is currently hook/manual driven; automatic debounced event streaming can be expanded in a later sprint if needed.
- The feed is process-local and resets on backend restart.
- `apps/mate` does not ingest the shared contract yet; that is F3.
- The snapshot is intentionally compact and does not preserve every tldraw internal record.

### Test Results
- Shared: 4 tests passed.
- Server: 27 tests passed.
- Web unit: 34 tests passed.
- Web E2E: 5 tests passed.
- Web recovery smoke: PASS.
