# Quality Commands

Generator and Evaluator use this file to decide which checks must run before a
sprint can pass.

## Required Before Handoff

| Area | Command | Notes |
| --- | --- | --- |
| Full Quality Gate | `pnpm check` | Sequential root handoff path. Runs shared test/typecheck/build, mate test/typecheck/build/smoke, server test/typecheck/build/smoke, web unit/typecheck/build/E2E, and recovery smoke. Keep this sequential to avoid `.next/types` races between Next build and TypeScript. |
| Shared Contract Tests | `pnpm --filter @production-spec-graph/shared test` | Covers Zod schemas and helpers for AI input-side canvas snapshots, operation events, context feeds, freshness metadata, and agent output/proposal contracts. |
| Shared Contract Typecheck | `pnpm --filter @production-spec-graph/shared typecheck` | TypeScript validation for shared room context contracts consumed by web/server and future mate ingestion. |
| Shared Contract Build | `pnpm --filter @production-spec-graph/shared build` | Builds reusable declarations and JavaScript for the shared contracts package. |
| Mate Unit Tests | `pnpm --filter mate test` | Covers mate room context ingestion, observation/interpretation separation, stale-context detection, non-mutating deterministic output, typed action proposal output, and bounded room memory. |
| Mate Typecheck | `pnpm --filter mate typecheck` | TypeScript validation for the whiteboard coworker ingestion boundary. |
| Mate Build | `pnpm --filter mate build` | Builds the deterministic mate context boundary and local smoke script without requiring model credentials. |
| Mate Smoke | `pnpm --filter mate smoke` | Runs a credential-free sample room turn and validates non-mutating output with canvas observations and freshness metadata. |
| Backend Unit/Integration Tests | `pnpm --filter @production-spec-graph/server test` | Covers config parsing, room/session validation, room registry behavior, context ingestion, mate message orchestration, proposal validation, and Fastify health/WebSocket route behavior. |
| Backend Typecheck | `pnpm --filter @production-spec-graph/server typecheck` | TypeScript validation for the dedicated Node sync backend. |
| Backend Build | `pnpm --filter @production-spec-graph/server build` | Production TypeScript build for `apps/server`. |
| Backend Smoke | `pnpm --filter @production-spec-graph/server smoke` | Runtime smoke for `/health`, `/ready`, valid WebSocket upgrade, invalid room rejection, two sessions in one room, and process-local storage diagnostics. |
| Web Unit Tests | `pnpm --filter @production-spec-graph/web test:unit` | Deterministic checks for sync config, device/session identity, room routing, status mapping, collaborator cues, and share URL construction. |
| Web Typecheck | `pnpm --filter @production-spec-graph/web typecheck` | TypeScript validation for the Next.js web app. Run sequentially after build/type generation if `.next/types` is missing. |
| Web Build | `pnpm --filter @production-spec-graph/web build` | Production Next.js build for the route-backed tldraw app. |
| Web Integrated E2E | `pnpm --filter @production-spec-graph/web test:e2e` | Starts the backend and web app, then verifies root room creation, valid shared-room sync, context publishing, raw mate message response data, proposal raw rendering without automatic canvas mutation, invalid route rejection, status/share UI, and same-device multi-tab identity behavior. Requires local browser/port permissions. |
| Web Recovery Smoke | `pnpm --filter @production-spec-graph/web test:recovery` | Controls local web/backend processes to verify backend-unavailable and backend restart recovery behavior. Requires local browser/port/process permissions. |
| Lint | `<not configured>` | No lint command is currently configured. |

## Optional / Situational

| Scenario | Command | Notes |
| --- | --- | --- |
| Start Backend | `pnpm --filter @production-spec-graph/server dev` | Starts the Fastify sync backend on `http://127.0.0.1:3001` by default. |
| Start Web | `pnpm --filter @production-spec-graph/web dev` | Starts Next.js on `http://127.0.0.1:3000` with `NEXT_PUBLIC_PSG_SYNC_SERVER_URL=http://127.0.0.1:3001`. |
| Mate Context Smoke | `pnpm --filter mate smoke` | Runs the deterministic mate ingestion smoke fixture without starting server/web or requiring model credentials. |
| Health Probe | `curl -fsS http://127.0.0.1:3001/health` | Checks backend liveness while `apps/server` is running. |
| Readiness Probe | `curl -fsS http://127.0.0.1:3001/ready` | Checks sync readiness and process-local room/storage diagnostics while `apps/server` is running. |
| Architecture Review | Manual review of `ARCHITECTURE.md` | Confirm implemented architecture, tldraw package compatibility, route contract, and non-durable storage limits are still accurate after collaboration changes. |
| Run-Specific Evidence | Manual review of `docs/exec-plans/active/<run-id>/sprints/*` | Inspect sprint contracts, build logs, evaluations, and known limitations for the active harness run. |

## Rule

If this file is incomplete, agents must infer the smallest relevant validation
commands from package scripts, Makefile, CI, or repository docs, then record what
they ran in `build-log.md` and `evaluation.md`.

`pnpm check` is the default pre-handoff gate for this repository. Individual
commands may be used for focused development, but sprint handoff should record
the full root command unless a tool/permission issue makes one sub-check
impossible. In that case, record the failed command, reason, and the exact
manual fallback.

## Harness Quality Lifecycle

Every sprint contract and build log should make validation understandable:

- **BDD first**: behavior scenarios appear before acceptance criteria and are verified by tests, E2E/runtime checks, or documented manual observation.
- **Selective TDD**: use TDD for core deterministic logic such as parsing, state transitions, permissions, validation, ranking, scheduling, protocol mapping, pricing/calculation rules, and data transformations. Record RED/GREEN/REFACTOR evidence when selected. For documentation, prompt copy, mechanical wiring, simple styling, one-off configuration, or exploratory UI layout, TDD may be skipped with a clear tradeoff and focused validation.
- **E2E/runtime final behavior**: runnable user-visible behavior requires an executable final-behavior check. Build/typecheck alone does not prove behavior.
- **Modularity/readability**: validation includes reviewing cohesive boundaries, coupling, oversized files, useful comments around non-obvious logic, and tests-as-documentation.
- **Human Checkpoint**: when a runnable or inspectable milestone exists, `build-log.md` must tell the developer whether to pause, which local commands to run, and what to inspect.
