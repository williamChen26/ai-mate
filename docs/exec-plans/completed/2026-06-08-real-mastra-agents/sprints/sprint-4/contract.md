# Sprint 4 Contract: AI Drop Completion Agent Structured Path

## Scope

Implement F4 from the spec. This sprint adds a server-backed AI Drop completion
trigger that uses the existing AI Gateway completion request, async mate runtime
adapter, strict `completion-proposal` validation, and the existing web AI Drop
preview/Tab lifecycle.

The browser deterministic AI Drop fixture remains available for local tests and
manual inspection.

## Behavior Scenarios

- Scenario: Server-backed completion returns text proposal
  - Given a selected text shape and recent text-authoring operation exist in
    the room context feed
  - When the web or test calls the completion endpoint
  - Then server builds a completion gateway request
  - And mate returns a valid `text-in-element` completion proposal

- Scenario: Server-backed completion returns fake structured proposal
  - Given a fake completion runtime returns valid `completion-proposal`
  - When server handles the completion request
  - Then the response records fake runtime metadata
  - And the output can be activated by the existing AI Drop preview runtime

- Scenario: Completion rejects unsupported output
  - Given completion runtime returns plain text or a conversation answer
  - When mate normalizes output for completion path
  - Then the invalid output falls back or is refused safely
  - And no misleading AI Drop preview is armed from that invalid output

- Scenario: Web can request server completion without UI polish
  - Given AI Drop runtime is mounted and context can be extracted
  - When a developer calls the server completion helper
  - Then web publishes a fresh snapshot, calls the completion endpoint, and
    activates the returned completion proposal if valid

## Acceptance Criteria

- AC-4.1: Add a room-scoped server completion endpoint or service method
  distinct from normal conversation messages.
- AC-4.2: Completion endpoint builds `trigger.kind = completion` gateway
  requests from server context plus front-end selection/viewport/source facts.
- AC-4.3: Completion path uses async mate runtime and only accepts
  schema-valid `completion-proposal` output for AI Drop.
- AC-4.4: Web exposes a minimal server-backed AI Drop request helper while
  preserving existing deterministic fixture helpers.
- AC-4.5: Tests cover deterministic text completion, fake runtime completion,
  invalid completion output fallback/refusal, and web client request payload.
- AC-4.6: Existing AI Drop stale/refused/Tab acceptance behavior remains
  unchanged.

## TDD Decision

Use TDD for server completion service behavior and web client payload behavior.
Runtime UI polish remains out of scope.

## Verification Plan

Focused commands:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
pnpm --filter @production-spec-graph/web test:unit
pnpm --filter @production-spec-graph/web typecheck
```

Handoff command:

```sh
pnpm check
```

## Human Checkpoint Recommendation

Pause after this sprint. The developer can manually call
`window.__PSG_AI_DROP__.requestServerCompletion()` in the browser console after
creating/selection context, then inspect preview/state/diagnostics.
