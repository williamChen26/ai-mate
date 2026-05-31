# Build Log: Sprint 2 — Flowchart Graph Operations

## Round 1

### What Was Built
- `packages/graph-protocol/src/operations.ts`: immutable graph operation API for creating/updating/deleting flowchart nodes, creating/deleting flowchart edges, connected-edge cleanup, conflict checks, and final validation through `validateProductGraph`.
- `packages/graph-protocol/src/types.ts`: public operation input/result/issue types.
- `packages/graph-protocol/src/index.ts`: public exports for graph operations and operation types.
- `packages/graph-protocol/test/operations.test.ts`: focused operation tests for CRUD, connection management, invalid references, connected-node deletion cleanup, deterministic failures, and input immutability.

No Next.js, tldraw, canvas, app, persistence, inspector, AI, or PRD-ingestion code was added.

### Acceptance Criteria Status
| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-2.1 | Package exports shared operations for node create/update/delete, edge create/delete, and validation after changes. | PASS | `src/operations.ts` implements the five operation functions; `src/index.ts` exports them; `build` passed. |
| AC-2.2 | Each successful operation returns deterministic success with a new validated `ProductGraph` and no issues. | PASS | `operations.test.ts` verifies successful node create/update and edge create/delete; each success path checks `validateProductGraph(...).success === true`. |
| AC-2.3 | Duplicate or conflicting changes fail deterministically with inspectable issue data and without mutating the original graph. | PASS | `operations.test.ts` covers duplicate node id, duplicate edge id, node/edge id collision, missing node update/delete, missing edge delete, failure shapes, and original graph equality. |
| AC-2.4 | Creating an edge validates source/target references and rejects invalid edges. | PASS | `operations.test.ts` covers missing source and missing target references; failures omit successful graph data and include validation issue paths/codes. |
| AC-2.5 | Deleting a connected node removes incident edges and leaves no dangling references. | PASS | `operations.test.ts` deletes a connected `decision` node, asserts all incident edges are removed, and validates the returned graph. |
| AC-2.6 | Operation implementation stays limited to the shared package and does not add app/UI/canvas code. | PASS | Changed implementation files are limited to `packages/graph-protocol` plus sprint harness artifacts. |
| AC-2.7 | Package still builds and Sprint 1 behavior remains green. | PASS | `test`, `build`, `schema:export`, and `git diff --check` passed. |

### Behavior Scenario Evidence
- Create and update a flowchart node: `packages/graph-protocol/test/operations.test.ts` verifies creating a unique node, updating editable fields, keeping existing records unchanged, preserving original graph immutability, and returning a validated graph.
- Connect and disconnect flowchart nodes: `operations.test.ts` verifies edge creation between existing nodes, edge deletion, original edge immutability, and graph validity.
- Reject invalid edge references: `operations.test.ts` verifies missing source and target node references fail deterministically, expose issue paths/codes, and do not return successful graph data.
- Delete a connected node: `operations.test.ts` verifies deleting a node removes all incoming/outgoing edges and returns a valid graph without dangling references.
- Handle duplicate or conflicting changes: `operations.test.ts` verifies duplicate/conflicting ids plus missing node/edge operations return stable failures without mutating the original graph.

### TDD Decision & Evidence
Use TDD: Yes

Rationale:
F2 is deterministic graph state-transition logic. Tests are the clearest way to define mutation semantics, failure shapes, and validation guarantees before implementation.

Evidence:
- RED: Added `packages/graph-protocol/test/operations.test.ts` before implementation. `pnpm --filter @production-spec-graph/graph-protocol test` failed with five operation failures because `createFlowchartNode`, `createFlowchartEdge`, `updateFlowchartNode`, `deleteFlowchartNode`, and `deleteFlowchartEdge` were not exported functions.
- GREEN: Implemented `src/operations.ts`, operation public types in `src/types.ts`, and exports in `src/index.ts`. After one conflict-path adjustment so edge id collisions point to the operation input field, `pnpm --filter @production-spec-graph/graph-protocol test` passed with 3 files and 12 tests.
- REFACTOR: Kept candidate validation in one helper, duplicate/conflict issue creation in one helper, and operation functions small and immutable. `pnpm --filter @production-spec-graph/graph-protocol build` and the final test run stayed green.

### E2E / Runtime Verification
No browser E2E applies to Sprint 2 because there is no visible UI surface and no app code.

Runtime checks:
- `pnpm --filter @production-spec-graph/graph-protocol test`: PASS, 3 test files and 12 tests passed.
- `pnpm --filter @production-spec-graph/graph-protocol build`: PASS.
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`: PASS with escalated execution because sandboxed `tsx` may hit a macOS IPC pipe permission issue.
- `git diff --check`: PASS.

### Modularity & Readability Notes
The operation layer is isolated in `src/operations.ts` and reuses `validateProductGraph` from `src/validation.ts` instead of duplicating semantic graph invariants. Public operation types are in `src/types.ts`, and consumers reach the API through `src/index.ts`.

Operations build candidate graphs immutably with new node/edge arrays. Expected conflicts return deterministic issue objects instead of throwing. Final candidate validation remains the source of truth for structural and semantic graph integrity. Tests document the operation contract without coupling to private helper names.

### Human Checkpoint
Pause before F3 canvas work. A developer should inspect whether operation names, input shapes, success/failure result shape, issue codes, and node-deletion edge cleanup behavior are suitable for both tldraw UI integration and future AI callers.

Recommended local commands:
- `pnpm --filter @production-spec-graph/graph-protocol test`
- `pnpm --filter @production-spec-graph/graph-protocol build`
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`

Inspect:
- `packages/graph-protocol/src/operations.ts` for operation API boundaries and immutability.
- `packages/graph-protocol/src/index.ts` for public exports.
- `packages/graph-protocol/test/operations.test.ts` for scenario coverage and conflict semantics.

### Decisions Made
- Operation functions return result objects for expected conflicts rather than throwing, so UI and future AI callers can inspect failures consistently.
- Update operations do not allow changing a node id; `updateFlowchartNode` preserves the existing id even if a caller passes a broader object by mistake.
- Delete-node operation removes all incident edges so the graph never retains dangling references.
- Edge creation lets `validateProductGraph` produce missing endpoint issues, while preflight duplicate checks catch id conflicts before constructing a successful result.

### Quality Command Results
- `pnpm --filter @production-spec-graph/graph-protocol test`: PASS, 3 files and 12 tests passed.
- `pnpm --filter @production-spec-graph/graph-protocol build`: PASS.
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`: PASS.
- `git diff --check`: PASS.

### Known Issues
- `schema:export` may need escalated execution in this Codex sandbox because `tsx` can create an IPC pipe under the macOS temp directory. The command completed successfully when run outside the sandbox.

### Test Results
- Focused protocol and operation tests: PASS.
- Build: PASS.
- Schema export: PASS.
- Whitespace check: PASS.
