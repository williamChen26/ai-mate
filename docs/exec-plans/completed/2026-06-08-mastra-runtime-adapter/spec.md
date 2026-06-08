# Spec: Mastra Runtime Adapter

## Background

The previous run completed AI Gateway, Conversation Agent and AI Drop
Completion Agent boundaries, prompt packs, structured output validation,
preview/Tab lifecycle, and bounded ReAct diagnostics. The remaining gap is the
actual provider-backed runtime adapter: with `MATE_AGENT_MODE=real` and
`DEEPSEEK_API_KEY`, server requests should call the product Mastra canvas
agents instead of stopping at "no adapter configured".

## Goals

1. Add a real Mastra runtime adapter that implements `MateAgentRuntimeAdapter`.
2. Route conversation requests to `mateConversationAgent`.
3. Route completion requests to `aiDropCompletionAgent`.
4. Convert Mastra generation output and tool-call traces into existing mate
   runtime result data.
5. Keep provider execution optional and credential-free tests deterministic.
6. Wire the server default service to use the adapter only when real mode is
   configured and DeepSeek is ready.

## Non-Goals

1. Do not implement a polished chat UI or streaming SSE UI.
2. Do not add AI Edit execution.
3. Do not bypass existing output validation or AI Drop preview safety.
4. Do not require live DeepSeek calls in `pnpm check`.

## Feature List

### F1: Provider-Backed Mastra Runtime Adapter

Create the real adapter and wire it into the server default mate service.

**Behavior Scenarios:**
- Scenario: Real mode creates a Mastra adapter
  - Given `MATE_AGENT_MODE=real` and `DEEPSEEK_API_KEY` are configured
  - When the server creates its default mate service
  - Then it has an adapter capable of calling product Mastra canvas agents
- Scenario: Conversation uses Mastra final text
  - Given a conversation gateway request reaches the adapter
  - When the conversation agent returns text
  - Then mate normalizes it as `conversation-answer`
  - And no answer tool is required
- Scenario: Completion uses structured output
  - Given an AI Drop completion request reaches the adapter
  - When the completion agent returns a structured proposal
  - Then mate validates it as `completion-proposal`
  - And tool-call diagnostics remain bounded
- Scenario: Provider failures fall back safely
  - Given Mastra generation throws or returns invalid output
  - When mate normalizes the runtime result
  - Then deterministic fallback is used with a bounded failure reason

**Acceptance Criteria:**
- AC-1.1: A `mate/runtime` export exposes a real Mastra runtime adapter factory.
- AC-1.2: The adapter calls the correct canvas agent for conversation and
  completion paths.
- AC-1.3: Completion generation requests structured `completion-proposal`
  output and still relies on existing schema validation.
- AC-1.4: Runtime tool-call traces are converted to bounded diagnostics.
- AC-1.5: Server default mate service auto-injects the adapter only when real
  mode is ready.
- AC-1.6: Tests cover adapter routing, output conversion, tool-call metadata,
  provider error fallback, and credential-free default behavior.

**Priority:** P0
