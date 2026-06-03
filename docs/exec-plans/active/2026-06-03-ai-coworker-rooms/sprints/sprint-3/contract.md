# Sprint 3 Contract: Mate Session Context Ingestion and Memory Boundary

## Feature
F3: Mate Session Context Ingestion and Memory Boundary

## Scope
Teach `apps/mate` to consume the shared room context feed from F2 and build a room-aware AI coworker turn boundary. The first implementation may be deterministic/stubbed, but it must demonstrate that `mate` responds from room canvas facts, recent operation events, chat input, freshness metadata, and a short-lived room memory boundary.

This sprint implements:

- `apps/mate` workspace alignment so it can import `@production-spec-graph/shared`, run tests, typecheck, and build through pnpm.
- Mate-side Zod-backed request/response schemas for a context-ingestion turn:
  - room id and optional user message
  - F2 `RoomContextFeed`
  - explicit generated response metadata
  - raw observation summary
  - inferred intent summary
  - uncertainty notes
  - freshness/staleness metadata
  - non-mutating suggestion/question output only
- a deterministic room context interpreter that separates raw facts from inferred intent.
- a short-lived in-memory room session store that records recent turn summaries per room without creating durable long-term memory.
- a runtime smoke command or CLI fixture that demonstrates a context-aware mate turn from a sample feed.
- documentation updates explaining the mate ingestion boundary and memory limits.

Important schema decision:

- F3 may define mate turn request/result schemas for ingestion and non-mutating text output only.
- F3 must not define safe canvas action proposals, canvas mutations, approval workflows, or rich agent output protocol. Those remain F5.
- F3 must not require live model credentials. Deterministic/stubbed behavior is acceptable and preferred for reliable validation.

## Out of Scope
- No web AI chat panel, user-facing AI response UI, or canvas-side interaction surface.
- No server-to-mate network adapter or live process orchestration beyond local mate smoke/CLI boundaries.
- No real LLM calls, model routing, prompt studio, billing, auth, or API key requirement.
- No direct tldraw editor access from `apps/mate`.
- No canvas mutation, proposed canvas action schema, apply/accept/reject flow, or agent-authored drawing.
- No durable memory database, cross-room memory sharing, user profile memory, or long-term planning memory.
- No changes to F2 input context schemas except if a small additive helper is required and remains backward compatible.

## Behavior Scenarios
- Scenario: Mate receives room context before responding
  - Given a mate turn request contains a room id, an optional user message, and a valid F2 room context feed
  - When mate prepares a response
  - Then it validates the request with shared schemas
  - And it builds the response from the latest available snapshot and recent operation events for that same room

- Scenario: Mate distinguishes observation from interpretation
  - Given the context feed contains canvas shapes, text, selections, viewport data, and recent events
  - When mate builds its turn context
  - Then raw canvas facts are represented separately from inferred user intent
  - And uncertainty is included when the available evidence is ambiguous or empty

- Scenario: Mate notices stale assumptions
  - Given the latest snapshot was captured before newer operation events
  - When mate produces a turn result
  - Then the result carries the snapshot/event freshness metadata it used
  - And the result marks itself as stale or cautionary instead of implying the canvas is current

- Scenario: Mate handles non-chat observations
  - Given a room has recent canvas activity and no user chat message
  - When mate is asked to prepare a passive suggestion
  - Then it can return a non-mutating suggestion or question based on recent behavior
  - And it does not emit any canvas mutation or action proposal

- Scenario: Mate memory remains room-scoped and short-lived
  - Given two rooms send independent mate turns
  - When mate records turn summaries
  - Then each room's memory is isolated from the other
  - And the memory keeps only a bounded recent turn window without durable persistence

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-3.1 | `apps/mate` has a room-scoped ingestion boundary for snapshots, operation events, and chat messages using `@production-spec-graph/shared` types/schemas. | Mate unit tests validate good/bad turn requests and import shared feed schemas. |
| AC-3.2 | Mate session context separates raw canvas data, recent user actions, inferred intent, and uncertainty. | Unit tests inspect the generated turn context/result fields for populated and empty/ambiguous feeds. |
| AC-3.3 | Mate results carry snapshot/event freshness metadata and flag stale context when events advanced after the snapshot. | Unit tests and smoke fixture assert freshness echoing and stale/caution behavior. |
| AC-3.4 | Deterministic/stubbed behavior demonstrates context-aware non-mutating suggestions before full model integration. | Mate tests and smoke command show different suggestions for empty canvas, text-heavy canvas, and recent edit/no-chat cases. |
| AC-3.5 | Mate does not mutate canvas directly and does not emit action proposal or canvas mutation schemas in F3. | Source review plus tests assert result variants are non-mutating text suggestions/questions only; `rg` check verifies no canvas action proposal exports from mate/shared in this sprint. |
| AC-3.6 | Room memory is bounded, short-lived, and room-scoped. | Mate session store tests verify max turn trimming and no cross-room leakage. |
| AC-3.7 | Existing shared/server/web gates remain green, and root quality commands include mate validation. | Update quality scripts and run focused mate tests/typecheck/build/smoke plus `pnpm check`. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
F3 is mostly deterministic context parsing, validation, summarization, stale-context detection, and room-scoped memory state. These are core protocol and state-transition rules where tests should define correctness before implementation.

Planned evidence:
- RED: add mate tests for turn request validation, raw-vs-inferred separation, stale freshness, non-chat passive suggestion, no mutation outputs, and bounded room memory before modules exist.
- GREEN: implement mate ingestion schemas, interpreter, memory store, deterministic responder, and smoke command until tests pass.
- REFACTOR: keep schema definitions separate from interpretation and memory, avoid coupling mate to Fastify/web/tldraw runtime internals, and keep Mastra-specific exports thin.

Planned focused coverage:
- valid feed with text shapes and recent canvas events
- empty/quiet feed with uncertainty
- changed-since-snapshot feed marked stale
- chat message plus canvas context
- non-chat recent edit suggestion
- room mismatch rejection
- bounded memory trimming and room isolation
- no canvas mutation/action proposal output

### E2E / Runtime Verification
This sprint changes `apps/mate` behavior but does not create a live web/server/mate transport yet, so full web-to-mate E2E is intentionally deferred to F4/F6.

Required runtime path:
- `pnpm --filter mate test`
- `pnpm --filter mate typecheck`
- `pnpm --filter mate build`
- `pnpm --filter mate smoke`
- `git diff --check`
- `pnpm check`

The mate smoke command should run without model credentials and should construct a sample room context feed, invoke the deterministic mate turn boundary, and print/validate a context-aware non-mutating result with freshness metadata.

## Modularity & Readability Plan
Expected boundaries:

- `apps/mate/src/context/`: mate-specific turn schemas, context interpreter, room memory store, deterministic responder, and fixtures/tests.
- `apps/mate/src/scripts/`: smoke command for a local context-aware turn.
- `apps/mate/src/mastra/`: thin registration/export layer only; do not bury deterministic context logic inside Mastra agent wiring.
- `packages/shared`: reused for F2 context feed schemas/types; no output/action proposal expansion in this sprint.

Avoid large mixed-responsibility files. Keep request validation, interpretation, memory, and response generation separately testable. Comments should explain staleness and memory-boundary decisions, not restate obvious code.

## Human Checkpoint
Pause after Sprint 3 because this is the first proof that `mate` understands the whiteboard context contract.

Recommended local commands:
- `pnpm --filter mate test`
- `pnpm --filter mate smoke`
- `pnpm check`

Manual inspection:
- Review the mate smoke output.
- Confirm it mentions canvas facts from the sample feed, carries freshness/staleness metadata, and returns only non-mutating suggestion/question output.
- Confirm room memory is described as process-local and bounded.

## Technical Approach
First align `apps/mate` with the pnpm workspace quality style, then add tests around the mate turn boundary. Implement a small deterministic context interpreter that reads F2 snapshots/events, produces raw observations and inferred intent separately, computes staleness from freshness counters, records a bounded per-room turn summary, and returns a typed non-mutating result. Update documentation and root quality commands so mate becomes part of the normal handoff gate.

## Dependencies
- F2 passed shared canvas context and operation event feed.
- Existing `apps/mate` Mastra scaffold can remain present, but F3 should not require live model credentials.
- Existing pnpm workspace includes `apps/*` and `packages/*`.

## Estimated Complexity
M
