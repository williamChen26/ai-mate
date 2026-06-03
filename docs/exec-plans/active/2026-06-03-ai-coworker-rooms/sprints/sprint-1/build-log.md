# Build Log: Sprint 1 — Room Agent Lifecycle Contract

## Round 1

### What Was Built
- `apps/server/src/sync/room-agent-lifecycle.ts`: added the pure room-scoped `mate` lifecycle registry, lifecycle record type, state transitions, default unavailable adapter, diagnostics, and deterministic test hooks.
- `apps/server/src/sync/room-agent-lifecycle.test.ts`: added focused TDD coverage for lifecycle creation, degraded/unavailable default state, per-room isolation, cleanup/end state, and invalid ended-state regression refusal.
- `apps/server/src/sync/room-registry.ts`: wired room creation to request an agent lifecycle record and exposed lifecycle diagnostics from the registry.
- `apps/server/src/sync/room-registry.test.ts`: verified room registry lifecycle creation, isolation, invalid-room no-op behavior, and cleanup/end behavior.
- `apps/server/src/http/app.ts`: added `agentLifecycle` to `/ready`.
- `apps/server/src/http/app.test.ts`: verified `/ready` includes empty and active room-scoped agent lifecycle diagnostics.
- `apps/server/scripts/smoke-sync-server.ts`: added runtime smoke assertions that `/ready` exposes agent lifecycle diagnostics after a valid room is touched.
- `ARCHITECTURE.md`: documented the new backend-owned diagnostic-only room-agent lifecycle boundary.
- `docs/exec-plans/active/2026-06-03-ai-coworker-rooms/sprints/sprint-1/contract-review.md`: recorded contract approval.

### Acceptance Criteria Status
| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-1.1 | A room-scoped agent lifecycle contract exists with explicit states and transitions for requested/starting, connected or unavailable, ended, and recoverable degraded behavior. | PASS | `room-agent-lifecycle.ts` defines `starting`, `connected`, `unavailable`, and `ended`; `room-agent-lifecycle.test.ts` covers creation, unavailable default, end, and ended-state regression refusal. |
| AC-1.2 | Server room initialization requests or schedules a `mate` lifecycle record without requiring any web client AI-specific call. | PASS | `room-registry.ts` calls `agentLifecycle.ensureRequested(parsed.value)` when creating a valid room; registry and app tests create rooms through server/registry paths and observe lifecycle records. |
| AC-1.3 | Agent startup failure or stub unavailability does not break normal tldraw room sync behavior. | PASS | Default lifecycle adapter marks state `unavailable` with reason `mate adapter is not configured`; server smoke passed valid WebSocket upgrade and same-room sessions while lifecycle remained unavailable. |
| AC-1.4 | Lifecycle state is inspectable through a server diagnostic boundary suitable for tests and manual checks. | PASS | `/ready` now includes `agentLifecycle`; app tests and smoke assert room id, agent session id, state, timestamps, and unavailable reason are serializable. |
| AC-1.5 | Room and agent session identity are correlated per room without leaking state across rooms. | PASS | Lifecycle and registry tests create `alpha`/`beta` rooms and assert distinct sorted room-scoped session diagnostics. |
| AC-1.6 | Room retirement or explicit cleanup ends or inactivates the corresponding agent lifecycle record according to the documented policy. | PASS | `closeAll()` ends each active room lifecycle with reason `room closed`; registry and lifecycle tests assert ended diagnostics remain inspectable after room cleanup. |
| AC-1.7 | This sprint does not introduce real AI calls, web AI UI, canvas snapshot ingestion, or canvas mutation. | PASS | Changes are limited to server lifecycle diagnostics, tests, smoke, docs, and sprint artifacts; root `pnpm check` passed with existing web UI/E2E unchanged. |

### Behavior Scenario Evidence
- Agent is requested when a room becomes active: verified by `room-registry.test.ts` and `http/app.test.ts`; creating or joining room `alpha` yields an agent lifecycle diagnostic record.
- Room continues when mate is unavailable: verified by `room-agent-lifecycle.test.ts` default unavailable state and `server smoke`; WebSocket sync succeeds while `agentLifecycle.rooms[0].state` is `unavailable`.
- Agent lifecycle is room-scoped: verified by `room-agent-lifecycle.test.ts` and `room-registry.test.ts` with distinct `alpha`/`beta` records.
- Agent session ends with room lifecycle: verified by `room-agent-lifecycle.test.ts` and `room-registry.test.ts` cleanup/end assertions.
- Diagnostics remain serializable: verified by JSON round-trip in `room-agent-lifecycle.test.ts`, `/ready` app tests, and smoke reading `/ready` over HTTP.

### TDD Decision & Evidence
Use TDD: Yes

Rationale:
The sprint implements deterministic lifecycle state, room/session identity, degraded-state handling, and diagnostic serialization. These are protocol/state rules where tests should define expected behavior before implementation.

Evidence:
- RED: `pnpm --filter @production-spec-graph/server test` failed before implementation because `room-agent-lifecycle.js` did not exist, `registry.getAgentLifecycleDiagnostics` did not exist, and `/ready` lacked `agentLifecycle`.
- GREEN: after implementing the lifecycle module, registry wiring, `/ready` diagnostics, and smoke assertions, `pnpm --filter @production-spec-graph/server test` passed with 20 tests.
- REFACTOR: separated pure lifecycle state/transition behavior from registry and Fastify wiring; kept `/ready` as a read-only formatter and smoke as runtime verification.

### E2E / Runtime Verification
Commands run:
- `pnpm --filter @production-spec-graph/server test`: PASS, 5 files / 20 tests.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS with elevated local-port permission after sandbox `listen EPERM`; output included `agentLifecycle` for room `alpha` with state `unavailable`.
- `git diff --check`: PASS.
- `pnpm check`: PASS with elevated local-port/browser permission after sandbox `listen EPERM`; server test/typecheck/build/smoke, web unit/typecheck/build/E2E/recovery all passed.

The initial unprivileged `pnpm check` failed at server smoke because sandboxing blocked binding to `127.0.0.1`; rerunning with approved elevated permissions completed successfully.

### Modularity & Readability Notes
Lifecycle state is isolated in `room-agent-lifecycle.ts`, with no dependency on Fastify, WebSocket, or tldraw internals. `room-registry.ts` only requests/ends lifecycle records at room lifecycle boundaries and exposes diagnostics. `app.ts` only adds the diagnostics to `/ready`. Tests describe lifecycle behavior directly and serve as documentation for degraded mode, per-room isolation, and cleanup.

### Human Checkpoint
Pause after Sprint 1.

Recommended local commands:
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/server typecheck`
- `pnpm --filter @production-spec-graph/server build`
- `pnpm --filter @production-spec-graph/server smoke`
- `pnpm --filter @production-spec-graph/server dev`

Manual inspection:
- Start the backend.
- Open `http://127.0.0.1:3001/ready`.
- Touch a valid room through the sync route or smoke flow.
- Re-open `/ready` and confirm `agentLifecycle.rooms` includes the room id, a `mate:<roomId>:<uuid>` session id, state `unavailable`, timestamps, and reason `mate adapter is not configured`.
- Confirm this sprint still does not claim real AI, chat, canvas snapshot understanding, or autonomous canvas editing.

### Decisions Made
- Default `mate` adapter intentionally returns `unavailable` instead of throwing. This keeps sync healthy while making the missing AI coworker explicit in diagnostics.
- Ended lifecycle records remain inspectable after `closeAll()` rather than being immediately deleted, so manual diagnostics can explain what happened during shutdown.
- Rejoining a room after an ended lifecycle can create a fresh lifecycle record because `ensureRequested` only reuses non-ended records.
- `/ready` exposes room-agent lifecycle diagnostics as top-level `agentLifecycle` to keep room stats unchanged and avoid mixing AI state into sync room counts.

### Quality Command Results
- `pnpm --filter @production-spec-graph/server test`: PASS.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/server build`: PASS.
- `pnpm --filter @production-spec-graph/server smoke`: PASS after elevated local-port permission.
- `git diff --check`: PASS.
- `pnpm check`: PASS after elevated local-port/browser permission.

### Known Issues
- `mate` is not a real process or model integration yet; the default lifecycle records degraded availability by design.
- There is no web AI surface, snapshot feed, operation stream, or agent output protocol in this sprint; those remain later features.
- Lifecycle records are still process-local, matching the current non-durable backend storage limits.

### Test Results
- Server unit/integration: 5 files, 20 tests passed.
- Root quality gate: passed server smoke, web unit tests, web typecheck/build, Playwright E2E, and recovery smoke.
