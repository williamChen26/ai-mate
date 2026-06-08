# Sprint 4 Evaluation

## Verdict

PASS

## Acceptance Criteria Review

- AC-4.1: PASS. Added `handleCompletionAsync` and
  `POST /rooms/:roomId/mate/completions`.
- AC-4.2: PASS. Completion endpoint builds `trigger.kind = completion` gateway
  requests from live selection/viewport/source facts and server context feed.
- AC-4.3: PASS. Completion path uses async mate runtime and path-aware
  normalization that accepts only valid `completion-proposal` output.
- AC-4.4: PASS. Web exposes `requestCompletion(snapshot)` client method and
  `window.__PSG_AI_DROP__.requestServerCompletion()`.
- AC-4.5: PASS. Tests cover deterministic text completion, fake structured
  completion, invalid plain-text completion fallback, HTTP endpoint routing, and
  web client payload.
- AC-4.6: PASS. Existing AI Drop stale/refused/Tab behavior remained untouched
  and E2E still passes.

## Behavior Scenario Review

- Server-backed completion returns text proposal: PASS.
- Server-backed completion returns fake structured proposal: PASS.
- Completion rejects unsupported output: PASS.
- Web can request server completion without UI polish: PASS.

## Quality Evidence

`pnpm check` passed.

Observed covered results:

- Shared: 11 tests passed.
- Mate: 28 tests passed.
- Server: 47 tests passed.
- Web unit: 54 tests passed.
- Web E2E: 10 tests passed.
- Typecheck/build/smoke commands passed across packages.

## Residual Risk

- The server-backed completion helper is developer-callable, not yet a polished
  product trigger.
- Live DeepSeek completion generation remains behind runtime adapter readiness;
  deterministic/fake paths cover quality gates.
- Operation capture for authoring evidence is still manual/helper-driven in the
  current web runtime.

## Checkpoint

Developer should manually inspect the new completion endpoint and
`requestServerCompletion()` helper before Sprint 5 diagnostics/tooling polish.

## Post-Evaluation Manual Finding

Manual testing found that AI Drop preview could disappear after roughly one
refresh interval while focused inside a text shape. This was fixed by keeping
read-only web context extraction on the last published snapshot version and
letting only `publishSnapshot()` advance the version. Web unit tests and
typecheck passed after the fix; the targeted E2E command was blocked by an
already-running server on port `3001`.
