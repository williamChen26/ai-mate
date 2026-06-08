# Spec: Real Mastra Canvas Agents

## Background

The previous AI Gateway and AI Drop run established the local product boundary:
room-scoped gateway requests, latest canvas snapshot plus bounded recent
operation stack, inspectable agent turn summaries, AI Drop preview state, Tab
acceptance, conversation routing, and diagnostics. That run intentionally kept
the agent deterministic so quality gates could run without provider
credentials.

This run starts the real AI integration. The product direction is now two
agent paths behind the AI Gateway:

1. Conversation Agent: a normal streaming conversational agent, close to
   mainstream chat agents. It answers the user from room context, can use
   read-only canvas tools later, and should not require an `answer` tool for
   ordinary final responses.
2. AI Drop Completion Agent: a selection-aware, low-latency structured-output
   agent. It must return a schema-validated `completion-proposal` for the
   existing preview and Tab acceptance path, or decline/ask for more context.

The repository already contains a Mastra scaffold in `apps/mate/src/mastra`
with a DeepSeek-backed weather demo. That demo should be preserved only as a
reference or replaced by product-specific canvas agents. The existing
deterministic `prepareMateTurn` path should remain available as a fallback and
as a credential-free quality gate.

## Goals

1. Introduce product-specific Mastra canvas agents while keeping the current
   deterministic mate path as fallback.
2. Separate Conversation Agent and AI Drop Completion Agent responsibilities,
   prompts, model options, output expectations, and validation paths.
3. Give agents a clear prompt/context pack that teaches them how to interpret
   tldraw-derived canvas snapshots, selections, bounds, freshness, and recent
   operation stacks.
4. Make the conversation path stream normal assistant text when a real provider
   is enabled, while preserving the existing non-mutating safety boundary.
5. Make the AI Drop path request strict structured output that validates against
   `agent-output.v1` and feeds the existing preview/Tab lifecycle.
6. Add typed ReAct tool boundaries only where they represent useful actions or
   proposals, not for ordinary final conversation answers.
7. Keep all provider-dependent behavior optional, observable, and safe to test
   locally without `DEEPSEEK_API_KEY`.
8. Keep code readable and cohesive, with Chinese comments on new non-obvious
   modules, functions, and safety decisions.

## Non-Goals

1. Do not give the model direct authority to mutate tldraw state.
2. Do not remove deterministic tests, smoke checks, or fallback behavior.
3. Do not implement broad AI Edit execution in this run.
4. Do not build a polished chat UI, prompt studio, durable memory system,
   billing, auth, or provider marketplace.
5. Do not make provider credentials mandatory for `pnpm check`.
6. Do not expose raw private prompt history in diagnostics.
7. Do not turn ordinary conversation final answers into an artificial answer
   tool unless a later technical constraint requires it.

## Feature List

### F1: Real Agent Runtime Boundary and Mastra Canvas Agent Scaffold

Create the product-level agent runtime boundary inside `apps/mate`. Replace or
wrap the weather demo with canvas-oriented Mastra agent definitions and a
mockable runtime adapter. The server-facing mate API should be able to choose
between deterministic fallback and real Mastra execution based on explicit
configuration and provider readiness.

**Behavior Scenarios:**
- Scenario: Real agent runtime is disabled by default
  - Given no provider flag or API key is configured
  - When the server asks mate to prepare a turn
  - Then the existing deterministic path still returns valid `mate-turn.v1`
  - And quality commands remain credential-free
- Scenario: Product canvas agents are registered in Mastra
  - Given the mate package starts its Mastra app
  - When developers inspect the registered agents
  - Then they see canvas-specific conversation and completion agents rather
    than relying on the weather demo as the product path
- Scenario: Runtime adapter reports provider readiness
  - Given DeepSeek configuration is present or absent
  - When the server prepares a mate turn
  - Then diagnostics can show whether a real model was used, skipped, or
    unavailable
- Scenario: Agent runtime is mockable in tests
  - Given tests inject a fake real-agent adapter
  - When mate prepares conversation or completion turns
  - Then tests can verify routing and validation without network calls

**Acceptance Criteria:**
- AC-1.1: A cohesive mate agent runtime boundary exists with explicit modes for
  deterministic fallback and real Mastra execution.
- AC-1.2: Product-specific canvas agent definitions exist for conversation and
  AI Drop completion, with prompts focused on tldraw context interpretation.
- AC-1.3: DeepSeek/provider readiness is represented as structured metadata
  without requiring credentials for default tests.
- AC-1.4: The weather demo is no longer the implied product agent path; it is
  either removed from the product registry or clearly isolated as demo code.
- AC-1.5: Tests cover mode selection, provider-unavailable fallback, and
  injected fake real-agent output.

**Priority:** P0
**Dependencies:** None

### F2: Canvas Context Prompt Pack and Agent Output Validation

Create a shared prompt/context pack for real agents. It should convert the
gateway request and room context into a compact, model-readable description
that explains canvas semantics, selected shapes, recent operations, freshness,
and safety rules. It should also validate and normalize real model responses
back into existing `agent-output.v1` data.

**Behavior Scenarios:**
- Scenario: Agent receives canvas semantics, not raw unexplained JSON
  - Given a gateway request includes snapshot and recent operations
  - When the prompt pack is built
  - Then it explains how to read shapes, text, bounds, selection, freshness,
    and operation order
  - And it distinguishes current canvas state from recent user trajectory
- Scenario: Completion output is machine-readable
  - Given the AI Drop Completion Agent produces a proposal
  - When the output is parsed
  - Then it must validate as `completion-proposal` or be rejected safely
- Scenario: Conversation output remains normal answer data
  - Given the Conversation Agent answers a user message
  - When the output is normalized
  - Then ordinary final answer text becomes `conversation-answer` data without
    requiring an answer tool
- Scenario: Invalid model output falls back safely
  - Given the model returns malformed, unsafe, stale, or unsupported output
  - When mate validates the response
  - Then the turn records failure/fallback metadata
  - And no canvas mutation or AI Drop preview is created from the invalid data

**Acceptance Criteria:**
- AC-2.1: A readable context/prompt builder exists for canvas agents and has
  deterministic unit tests.
- AC-2.2: The prompt pack includes selection, selected shape summaries,
  snapshot freshness, bounded recent operations, and explicit safety policy.
- AC-2.3: Real model output normalization preserves existing `agentOutputSchema`
  validation.
- AC-2.4: Conversation final answers are represented as final output data, not
  as a required answer tool call.
- AC-2.5: Invalid or unsupported model output produces a safe question/no-op or
  deterministic fallback with diagnostics.

**Priority:** P0
**Dependencies:** F1

### F3: Conversation Agent Streaming Path

Wire the conversation gateway to the real Conversation Agent when enabled. This
path should behave like a mainstream chat agent: stream answer text, optionally
use future read-only tools, and return a validated final `conversation-answer`
record for diagnostics. The existing raw panel may remain minimal.

**Behavior Scenarios:**
- Scenario: Conversation streams when real agent is enabled
  - Given a room has a valid context feed and real agent runtime is ready
  - When the user sends a Mate conversation message
  - Then the Conversation Agent receives the gateway request and starts a
    streaming response
  - And the UI can show incremental text or a minimal streaming state
- Scenario: Conversation falls back without credentials
  - Given the provider is unavailable
  - When the same conversation message is sent
  - Then the deterministic fallback path still returns a valid response
  - And diagnostics explain that no real model was used
- Scenario: Conversation can reference canvas context
  - Given the canvas contains selected or visible text
  - When the user asks about the room
  - Then the agent can answer using the prompt-packed canvas facts
  - And stale context is surfaced rather than hidden
- Scenario: Conversation does not trigger AI Drop
  - Given the Conversation Agent returns normal text
  - When the web receives the response
  - Then no completion preview or canvas mutation occurs

**Acceptance Criteria:**
- AC-3.1: The server/mate conversation path can invoke the real Conversation
  Agent through the runtime adapter when enabled.
- AC-3.2: Streaming state is represented minimally in web/server code or a
  documented runtime path, without requiring UI polish.
- AC-3.3: Provider-disabled and provider-failure paths fall back safely.
- AC-3.4: Diagnostics include whether the real conversation agent was used,
  skipped, or failed.
- AC-3.5: Tests or runtime checks prove conversation output does not activate AI
  Drop.

**Priority:** P0
**Dependencies:** F2

### F4: AI Drop Completion Agent Structured Path

Wire AI Drop to the real Completion Agent. The completion path should use the
existing gateway context and AI Drop preview lifecycle, but replace the local
deterministic browser fixture with a server/mate structured-output proposal
when enabled.

**Behavior Scenarios:**
- Scenario: Completion agent returns text proposal
  - Given a selected text shape and recent text-authoring operations
  - When AI Drop completion is triggered
  - Then the Completion Agent returns a valid `text-in-element`
    `completion-proposal`
  - And the web renders it through the existing translucent preview
- Scenario: Completion agent returns flow proposal
  - Given a selected diagram-like shape and recent flow-authoring operations
  - When AI Drop completion is triggered
  - Then the Completion Agent returns a valid `flow-continuation` proposal
  - And the preview remains non-mutating until Tab acceptance
- Scenario: Completion agent declines unsafe or unclear completion
  - Given selection alone does not prove authoring intent
  - When AI Drop completion is triggered
  - Then the agent can return no-op or question
  - And the web does not show a misleading preview
- Scenario: Completion proposal is refused when stale
  - Given the snapshot or selected shape changes after proposal generation
  - When the web validates the proposal
  - Then the existing AI Drop stale/refused states prevent Tab application

**Acceptance Criteria:**
- AC-4.1: A server-backed AI Drop completion trigger exists or an existing
  endpoint is extended without mixing it with normal conversation.
- AC-4.2: The Completion Agent returns only schema-validated structured output
  for the AI Drop path.
- AC-4.3: The web can activate AI Drop preview from the server/mate completion
  response, while keeping the deterministic console fixture for local tests.
- AC-4.4: Stale, malformed, unsupported, and selection-mismatched responses are
  refused without mutation.
- AC-4.5: E2E or runtime validation covers preview plus Tab acceptance using a
  fake or enabled completion agent.

**Priority:** P0
**Dependencies:** F2

### F5: ReAct Tooling and Agent Diagnostics

Add the first product-specific ReAct tools and diagnostics around real agent
turns. Tools should represent meaningful actions or proposals, not ordinary
answers. Diagnostics should show which agent path ran, which tools were called,
what output was validated, and why fallback occurred.

**Behavior Scenarios:**
- Scenario: Completion tool creates proposal data
  - Given the Completion Agent decides a candidate is appropriate
  - When it uses the completion proposal tool
  - Then the tool returns typed proposal data and does not mutate the canvas
- Scenario: Conversation uses final answer, not answer tool
  - Given the Conversation Agent can answer directly
  - When it completes the turn
  - Then diagnostics show final answer output without forcing a tool call
- Scenario: Tool calls are inspectable
  - Given a real agent turn called tools
  - When diagnostics are requested
  - Then they show bounded tool call names, statuses, output kind, and fallback
    state without storing private prompt history
- Scenario: Deterministic fallback remains explainable
  - Given provider output is invalid or unavailable
  - When fallback is used
  - Then diagnostics identify the failure class and the fallback output source

**Acceptance Criteria:**
- AC-5.1: Product tools exist for completion proposal generation and any
  read-only context access needed by the first real agent path.
- AC-5.2: Ordinary conversation answers are not modeled as mandatory tools.
- AC-5.3: Diagnostics distinguish deterministic, fake, and real provider-backed
  turns.
- AC-5.4: Diagnostics are bounded and avoid full prompt/private history storage.
- AC-5.5: Tests cover tool-call metadata, fallback metadata, and invalid output
  refusal.

**Priority:** P1
**Dependencies:** F3, F4

## Risks & Dependencies

1. Mastra runtime APIs may differ between dev server, direct package imports,
   and built server execution. The first sprint should isolate this behind a
   small adapter and avoid scattering framework details through server code.
2. DeepSeek credentials and network availability are not guaranteed in local or
   CI environments. All mandatory quality gates must pass without live calls.
3. Streaming changes can easily expand UI scope. Keep streaming state minimal
   until product logic is validated.
4. Strict structured output for completion may need retry/repair behavior. The
   first implementation should reject invalid output safely before adding repair
   loops.
5. The prompt pack may become too large as rooms grow. This run should keep the
   context bounded and prepare future read/search tools rather than uploading
   unlimited canvas state.
6. Real model choices can introduce nondeterminism. Tests should use fake
   adapters and schema validation, while manual checks can exercise DeepSeek.

## Open Questions

1. Should real agent mode be controlled by one env flag such as
   `MATE_AGENT_MODE=deterministic|fake|real`, or separate flags for conversation
   and completion?
2. Should Conversation Agent streaming be implemented over a new SSE endpoint,
   an extension of the existing mate message endpoint, or initially only in the
   mate package/runtime smoke?
3. Should the Completion Agent call a Mastra tool to create proposals, or should
   it produce structured output directly and let mate normalize it?
4. Should the weather demo be deleted, moved under a demo namespace, or left
   registered only in Mastra Studio while product code uses canvas agents?
5. How much recent operation text should be included in prompts before moving
   to read/search tools?

## Suggested Sprint Order

1. Sprint 1: F1 Real Agent Runtime Boundary and Mastra Canvas Agent Scaffold.
   This creates the runtime switch, product agent definitions, and fallback
   foundation without requiring UI changes or credentials.
2. Sprint 2: F2 Canvas Context Prompt Pack and Agent Output Validation. This
   teaches agents how to read the canvas and safely normalize model output.
3. Sprint 3: F3 Conversation Agent Streaming Path. This makes normal chat use
   the real Conversation Agent when enabled while preserving fallback.
4. Sprint 4: F4 AI Drop Completion Agent Structured Path. This replaces the
   browser-only deterministic completion fixture with a server-backed
   structured completion agent path.
5. Sprint 5: F5 ReAct Tooling and Agent Diagnostics. This adds production-shaped
   tool metadata and diagnostics once both real paths exist.
