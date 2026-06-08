# mate

`apps/mate` is the room-aware AI coworker boundary for Production Spec Graph.
It consumes the shared canvas context feed from `@production-spec-graph/shared`,
separates raw whiteboard observations from inferred intent, detects stale
snapshot assumptions, and returns deterministic `agent-output.v1` data for local
validation. Current outputs include non-mutating suggestions/questions and typed
canvas action proposals that require explicit acceptance and are not applied
automatically.

The current implementation is intentionally credential-free for quality gates.
It does not call a live model and does not mutate the tldraw canvas.

## Local Commands

Run deterministic tests:

```shell
pnpm --filter mate test
```

Run typecheck/build:

```shell
pnpm --filter mate typecheck
pnpm --filter mate build
```

Run the room context smoke:

```shell
pnpm --filter mate smoke
```

The smoke command constructs a sample room context feed, prepares a mate turn,
and validates that the result includes canvas observations, inferred intent,
freshness/staleness metadata, process-local memory diagnostics, and
non-mutating output.

## Mastra Canvas Agents

The Mastra app now exposes product-oriented canvas agents:

- `mateConversationAgent`: normal conversation over the room context.
- `aiDropCompletionAgent`: structured AI Drop completion proposals.

The old weather demo files remain only as scaffold references. They are not the
Production Spec Graph product agent path.

Start the development server:

```shell
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) in your browser to access [Mastra Studio](https://mastra.ai/docs/studio/overview). It provides an interactive UI for building and testing your agents, along with a REST API that exposes your Mastra application as a local service. This lets you start building without worrying about integration right away.

The product canvas agents use DeepSeek through Mastra's model router when real
agent mode is enabled. Create a `.env` file from `.env.example` and set
`DEEPSEEK_API_KEY` before calling real provider-backed agents. Repository
quality commands still default to the deterministic credential-free mate path.

To route the web/server AI Gateway through the real Mastra runtime adapter, run
the server with:

```shell
MATE_AGENT_MODE=real DEEPSEEK_API_KEY=... pnpm --filter @production-spec-graph/server dev
```

Successful provider-backed turns surface as `runtime.outputSource =
"real-agent"` in room diagnostics. If credentials are missing or model output
fails validation, mate falls back to deterministic output with a bounded runtime
reason.

You can start editing files inside the `src/mastra` directory. The development server will automatically reload whenever you make changes.

## Learn more

To learn more about Mastra, visit our [documentation](https://mastra.ai/docs/). Your bootstrapped project includes example code for [agents](https://mastra.ai/docs/agents/overview), [tools](https://mastra.ai/docs/agents/using-tools), [workflows](https://mastra.ai/docs/workflows/overview), [scorers](https://mastra.ai/docs/evals/overview), and [observability](https://mastra.ai/docs/observability/overview).

If you're new to AI agents, check out our [course](https://mastra.ai/learn) and [YouTube videos](https://youtube.com/@mastra-ai). You can also join our [Discord](https://discord.gg/BTYqqHKUrf) community to get help and share your projects.

## Deploy to the Mastra platform

The [Mastra platform](https://projects.mastra.ai) provides two products for deploying and managing AI applications built with the Mastra framework:

- **Studio**: A hosted visual environment for testing agents, running workflows, and inspecting traces
- **Server**: A production deployment target that runs your Mastra application as an API server

Learn more in the [Mastra platform documentation](https://mastra.ai/docs/mastra-platform/overview).
