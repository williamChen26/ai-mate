# Sprint 4 Build Log

## Summary

Implemented a server-backed AI Drop completion path. The server now exposes a
dedicated completion endpoint, builds completion gateway requests from live
selection/viewport facts plus server room context, and uses the async mate
runtime path. Web AI Drop runtime now exposes a developer-callable
`requestServerCompletion()` helper while keeping deterministic local fixtures.

## Behavior Scenario Evidence

- Scenario: Server-backed completion returns text proposal
  - Added `RoomMateService.handleCompletionAsync`.
  - Added `POST /rooms/:roomId/mate/completions`.
  - Deterministic tests prove selected text plus recent text edit returns
    `text-in-element` `completion-proposal`.

- Scenario: Server-backed completion returns fake structured proposal
  - Service tests inject fake runtime returning a valid `completion-proposal`.
  - Runtime metadata records `mode: fake`, `path: completion`, and
    `outputSource: fake-agent`.

- Scenario: Completion rejects unsupported output
  - Completion runtime returning plain text fails normalization with
    `plain-text-not-supported-for-completion` and falls back safely.

- Scenario: Web can request server completion without UI polish
  - `createRoomMateClient().requestCompletion(snapshot)` posts selection,
    viewport, and source facts to `/mate/completions`.
  - `window.__PSG_AI_DROP__.requestServerCompletion()` publishes a snapshot,
    requests server completion, and activates the returned proposal through the
    existing AI Drop preview state machine.

## TDD Evidence

- RED: Added service tests for deterministic completion, fake runtime
  completion, and invalid plain-text completion; added HTTP endpoint test and
  web client payload test.
- GREEN: Implemented completion endpoint/service/client/runtime helper.
- REFACTOR: Reused existing gateway creation, async runtime, prompt pack,
  output normalization, AI Drop activation, and Tab acceptance boundaries.

## Modularity Notes

- Server completion route is separate from conversation route.
- Front-end completion request sends live selection/viewport/source facts only;
  authoritative snapshot/recent operations still come from server context feed.
- Web AI Drop preview/apply state machine remains unchanged.

## Quality Commands

Focused commands run:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter mate smoke
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
pnpm --filter @production-spec-graph/server build
pnpm --filter @production-spec-graph/web test:unit
pnpm --filter @production-spec-graph/web typecheck
```

Full handoff command run:

```sh
pnpm check
```

Result: PASS. Full check included shared tests/typecheck/build, mate
tests/typecheck/build/smoke, server tests/typecheck/build/smoke, web
unit/typecheck/build, and 10 Playwright E2E tests.

## Human Checkpoint

Manual local inspection:

1. Start server and web:
   `pnpm --filter @production-spec-graph/server dev`
   `pnpm --filter @production-spec-graph/web dev`
2. Open a room, create/select a text shape.
3. Ensure server context has recent authoring evidence. For deterministic local
   testing, this can be done through the existing context runtime helper, e.g.
   `window.__PSG_ROOM_CONTEXT__.emitCanvasChange({ summary: "text edited in shape:1" })`
   followed by `window.__PSG_ROOM_CONTEXT__.publishSnapshot()`.
4. Call `window.__PSG_AI_DROP__.requestServerCompletion()`.
5. Inspect `window.__PSG_AI_DROP__.getState()` and press Tab if a preview is
   active.

Note: This is still logic-first and developer-callable; no polished trigger UI
was added in this sprint.

## Errata - Manual Preview Lifetime Fix

**Issue**: During manual testing, an AI Drop preview could appear briefly and
then disappear while the user was focused inside the same text shape.

**Root cause**: Web `extractSnapshot()` was a read operation, but it returned
`snapshotVersion + 1`. The AI Drop refresh loop therefore created an apparent
freshness mismatch without any user edit or published snapshot.

**Fix**: Split read-only snapshot extraction from publish-time version
incrementing. `extractSnapshot()` now returns the last published version, while
`publishSnapshot()` is the only path that advances `snapshotVersion`.

**Validation**:

```sh
pnpm --filter @production-spec-graph/web test:unit
pnpm --filter @production-spec-graph/web typecheck
```

Both passed. A targeted Playwright E2E command was attempted but could not
start because `http://127.0.0.1:3001/ready` was already occupied by an existing
server and the current Playwright config uses `reuseExistingServer: false`.
