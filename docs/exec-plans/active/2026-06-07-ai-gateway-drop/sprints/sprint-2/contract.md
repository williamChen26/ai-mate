# Sprint 2 Contract: ReAct Agent Turn and Tool Decision Boundary

## Feature
F2: ReAct Agent Turn and Tool Decision Boundary

## Scope
Implement the logic-first room agent turn boundary that consumes the Sprint 1 AI Gateway request contract, observes the gateway request, derives an inspectable decision summary, decides whether a completion tool should be called, and returns one of these output kinds:

- completion proposal
- conversational answer
- clarifying question
- no-op/refusal

The agent must infer intent from both the latest snapshot facts and the bounded ordered recent operation stack. Selection or snapshot state alone is not sufficient evidence for authoring intent. The completion tool interface must support text-in-element and flow-continuation candidates, but its results remain preview-only data and must not mutate tldraw state.

## Out of Scope
- No AI Drop preview surface, ghost element, translucent custom element, or canvas rendering work.
- No `Tab` acceptance, stale-preview clearing, keyboard handling, or proposal application.
- No AI Edit or direct non-completion canvas mutation.
- No production LLM provider integration or prompt studio.
- No final conversation UI redesign; existing raw mate compatibility may be preserved or minimally adapted only as needed to expose the new boundary.
- No broad observability dashboard beyond the structured decision summary and test/runtime diagnostics needed for this sprint.

## Behavior Scenarios
- Scenario: Agent calls the text completion tool for active text authoring
  - Given a Sprint 1 completion gateway request includes a selected text shape with partial text in the latest snapshot
  - And the bounded ordered recent operation stack includes text-edit operations for that same element
  - When the agent observes the request and builds its decision summary
  - Then it records that both snapshot facts and recent operation-stack facts support text authoring intent
  - And it calls the text-in-element completion tool with selected element context
  - And it returns a preview-only completion proposal without mutating canvas state

- Scenario: Agent calls the flow continuation tool for active diagram extension
  - Given a Sprint 1 completion gateway request includes a selected diagram node or connector-adjacent element in the latest snapshot
  - And the bounded ordered recent operation stack includes flow-like authoring activity such as creating connected nodes, connectors, arrows, or adjacent labels
  - When the agent evaluates intent
  - Then it records a structured flow-continuation decision from both snapshot facts and ordered recent operations
  - And it calls the flow-continuation completion tool
  - And it returns preview-only candidate additions or connective text as data

- Scenario: Agent declines misleading selection while the user is navigating or inspecting
  - Given a completion gateway request includes a selected shape in the latest snapshot
  - And the bounded ordered recent operation stack shows panning, selecting, viewport movement, or inspection-oriented events rather than authoring
  - When the agent decides whether to use completion
  - Then it does not treat selection alone as authoring intent
  - And it declines completion with a no-op/refusal or asks a clarifying question
  - And no completion tool call is made

- Scenario: Agent asks for clarification when intent evidence is incomplete
  - Given the latest snapshot facts or recent operation-stack facts are missing, stale, contradictory, or too sparse for confident completion
  - When the agent processes a completion gateway request
  - Then it returns a clarifying question or no-op/refusal
  - And the decision summary identifies which evidence was missing or uncertain

- Scenario: Agent answers through the conversation path
  - Given a Sprint 1 conversation gateway request contains a user message and room context
  - When the agent processes the turn
  - Then it returns a conversational answer output kind
  - And it does not create a completion proposal, call the completion tool, or mutate canvas state

- Scenario: Agent preserves compatibility with the existing raw mate path
  - Given the server maps current raw mate messages into Sprint 1 conversation gateway requests
  - When the evolved agent boundary handles the request
  - Then existing room message behavior remains non-mutating and returns inspectable structured data
  - And any migration notes identify how the old mate turn maps to observation, decision summary, tool calls, and final output

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-2.1 | The agent turn model separates observation, decision summary, tool calls, and final output in structured data that tests or diagnostics can inspect. | Focused unit tests in `apps/mate` or shared contracts assert the serialized turn shape; run `pnpm --filter mate test`. |
| AC-2.2 | The decision summary explicitly records snapshot-derived facts and ordered recent operation-stack facts as separate evidence sources for every completion decision. | Unit tests cover positive text/flow decisions and verify both evidence groups are present; run `pnpm --filter mate test`. |
| AC-2.3 | A completion tool interface exists for text-in-element and flow-continuation candidates. | Typecheck plus unit tests instantiate both tool request/result variants; run `pnpm --filter mate typecheck` and `pnpm --filter mate test`. |
| AC-2.4 | Completion tool results are preview-only and non-mutating: tool result/proposal data must not apply tldraw changes, must expose preview/proposal semantics, and must preserve `requiresAcceptance` or equivalent non-mutating metadata. | Unit tests assert returned completion proposals are non-mutating/applied-false and no canvas executor is invoked; run `pnpm --filter mate test` and relevant server tests if response validation changes. |
| AC-2.5 | The agent returns all required output kinds: completion proposal, conversational answer, clarifying question, and no-op/refusal. | Unit tests exercise each output kind from deterministic fixtures; run `pnpm --filter mate test`. |
| AC-2.6 | Misleading-selection cases are covered: when the snapshot has a selection but recent operations show panning, selecting, viewport movement, or inspection rather than authoring, completion is declined and no completion tool is called. | Unit tests include misleading-selection fixtures and assert no tool calls; run `pnpm --filter mate test`. |
| AC-2.7 | Direct conversation requests return conversational answers without completion proposal output, completion tool calls, AI Drop preview state, or canvas mutation. | Unit/integration tests cover the mapped raw mate conversation path; run `pnpm --filter mate test` and `pnpm --filter @production-spec-graph/server test` if server response mapping changes. |
| AC-2.8 | Existing raw mate behavior is preserved behind compatibility behavior or intentionally evolved with migration notes in `build-log.md`. | Runtime smoke confirms credential-free raw mate behavior still works; run `pnpm --filter mate smoke`. |
| AC-2.9 | New non-obvious modules/functions include concise Chinese comments where helpful, without commenting trivial assignments. | Code review plus `build-log.md` notes identify where comments were added or why none were needed. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
- This sprint implements deterministic intent classification, operation-stack evidence handling, tool-decision state transitions, and output protocol mapping.
- The main risks are false positives from selection-only inference, accidental mutation semantics, and unclear output-kind boundaries; focused tests can define those behaviors before implementation.

Planned evidence:
- RED: Write focused tests first for text completion, flow continuation, misleading selection decline, incomplete evidence clarification/no-op, conversation answer, and preview-only non-mutating completion proposals. Capture the initial failing command output or explain any environment limitation.
- GREEN: Implement the minimal shared/mate/server changes needed to pass those tests without adding UI preview or acceptance behavior.
- REFACTOR: Keep observation, intent decision, completion tool interfaces, and output mapping cohesive while keeping tests green.

### E2E / Runtime Verification
Final runtime verification for this logic-first sprint:

- Run `pnpm --filter mate smoke` to execute a credential-free agent turn and verify the evolved mate boundary still returns structured, non-mutating output.
- Run `pnpm --filter mate test`, `pnpm --filter mate typecheck`, and `pnpm --filter mate build`.
- If shared contracts or server mapping are changed, also run `pnpm --filter @production-spec-graph/shared test`, `pnpm --filter @production-spec-graph/shared typecheck`, `pnpm --filter @production-spec-graph/server test`, and `pnpm --filter @production-spec-graph/server typecheck`.
- Before handoff, run the repository gate `pnpm check` unless a documented permission/tooling issue prevents one sub-check.

True browser E2E is not required in this sprint because the contract changes the agent turn boundary and raw runtime smoke behavior, not a new user-visible preview or keyboard surface. The runtime smoke is sufficient for final behavior here because it exercises the executable mate boundary without needing UI.

## Modularity & Readability Plan
- Build on the Sprint 1 gateway request contract rather than introducing a parallel request shape.
- Prefer provider-first type/API changes: add or evolve shared output/tool contracts before updating `apps/mate` and server consumers.
- Keep the agent turn boundary in `apps/mate` cohesive: observation parsing, intent decision, completion tool adapter/interface, and final output mapping should be separable and testable.
- Avoid expanding a single large file with unrelated responsibilities; extract small modules when decision logic, tool contracts, or fixture builders start mixing concerns.
- Preserve immutable patterns by deriving new turn/result objects rather than mutating gateway requests, snapshots, operation arrays, or prior mate state.
- Add concise Chinese comments to new modules/functions only where they clarify non-obvious intent evidence handling, operation ordering, or non-mutating preview semantics.
- Tests should double as documentation for why snapshot plus ordered recent operations are jointly required.

## Human Checkpoint
Pause after Sprint 2 implementation before AI Drop preview work begins.

Suggested local commands:

- `pnpm --filter mate test`
- `pnpm --filter mate smoke`
- `pnpm --filter mate typecheck`
- `pnpm check`

What to inspect:

- The text-authoring and flow-continuation fixtures require both snapshot facts and recent operation-stack facts.
- Misleading-selection fixtures decline completion when recent operations indicate panning, selecting, or inspecting.
- Completion tool results are preview-only data and do not mutate tldraw state.
- Raw mate conversation behavior remains non-mutating and inspectable.
- No AI Drop preview surface, `Tab` acceptance, or AI Edit behavior was introduced.

## Technical Approach (brief)
Evolve the deterministic mate boundary so it consumes Sprint 1 gateway requests and produces a structured agent turn with observation, decision summary, optional completion tool call metadata, and final output. Implement a small completion tool interface with text-in-element and flow-continuation result variants, returning proposal data only. Encode conservative intent rules that require snapshot evidence plus bounded ordered recent operation evidence before calling a completion tool. Keep existing server/raw mate compatibility intact unless a narrow response-envelope mapping change is necessary.

## Dependencies
- Sprint 1 F1 gateway request contract is completed and passed.
- `packages/shared` exposes the gateway request schema/builder with distinct snapshot and recent-operation fields.
- Existing deterministic `apps/mate` boundary and server raw mate message path are available for compatibility/runtime smoke validation.

## Estimated Complexity
M
