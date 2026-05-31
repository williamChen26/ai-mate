# Sprint 2 Contract: Flowchart Graph Operations

## Feature
F2: Flowchart Graph Operations

## Scope
Implement shared graph operation APIs in `packages/graph-protocol` for protocol-aware flowchart CRUD and connection management. The sprint is limited to deterministic, immutable operations over the Sprint 1 `ProductGraph` model:

- create a flowchart node
- update an existing flowchart node's editable protocol fields
- delete a flowchart node and remove its connected edges
- create a flowchart edge
- delete a flowchart edge
- validate the resulting graph after every successful change attempt
- return deterministic success/failure results with inspectable validation or conflict issues

Expected files/modules to create or edit:

- Create `packages/graph-protocol/src/operations.ts` for operation functions and operation-specific helpers.
- Edit `packages/graph-protocol/src/types.ts` only if operation input/result public types belong with existing exported protocol types.
- Edit `packages/graph-protocol/src/index.ts` to export the new public operations API and types.
- Create `packages/graph-protocol/test/operations.test.ts` for focused graph operation behavior.
- Edit `packages/graph-protocol/test/fixtures.ts` only if shared operation fixtures reduce duplication in tests.

## Out of Scope
- No Next.js app, tldraw canvas, browser UI, shadcn/ui, or app package work.
- No canvas synchronization, inspector, persistence, import/export workflow, undo/redo, layout, routing, or automatic ids.
- No schema version migrations or full product-spec ontology beyond the existing flowchart node kinds.
- No modification to `spec.md`.
- No changes to JSON Schema export unless required to keep existing package tests/build passing after public type exports.

## Behavior Scenarios
- Scenario: Create and update a flowchart node
  - Given an existing valid `ProductGraph`
  - When a caller creates a new flowchart node with a unique id and valid protocol fields
  - Then the operation returns success with a new graph containing the node
  - And the returned graph passes `validateProductGraph`
  - When the caller updates that node's editable fields such as label, kind, position, size, or metadata
  - Then the operation returns success with a new graph containing the updated node
  - And unchanged graph records keep their existing values

- Scenario: Connect and disconnect flowchart nodes
  - Given a valid graph with two existing flowchart nodes
  - When a caller creates an edge with a unique id and existing source and target node references
  - Then the operation returns success with a new valid graph containing the edge
  - When the caller deletes that edge by id
  - Then the operation returns success with a new valid graph without that edge

- Scenario: Reject invalid edge references
  - Given a valid graph
  - When a caller tries to create an edge whose source or target node id does not exist
  - Then the operation returns a deterministic failure result with inspectable issues
  - And the failed operation does not return an invalid graph as successful data

- Scenario: Delete a connected node
  - Given a valid graph containing a node with incoming or outgoing edges
  - When the node is deleted through the shared operation API
  - Then the operation returns success with a new valid graph that excludes the node
  - And every connected edge is removed so no dangling edge references remain

- Scenario: Handle duplicate or conflicting changes
  - Given a valid graph
  - When a caller tries to create a node with an existing node id, create an edge with an existing edge id or node id, update a missing node, delete a missing node, or delete a missing edge
  - Then the operation returns a deterministic failure result with stable issue codes and paths/messages useful to UI and future AI callers
  - And the original graph object is not mutated.

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-2.1 | `packages/graph-protocol` exports shared operations for node create, node update, node delete, edge create, edge delete, and validation after changes. | Code review of `src/operations.ts` and `src/index.ts`; `pnpm --filter @production-spec-graph/graph-protocol build`. |
| AC-2.2 | Each successful operation returns a deterministic success shape containing a new validated `ProductGraph` and no issues. | `pnpm --filter @production-spec-graph/graph-protocol test` with operation tests for create/update/delete node and create/delete edge. |
| AC-2.3 | Duplicate or conflicting changes fail deterministically with inspectable issue data and without mutating the original graph. | `packages/graph-protocol/test/operations.test.ts` covers duplicate node ids, duplicate edge ids, node/edge id collisions, missing node updates/deletes, missing edge deletes, and original graph immutability. |
| AC-2.4 | Creating an edge validates source/target node references and rejects edges that would leave the graph invalid. | `packages/graph-protocol/test/operations.test.ts` covers missing source and target references; existing `validateProductGraph` is used as the final validity check. |
| AC-2.5 | Deleting a connected node removes all incident edges and leaves no dangling references. | `packages/graph-protocol/test/operations.test.ts` asserts node removal, connected edge cleanup, and a passing `validateProductGraph` result. |
| AC-2.6 | Operation implementation stays limited to the shared package and does not add app/UI/canvas code. | Code review of the changed file list plus `rg --files packages/graph-protocol docs/exec-plans/active/2026-05-31-ai-spec-canvas-mvp/sprints/sprint-2`; no new app or tldraw files are expected. |
| AC-2.7 | The package still builds and existing Sprint 1 validation/schema behavior remains green. | `pnpm --filter @production-spec-graph/graph-protocol test`, `pnpm --filter @production-spec-graph/graph-protocol build`, and `pnpm --filter @production-spec-graph/graph-protocol schema:export`. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
F2 is deterministic graph state-transition logic. It defines how callers transform protocol data, handle conflict states, preserve validation invariants, and avoid mutation. Focused tests should be written before implementation because they can specify the operation contract more clearly than ad hoc manual checks.

Planned evidence:
- RED: Add `packages/graph-protocol/test/operations.test.ts` first with focused failing tests for node create/update/delete, edge create/delete, missing references, duplicate/conflicting changes, connected-node deletion cleanup, and immutability.
- GREEN: Implement `src/operations.ts`, add any needed public operation types, export through `src/index.ts`, and rerun the focused test command until all operation tests pass.
- REFACTOR: Keep helper functions cohesive inside `operations.ts` or extract only if needed; rerun focused tests plus package build after cleanup.

### E2E / Runtime Verification
No browser E2E applies to Sprint 2 because this sprint has no runnable UI surface and must not create Next.js or tldraw code.

Executable runtime verification:
- `pnpm --filter @production-spec-graph/graph-protocol test`
- `pnpm --filter @production-spec-graph/graph-protocol build`
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`
- `git diff --check`

The package tests/build are the final behavior check for this sprint because the public runtime surface is the shared TypeScript package.

## Modularity & Readability Plan
The operation layer should live in `packages/graph-protocol/src/operations.ts` and reuse existing validation from `src/validation.ts` rather than duplicating graph invariants. Operation-specific result and issue types should be colocated with the operation API or exported from `src/types.ts` if they are part of the public contract.

The implementation should keep immutable update patterns: create new graph, node, and edge arrays instead of mutating inputs. Conflict detection should be small, explicit helpers with stable issue codes; final graph validation should use `validateProductGraph` so operation behavior stays aligned with Sprint 1 protocol rules. Tests should read as behavior documentation and avoid coupling to private helper names.

Avoid oversized or mixed-responsibility files. `schemas.ts` should not become an operation module, and app/canvas concerns must not enter `packages/graph-protocol`.

## Human Checkpoint
Pause after Sprint 2 implementation before starting canvas work. A developer should inspect whether the operation names, input shapes, success/failure result shape, issue codes, and node-deletion edge cleanup behavior are suitable for both the future tldraw UI and AI-facing callers.

Recommended local commands:
- `pnpm --filter @production-spec-graph/graph-protocol test`
- `pnpm --filter @production-spec-graph/graph-protocol build`
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`

Inspect:
- `packages/graph-protocol/src/operations.ts` for operation API boundaries and immutability.
- `packages/graph-protocol/src/index.ts` for public exports.
- `packages/graph-protocol/test/operations.test.ts` for scenario coverage and conflict semantics.

## Technical Approach
Add a small operation API over the existing `ProductGraph` type. Each operation should build a candidate graph immutably, run existing graph validation, and return a stable result object rather than throwing for expected conflicts. Conflict checks should catch obvious duplicate or missing-record requests before constructing invalid graph states, while final validation remains the source of truth for protocol integrity.

## Dependencies
- F1 must remain completed and passing.
- Existing `packages/graph-protocol` Zod schemas, inferred types, and validation functions.
- Workspace dependencies installed through `pnpm install`.

## Estimated Complexity
M
