# Sprint 1 Build Log

## Summary

Implemented automatic tldraw context publishing for AI Drop. The web runtime now
listens to user document/session changes, publishes operation evidence and
snapshots to the server, and notifies AI Drop after settled authoring changes so
completion can run without manual console calls.

## Behavior Scenario Evidence

- Scenario: Canvas edits publish operation evidence
  - Extended `RoomContextEditor` with optional `store.listen`.
  - `registerRoomContextRuntime` now binds document-scoped tldraw store
    listeners by default.
  - Document changes debounce into `canvas-change`, then publish a fresh
    snapshot.

- Scenario: Selection and viewport are captured
  - Added session-scoped listeners for selection and viewport changes.
  - Selection events are deduplicated by selected shape id set.
  - Viewport events are deduplicated and debounced by bounds/zoom.

- Scenario: AI Drop triggers after authoring
  - Added `ROOM_CONTEXT_AUTO_EVENT` as the browser-local signal after automatic
    context publication.
  - `AiDropRuntime` listens only to `canvas-change` signals and calls
    `requestServerCompletion()` once per settled edit cycle.
  - Completion remains preview-only until Tab acceptance.

- Scenario: Manual hooks remain available
  - `window.__PSG_ROOM_CONTEXT__` still exposes `publishSnapshot`,
    `emitCanvasChange`, `emitSelectionChange`, `emitViewportChange`, and
    `emitChatBoundary`.
  - Existing `window.__PSG_AI_DROP__` helpers are unchanged.

## TDD Evidence

- RED/GREEN: Added focused unit tests for automatic canvas publishing, browser
  authoring signal dispatch, selection publishing, viewport publishing, and the
  rule that selection/viewport alone do not create canvas authoring signals.
- REFACTOR: Updated Chinese comments around automatic publishing and AI Drop
  event handling so the code explains why each boundary exists.

## Modularity Notes

- Automatic context capture is contained in `room-context.ts`, next to the
  existing manual runtime API.
- AI Drop only consumes a small browser event and still routes provider work
  through the existing server completion client.
- No UI redesign was added; this sprint is logic-only.

## Quality Commands

Passed:

```sh
pnpm --filter @production-spec-graph/web test:unit
pnpm --filter @production-spec-graph/web typecheck
pnpm --filter @production-spec-graph/web build
```

`pnpm check` was not rerun because this sprint only touched the web runtime path
and the previous full gate in this session was blocked by an already-running
`127.0.0.1:3001/ready` service. The changed behavior is covered by focused web
tests, typecheck, and build.

## Human Checkpoint

Run:

```sh
DEEPSEEK_API_KEY=... pnpm dev:ai
```

Open a room, select or create a text shape, edit it, then wait for the debounce
and provider response. AI Drop should request server completion automatically
and show the translucent preview without calling `emitCanvasChange()` or
`publishSnapshot()` manually. Press Tab to accept.
