# Sprint 1 Contract: Automatic Context Publishing and AI Drop Trigger

## Behavior Scenarios

- Scenario: Canvas edits publish operation evidence
  - Given the user creates or edits a shape
  - When tldraw emits a document-scoped store change
  - Then the room context runtime emits `canvas-change`
  - And publishes a fresh snapshot after debounce

- Scenario: Selection and viewport are captured
  - Given the user changes selection or camera/viewport
  - When tldraw emits session-scoped store changes
  - Then the runtime emits bounded selection or viewport events
  - And it does not trigger AI Drop from viewport-only activity

- Scenario: AI Drop triggers after authoring
  - Given a selected shape and recent document change
  - When automatic context publishing settles
  - Then AI Drop requests server completion without console calls
  - And the result still goes through preview/Tab validation

- Scenario: Manual hooks remain available
  - Given a developer uses `window.__PSG_ROOM_CONTEXT__`
  - When they call manual helpers
  - Then existing behavior remains available

## Acceptance Criteria

- AC-1.1: Runtime binds optional tldraw store listeners and cleans them up.
- AC-1.2: Document changes debounce event/snapshot publishing.
- AC-1.3: Selection and viewport changes are detected and emitted separately.
- AC-1.4: AI Drop listens for canvas-authoring notifications and calls
  `requestServerCompletion()` once per settled edit cycle.
- AC-1.5: Focused tests cover automatic publishing and the trigger contract.

## TDD Decision

Use TDD for `room-context.ts` automatic publishing because it can be tested with
a fake editor/store and fake fetch. Skip browser E2E until ports are available;
the behavior is covered with web unit tests and existing AI Drop E2E remains
available.

## Implementation Plan

1. Extend `RoomContextEditor` with optional `store.listen`.
2. Add a small auto publisher inside `registerRoomContextRuntime`.
3. Dispatch a bounded browser event after automatic canvas authoring publish.
4. Make `AiDropRuntime` listen for that event and call `requestServerCompletion`.
5. Add focused unit tests and run web checks.

## Human Checkpoint

After implementation, open a room, create/edit a selected text shape, wait for
the debounce, and confirm an AI Drop preview can appear without console calls.
