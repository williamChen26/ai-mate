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

## Mastra Scaffold

The Mastra scaffold remains available for later model integration experiments.
Start the development server:

```shell
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) in your browser to access [Mastra Studio](https://mastra.ai/docs/studio/overview). It provides an interactive UI for building and testing your agents, along with a REST API that exposes your Mastra application as a local service. This lets you start building without worrying about integration right away.

The default weather agent uses DeepSeek through Mastra's model router. Create a `.env` file from `.env.example` and set `DEEPSEEK_API_KEY` before calling the agent.

You can start editing files inside the `src/mastra` directory. The development server will automatically reload whenever you make changes.

## Learn more

To learn more about Mastra, visit our [documentation](https://mastra.ai/docs/). Your bootstrapped project includes example code for [agents](https://mastra.ai/docs/agents/overview), [tools](https://mastra.ai/docs/agents/using-tools), [workflows](https://mastra.ai/docs/workflows/overview), [scorers](https://mastra.ai/docs/evals/overview), and [observability](https://mastra.ai/docs/observability/overview).

If you're new to AI agents, check out our [course](https://mastra.ai/learn) and [YouTube videos](https://youtube.com/@mastra-ai). You can also join our [Discord](https://discord.gg/BTYqqHKUrf) community to get help and share your projects.

## Deploy to the Mastra platform

The [Mastra platform](https://projects.mastra.ai) provides two products for deploying and managing AI applications built with the Mastra framework:

- **Studio**: A hosted visual environment for testing agents, running workflows, and inspecting traces
- **Server**: A production deployment target that runs your Mastra application as an API server

Learn more in the [Mastra platform documentation](https://mastra.ai/docs/mastra-platform/overview).
