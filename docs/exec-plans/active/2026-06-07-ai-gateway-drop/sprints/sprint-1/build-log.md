# Sprint 1 Build Log: AI Gateway Trigger and Context Contract

## Summary

Implemented the logic-first AI Gateway request contract for F1. The new shared contract distinguishes completion and conversation triggers, wraps room context into a gateway request, and makes latest snapshot plus bounded ordered recent operations explicit, separate inputs for future intent inference.

No AI Drop preview, Tab acceptance, ReAct tool loop, UI polish, or AI Edit was implemented.

## Changed Files

- `packages/shared/src/index.ts`
- `packages/shared/src/_spec/context.test.ts`
- `apps/server/src/mate/room-mate-service.ts`
- `apps/server/src/mate/_spec/room-mate-service.test.ts`
- `apps/server/src/http/_spec/app.test.ts`
- `docs/exec-plans/active/2026-06-07-ai-gateway-drop/meta.json`
- `docs/exec-plans/active/2026-06-07-ai-gateway-drop/spec.md`
- `docs/exec-plans/active/2026-06-07-ai-gateway-drop/sprints/sprint-1/contract.md`
- `docs/exec-plans/active/2026-06-07-ai-gateway-drop/sprints/sprint-1/contract-review.md`

## Behavior Scenario Evidence

- Trigger AI Drop from selected canvas content:
  - Covered by shared contract test that builds a `completion` gateway request with selection, viewport, server snapshot, recent operations, freshness, and source metadata.
- Trigger direct conversation from the room:
  - Covered by shared contract test that builds a `conversation` gateway request and server tests that map existing raw mate messages to conversation gateway requests.
- Prefer collaboration context over browser-only context:
  - Covered by assertions that snapshot and recent operations are sourced from `server-context-feed`, while completion selection/viewport may use `front-end-runtime-signal`.
- Build intent from snapshot plus recent operation stack:
  - Covered by shared contract test that preserves event ordering, bounds operations by `operationLimit`, and rejects snapshot-only gateway context.
- Handle stale or incomplete context:
  - Covered by shared contract test for missing snapshot, missing recent operations, missing selection/viewport, and stale freshness.

## TDD Decision & Evidence

TDD was used because this sprint is mostly deterministic protocol mapping and validation.

- RED:
  - Added shared tests for completion vs conversation gateway requests, snapshot-plus-operation-stack requirements, bounded event ordering, and explicit missing/stale context states before implementing the new gateway builder.
  - Added server tests expecting raw mate messages to include a mapped conversation gateway request.
- GREEN:
  - Added `AI_GATEWAY_SCHEMA_VERSION`, gateway schemas, `createGatewayRequest`, and server-side mate message mapping.
  - Focused tests now pass.
- REFACTOR:
  - Kept the gateway builder in shared contracts for now to avoid spreading request-shaping across server/web.
  - Preserved existing mate output behavior and added gateway metadata to the response envelope rather than changing `apps/mate` internals.

## E2E / Runtime Verification

Focused checks:

- `pnpm --filter @production-spec-graph/shared test` passed: 1 file, 10 tests.
- `pnpm --filter @production-spec-graph/server test` passed: 7 files, 39 tests.
- `pnpm --filter @production-spec-graph/shared typecheck` passed.
- `pnpm --filter @production-spec-graph/shared build` passed.
- `pnpm --filter @production-spec-graph/server typecheck` passed.
- `pnpm --filter @production-spec-graph/server build` passed.
- `pnpm --filter @production-spec-graph/server smoke` initially failed in the sandbox with `listen EPERM: operation not permitted 127.0.0.1`, then passed after approved localhost listen permission.
- After a small gateway-error classification fix, `pnpm --filter @production-spec-graph/server test` passed again with 39 tests and `pnpm --filter @production-spec-graph/server typecheck` passed.

Full handoff gate:

- `pnpm check` passed, including shared, mate, server, web unit/typecheck/build, and 7 Playwright E2E tests.

## Modularity & Readability Notes

- Shared gateway schemas live beside existing context contracts because this sprint defines the server-to-AI input boundary rather than UI behavior.
- `createGatewayRequest` is the single gateway request builder for this sprint. It converts a `RoomContextFeed` into:
  - `snapshot`
  - `recentOperations`
  - `freshness`
  - optional snapshot-derived selection/viewport
  - optional conversation chat boundary
  - `intentReadiness`
- The builder deliberately exposes snapshot and recent operations separately so later agent logic cannot accidentally treat latest snapshot as sufficient intent context.
- Server mate responses now include `gateway` metadata while preserving existing non-mutating `mate` behavior.
- Gateway contract construction errors are reported as `INVALID_GATEWAY_REQUEST`, separately from mate turn execution failures.
- New non-obvious modules/functions include concise Chinese comments explaining gateway purpose, source attribution, and operation-stack intent context. Trivial assignments were not commented.

## Human Checkpoint

Pause here before Sprint 2.

Suggested local inspection:

- Read `packages/shared/src/index.ts` around `AI_GATEWAY_SCHEMA_VERSION`, `gatewayRequestSchema`, and `createGatewayRequest`.
- Read `packages/shared/src/_spec/context.test.ts` in the `ai gateway shared contracts` block.
- Read `apps/server/src/mate/room-mate-service.ts` where raw mate messages are mapped to conversation gateway requests.
- Run `pnpm --filter @production-spec-graph/shared test` and `pnpm --filter @production-spec-graph/server test`.
- Optional full check: `pnpm check`.

What to verify conceptually:

- A gateway request can be `completion` or `conversation`.
- The context always models snapshot and recent operation stack as separate fields.
- Snapshot-only context is rejected by the gateway schema.
- Existing raw mate message behavior still returns a non-mutating mate result.
