# Contract Review: Sprint 1

## Verdict: APPROVED

## Reasons

- Scope is exactly F1. The contract targets "Backend App Foundation and In-Memory Sync Endpoint" and creates a standalone `apps/server` workspace package independent from `apps/web` (`contract.md:3-9`), matching F1 in the spec (`spec.md:39-69`).
- Behavior Scenarios appear before Acceptance Criteria and cover backend startup, valid room join, unsafe room rejection, explicit origin policy, and process-local storage limits (`contract.md:16-45`).
- Acceptance Criteria map directly to F1 AC-1.1 through AC-1.5 with testable verification methods (`contract.md:47-54`).
- The contract rejects the disallowed shapes: it excludes `apps/web` client sync/routing work (`contract.md:11-12`), forbids Socket.IO/custom graph protocol semantics (`contract.md:14`), and requires raw WebSocket-compatible tldraw sync (`contract.md:7-9`, `contract.md:53`).
- Package/API validation is specific enough for implementation and later evaluation: it requires verified `@tldraw/sync-core` APIs/versions, documented adapter deviations, and compatibility validation against the existing web tldraw version (`contract.md:53`, `contract.md:119-121`).
- TDD Decision is present with selective rationale and RED/GREEN/REFACTOR evidence expectations for deterministic config, origin, room id, and registry logic (`contract.md:58-69`).
- Runtime verification is appropriate for a standalone backend: package tests/typecheck/build, running the backend, health/readiness `curl` checks, and a WebSocket smoke covering valid connection, second same-room session, and invalid room rejection (`contract.md:71-81`).
- Modularity/readability expectations name the intended files and boundaries, including isolated config, validation, HTTP, registry, and tldraw adapter modules (`contract.md:83-96`).
- Human Checkpoint is present with concrete local commands and inspection guidance before F2 client integration (`contract.md:98-111`).

## Notes

During sprint evaluation, the Generator must provide the documented runtime WebSocket smoke command and package/API compatibility notes; these are contract requirements, not optional implementation commentary.
