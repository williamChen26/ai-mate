# Quality Commands

Update this file after installing Ralph Harness. Generator and Evaluator use it to decide which checks must run before a sprint can pass.

## Required Before Handoff

| Area | Command | Notes |
| --- | --- | --- |
| Unit Tests | `pnpm --filter @production-spec-graph/web test:unit` | Focused deterministic checks for canvas context and future agent-readiness logic. |
| E2E Tests | `pnpm --filter @production-spec-graph/web test:e2e` | Browser smoke for the runnable tldraw canvas shell. Requires local server/browser permissions in Codex. |
| Typecheck | `pnpm --filter @production-spec-graph/web typecheck` | TypeScript validation for the web app. |
| Lint | `<not configured>` | No lint command is currently configured. |
| Build | `pnpm --filter @production-spec-graph/web build` | Production build for the current app surface. |

## Optional / Situational

| Scenario | Command | Notes |
| --- | --- | --- |
| UI behavior | `pnpm --filter @production-spec-graph/web test:e2e` | Uses Playwright with installed system Chrome. |
| Full local check | `pnpm check` | Runs web unit tests, typecheck, build, and browser smoke. |
| Docs | Manual review | Check `docs/product-direction.md` and active exec-plan pivot notes when product direction changes. |

## Rule

If this file is incomplete, agents must infer the smallest relevant validation commands from package scripts, Makefile, CI, or repository docs, then record what they ran in `build-log.md` and `evaluation.md`.

## Harness Quality Lifecycle

Every sprint contract and build log should make validation understandable:

- **BDD first**: behavior scenarios appear before acceptance criteria and are verified by tests, E2E/runtime checks, or documented manual observation.
- **Selective TDD**: use TDD for core deterministic logic such as parsing, state transitions, permissions, validation, ranking, scheduling, protocol mapping, pricing/calculation rules, and data transformations. Record RED/GREEN/REFACTOR evidence when selected. For documentation, prompt copy, mechanical wiring, simple styling, one-off configuration, or exploratory UI layout, TDD may be skipped with a clear tradeoff and focused validation.
- **E2E/runtime final behavior**: runnable user-visible behavior requires an executable final-behavior check. Build/typecheck alone does not prove behavior.
- **Modularity/readability**: validation includes reviewing cohesive boundaries, coupling, oversized files, useful comments around non-obvious logic, and tests-as-documentation.
- **Human Checkpoint**: when a runnable or inspectable milestone exists, `build-log.md` must tell the developer whether to pause, which local commands to run, and what to inspect.
