# Sprint 3 Contract: Conversation Agent Streaming Path

## Scope

Implement F3 from the spec. This sprint wires the conversation gateway to the
async mate runtime boundary and introduces a minimal stream-ready conversation
event protocol. It should preserve the existing `/mate/messages` final-response
behavior while making fake/real runtime conversation output observable as
streaming events.

This sprint does not implement a polished chat UI and does not require live
DeepSeek calls for quality gates.

## Behavior Scenarios

- Scenario: Conversation can use async agent runtime
  - Given a fake or real mate runtime adapter is configured
  - When a user sends a conversation message
  - Then the server can call `prepareMateTurnWithRuntime`
  - And the final response records runtime source metadata

- Scenario: Conversation has stream-ready events
  - Given an async conversation turn returns final text
  - When the server prepares stream events
  - Then the events include `started`, one or more `delta`, and `final`
  - And the final event includes the same validated mate response envelope

- Scenario: Conversation falls back without credentials
  - Given real mode is selected but DeepSeek provider is unavailable
  - When a conversation message is handled
  - Then deterministic fallback is returned
  - And runtime metadata explains provider readiness/fallback

- Scenario: Conversation does not trigger AI Drop
  - Given conversation output is plain answer text from fake runtime
  - When the server validates the turn
  - Then output kind is `conversation-answer`
  - And no completion proposal is accepted on the conversation path

## Acceptance Criteria

- AC-3.1: `RoomMateService` exposes an async conversation handling path that can
  use `prepareMateTurnWithRuntime`.
- AC-3.2: Existing sync `handleMessage` and HTTP final-response behavior remain
  compatible.
- AC-3.3: Add a stream-ready event protocol for conversation turns, with
  started/delta/final events and bounded payloads.
- AC-3.4: Tests prove fake runtime final text becomes a conversation answer and
  is visible in final response/runtime metadata.
- AC-3.5: Tests prove real mode without `DEEPSEEK_API_KEY` falls back safely.
- AC-3.6: Conversation path must not accept `completion-proposal` as a normal
  conversation answer.

## TDD Decision

Use TDD for service async/stream behavior and fallback metadata. Strict TDD is
not required for any future UI streaming surface because this sprint only adds
the server/runtime protocol.

## Verification Plan

Focused commands:

```sh
pnpm --filter mate test
pnpm --filter mate typecheck
pnpm --filter mate build
pnpm --filter @production-spec-graph/server test
pnpm --filter @production-spec-graph/server typecheck
```

Handoff command:

```sh
pnpm check
```

## Human Checkpoint Recommendation

Pause after this sprint. The developer should inspect the async service
boundary and stream event shape before we expose a richer web streaming UI.
