# Spec: Automatic AI Drop Context Capture

## Background

The real Mastra runtime chain now exists, but the developer still needs to call
`emitCanvasChange()` and `publishSnapshot()` manually before triggering AI Drop.
That means the product flow is not yet a complete user-facing experience.

## Goals

1. Automatically publish room context events from tldraw document, selection,
   and viewport changes.
2. Automatically publish snapshots after document changes so server-side AI
   Gateway has current canvas state and recent operation evidence.
3. Trigger AI Drop completion after recent authoring activity when a selected
   shape exists.
4. Keep the logic bounded and non-polished; no major UI redesign.
5. Preserve deterministic console helpers for tests and debugging.

## Non-Goals

1. Do not implement a full AI command palette.
2. Do not add AI Edit execution.
3. Do not remove the existing manual runtime hooks.
4. Do not call the provider on every viewport-only or selection-only action.

## Feature List

### F1: Automatic Context Publishing and AI Drop Trigger

**Behavior Scenarios:**
- Scenario: Canvas edits publish operation evidence
  - Given the user creates or edits a shape
  - When tldraw records a document change
  - Then the web runtime emits a canvas-change event
  - And publishes a fresh snapshot
- Scenario: Selection and viewport are captured
  - Given the user changes selection or moves the viewport
  - When tldraw records session changes
  - Then the web runtime emits bounded selection/viewport events
- Scenario: AI Drop triggers after authoring
  - Given a selected shape and recent document change
  - When the automatic context publisher settles
  - Then AI Drop requests a server completion without console commands
  - And the preview remains preview-only until Tab
- Scenario: Manual hooks remain available
  - Given a developer uses `window.__PSG_ROOM_CONTEXT__`
  - When they call manual helpers
  - Then existing behavior remains intact

**Acceptance Criteria:**
- AC-1.1: `registerRoomContextRuntime` binds tldraw store listeners when
  available and cleans them up on unmount.
- AC-1.2: Document changes emit bounded canvas-change events and publish a
  snapshot after debounce.
- AC-1.3: Selection/viewport changes emit bounded events without forcing AI
  completion requests.
- AC-1.4: AI Drop runtime listens for recent canvas-authoring signals and
  requests server completion once per settled edit cycle.
- AC-1.5: Tests cover automatic event publishing, cleanup, and no manual
  console requirement for the trigger path.

**Priority:** P0
