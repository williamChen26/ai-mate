# Sprint 3 Build Log

## Summary

Implemented an async conversation runtime path in server mate service and added
a stream-ready event protocol for conversation turns. Existing HTTP final
response behavior now awaits the async path, but remains response-compatible for
web and E2E.

## Behavior Scenario Evidence

- Scenario: Conversation can use async agent runtime
  - `RoomMateService` now exposes `handleMessageAsync`.
  - `apps/server/src/http/app.ts` uses `handleMessageAsync` for
    `/rooms/:roomId/mate/messages`.
  - Tests inject a fake runtime adapter and verify plain model text becomes a
    `conversation-answer`.

- Scenario: Conversation has stream-ready events
  - Added `RoomMateStreamEvent` and `streamMessage`.
  - `streamMessage` returns `started`, `delta`, and `final` events around the
    same validated mate response envelope.

- Scenario: Conversation falls back without credentials
  - Tests configure `runtimeConfig.mode = "real"` with DeepSeek unavailable and
    verify deterministic fallback metadata.

- Scenario: Conversation does not trigger AI Drop
  - Mate runtime tests verify conversation rejects `completion-proposal` and
    falls back safely.

## TDD Evidence

- RED: Added tests for async fake runtime, stream events, real-mode fallback,
  conversation plain text normalization, and conversation rejection of
  completion proposals.
- GREEN: Implemented `handleMessageAsync`, `streamMessage`, runtime request
  propagation, and HTTP async route wiring.
- REFACTOR: Extracted invocation preparation and mate turn storage helpers so
  sync and async paths share validation/diagnostics logic.

## Modularity Notes

- `RoomMateService` owns server orchestration for sync/async/stream behavior.
- `prepareMateTurnWithRuntime` remains the mate package runtime boundary.
- Stream events are service-level protocol data; no React UI concerns were
  added in this sprint.

## Quality Commands

Focused commands run:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter mate build
pnpm --filter mate smoke
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
pnpm --filter @production-spec-graph/server build
```

Full handoff command run:

```sh
pnpm check
```

Result: PASS. Full check included shared tests/typecheck/build, mate
tests/typecheck/build/smoke, server tests/typecheck/build/smoke, web
unit/typecheck/build, and 10 Playwright E2E tests.

## Human Checkpoint

Pause here before Sprint 4. Inspect:

- `apps/server/src/mate/room-mate-service.ts`
- `apps/server/src/http/app.ts`
- `apps/mate/src/context/agent-runtime.ts`
- `apps/mate/src/context/_spec/agent-runtime.test.ts`
- `apps/server/src/mate/_spec/room-mate-service.test.ts`

What to verify:

- `/mate/messages` still returns a final response for the existing UI.
- Async runtime can accept fake/real adapters.
- `streamMessage` events are suitable for a future streaming UI.
- Conversation path still rejects completion proposals.
