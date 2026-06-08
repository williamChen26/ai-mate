# Sprint 5 Implementation: Gateway Observability and Safety Diagnostics

## Summary

Implemented bounded developer diagnostics for the two AI Gateway paths:

- Server room diagnostics now include a bounded `mate.gatewaySummary` for conversation/mate turns.
- Web-local AI Drop state now exposes bounded lifecycle diagnostics through `createAiDropDiagnostics` and `window.__PSG_AI_DROP__.getDiagnostics()`.

This sprint did not add a polished dashboard, provider integration, durable telemetry, AI Edit, prompt history storage, or a new diagnostics framework. Server diagnostics remain responsible for room/mate/conversation metadata; browser-local diagnostics remain responsible for unsynced AI Drop preview/apply/refusal lifecycle.

## Files Changed

- `apps/server/src/diagnostics/room-diagnostics.ts`
  - Added `RoomDiagnosticsGatewaySummary`.
  - Added bounded gateway/mate summary fields: trigger kind, request id, freshness/readiness, snapshot/recent operation summary, chat boundary state, agent decision/tool-call/final-output metadata, output kind, output validation, and bounded-storage flags.
  - Sanitized diagnostics `lastResponse` so conversation trigger message text and canvas-action proposal text are replaced with lengths.
  - Round 1 fix: added bounded malformed-output diagnostics records so rejected `INVALID_AGENT_OUTPUT` turns still appear in `/rooms/:roomId/diagnostics` without storing raw malformed agent output.

- `apps/server/src/mate/room-mate-service.ts`
  - Round 1 fix: added `getLastDiagnosticRecord()` and a failure diagnostic record for malformed agent outputs while preserving `getLastResponse()` compatibility for successful turns only.

- `apps/server/src/http/_spec/app.test.ts`
  - Added assertions for `gatewaySummary`, bounded flags, output validation, and no full prompt text in diagnostics summary or sanitized latest response.

- `apps/web/src/lib/ai-drop-proposal.ts`
  - Added `AiDropDiagnostics` and `createAiDropDiagnostics`.
  - Summarizes preview, applying, applied, stale/refused, failed, and idle states without mutating proposal state or tldraw.

- `apps/web/src/lib/_spec/ai-drop-proposal.test.ts`
  - Added focused AI Drop diagnostics coverage for preview, applied, failed, and selection-mismatch refusal states.

- `apps/web/src/components/canvas-shell.tsx`
  - Added `window.__PSG_AI_DROP__.getDiagnostics()` as a developer/runtime inspection hook.

- `apps/web/e2e/_spec/canvas-smoke.spec.ts`
  - Added E2E assertions for server `gatewaySummary` diagnostics and AI Drop preview/applied/refused runtime diagnostics.

## Behavior Notes

- Server diagnostics summarize conversation/mate turns and preserve existing raw-ish inspectability without adding durable history.
- The diagnostics endpoint no longer echoes full conversation trigger text or canvas-action proposal text inside `diagnostics.mate.lastResponse`.
- Malformed server mate output is refused with `INVALID_AGENT_OUTPUT` and now leaves a bounded diagnostic record with invalid status, reason, and no raw agent output storage.
- AI Drop diagnostics are intentionally web-local because preview state is unsynced and should not be represented as server room truth.
- AI Drop diagnostics report applied shape ids only after explicit fresh `Tab` acceptance.
- Refused/stale/failed AI Drop states expose developer-readable reasons without canvas mutation.

## TDD Evidence

The approved Sprint 5 contract selected TDD for diagnostic shaping, refusal mapping, bounded payload contracts, and safety state transitions.

- RED:
  - Added server diagnostics expectations before `gatewaySummary` existed. `pnpm --filter @production-spec-graph/server test` failed because `gatewaySummary` was missing.
  - Added web AI Drop diagnostics tests before `createAiDropDiagnostics` existed. `pnpm --filter @production-spec-graph/web test:unit` failed with `createAiDropDiagnostics is not a function`.

- GREEN:
  - Implemented `RoomDiagnosticsGatewaySummary`, bounded diagnostics sanitization, and `createAiDropDiagnostics`.
  - Re-ran focused server/web tests until they passed.

- REFACTOR:
  - Kept server summary creation inside diagnostics aggregation.
  - Kept AI Drop diagnostic shaping inside the pure proposal module.
  - Kept React wiring limited to a developer hook method and E2E-readable runtime state.

## Round 1 Feedback Fixes

- Added bounded failure diagnostics for malformed server mate outputs.
- Added service-level coverage that malformed output stores `diagnosticKind: "failure"` with `outputValidation.status === "invalid"`.
- Added endpoint coverage that `/rooms/:roomId/diagnostics` reports invalid status/reason after `INVALID_AGENT_OUTPUT`.
- Confirmed the diagnostics failure record does not store the full user message or malformed action text.

## Verification

- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/server typecheck`
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web typecheck`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

All commands passed. After the Round 1 fix, `pnpm check` was rerun and passed again.

## Human Checkpoint

Pause here because Sprint 5 completes the developer-facing safety/debug loop for both gateway paths.

Suggested commands:

- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:unit`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection targets:

- Open a room, send a direct conversation message, click Diagnostics, and confirm `gatewaySummary` shows trigger kind, freshness/readiness, agent decision/tool-call/output metadata, output validation, and bounded flags.
- Confirm diagnostics do not include full prompt text in the new bounded summary or sanitized latest response.
- Activate an AI Drop text completion and inspect `window.__PSG_AI_DROP__.getDiagnostics()` before `Tab`; it should show preview-only, requires-acceptance, and no hidden mutation.
- Press `Tab` for a fresh AI Drop proposal and confirm diagnostics report applied state and applied shape ids only after acceptance.
- Change selection before `Tab` and confirm diagnostics show a refusal reason and no shape mutation.
