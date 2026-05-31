# Sprint 1 Contract: Shared Graph Protocol Foundation

## Feature
F1: Shared Graph Protocol Foundation

## Scope
This sprint establishes the pnpm monorepo foundation only far enough to build, test, and export a shared graph protocol package. It creates a shared package under `packages/graph-protocol` that owns the MVP product graph TypeScript types, Zod schemas, JSON Schema export, and validation entry points.

The protocol will cover the flowchart MVP graph shape:

- Graph metadata: graph id, schema version, optional title/description, and extension-friendly metadata.
- Flowchart nodes: stable id, kind, label, canvas projection position, optional size, and extension-friendly metadata.
- Flowchart node kinds: `start`, `process`, `decision`, and `end`.
- Flowchart edges: stable id, source node id, target node id, optional label, optional canvas projection waypoints, and extension-friendly metadata.
- Validation boundaries: structural Zod validation plus graph-level semantic checks for duplicate ids, unsupported kinds, malformed required fields, and edges that reference missing nodes.
- Error reporting: a validation result that never returns partial graph data as safe when validation fails, and exposes inspectable issue data with path/code/message information.
- JSON Schema export: a package export and runnable command that produces a machine-readable schema artifact for the same protocol shape accepted by the Zod schemas, with graph-level semantic constraints documented as runtime validation constraints where JSON Schema cannot express them.

## Out of Scope
- No Next.js app, `apps/web`, shadcn/ui, tldraw canvas, or browser-visible implementation.
- No flowchart CRUD or graph mutation operations beyond validation and schema export. Those belong to F2.
- No canvas synchronization, model inspector, persistence, import/export workflow, AI generation, PRD ingestion, or collaboration behavior.
- No full product-spec ontology beyond the flowchart core kinds listed in this contract.
- No advanced schema version migration system beyond establishing the initial `schemaVersion` field.

## Behavior Scenarios

### Scenario: Validate a minimal flowchart graph
Given a graph containing two valid flowchart nodes and one valid edge between them  
When the graph is parsed through the shared protocol validation entry point  
Then the graph is accepted as valid structured product-spec data  
And the validated result preserves node id, edge id, labels, flowchart kinds, position, optional projection fields, and metadata needed by later canvas rendering.

### Scenario: Reject structurally invalid graph data
Given graph input with a malformed node, a duplicate graph record id, an unsupported flowchart node kind, or an edge referencing a missing node  
When the graph is parsed through the shared protocol validation entry point  
Then validation fails with inspectable errors that identify the invalid graph area  
And no partial valid graph is reported as safe to use.

### Scenario: Export machine-readable schema
Given the shared protocol schemas exist for the MVP flowchart graph  
When the package JSON Schema export command is run  
Then a tool can read the exported schema artifact without importing TypeScript source  
And the schema describes the accepted graph, node, edge, flowchart kind, projection, and metadata shapes.

## Acceptance Criteria
| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-1.1 | A pnpm workspace scaffold exists at the repository root and is limited to shared-package build/test support for this sprint. | Inspect `package.json`, `pnpm-workspace.yaml`, and root TypeScript config; run `pnpm --filter @production-spec-graph/graph-protocol build`. |
| AC-1.2 | A shared package exists under `packages/graph-protocol` and is the authoritative owner of graph TypeScript types, Zod schemas, JSON Schema export, and validation entry points. | Inspect package public exports and run `pnpm --filter @production-spec-graph/graph-protocol build`. |
| AC-1.3 | The protocol supports the MVP flowchart graph shape: graph metadata, typed nodes, typed edges, labels, canvas projection fields, and extension-friendly metadata. | Focused tests in `packages/graph-protocol/test/validation.test.ts` validate a minimal graph and assert preserved fields. |
| AC-1.4 | Validation rejects duplicate ids, missing node references from edges, unsupported flowchart element kinds, and malformed required fields with inspectable error information. | Focused tests in `packages/graph-protocol/test/validation.test.ts` cover each invalid case and assert failure issue paths/codes/messages. |
| AC-1.5 | JSON Schema export is available from the shared package and covers the same graph, node, edge, flowchart kind, projection, and metadata shapes accepted by Zod structural validation. | Run `pnpm --filter @production-spec-graph/graph-protocol schema:export`; focused tests in `packages/graph-protocol/test/json-schema.test.ts` read the exported JSON and assert expected schema sections. |
| AC-1.6 | Automated checks demonstrate valid graph acceptance, invalid graph rejection, JSON Schema export, and package build success. | Run `pnpm --filter @production-spec-graph/graph-protocol test`, `pnpm --filter @production-spec-graph/graph-protocol build`, and `pnpm --filter @production-spec-graph/graph-protocol schema:export`. |

## Test Strategy

### TDD Decision
Use TDD: Yes

Rationale:
- F1 defines deterministic validation, schema, and protocol boundary behavior. Small tests can precisely define correctness before implementation.
- The root workspace scaffold is mostly mechanical, but it exists to support the shared package tests and build commands, so strict TDD applies to the protocol behavior and runtime export path rather than to every config file.

Planned evidence:
- RED: First add focused tests for valid graph acceptance, invalid graph rejection, inspectable validation issues, and JSON Schema export. These should fail initially because the package and API do not exist yet.
- GREEN: Implement the minimal shared package and root scaffold needed for those tests and package commands to pass.
- REFACTOR: Split schemas, validation, JSON Schema export, and public exports into cohesive modules while keeping the focused test command green.

Planned focused tests:
- `packages/graph-protocol/test/validation.test.ts`
  - accepts a minimal valid flowchart graph and preserves ids, labels, positions, projection fields, and metadata
  - rejects duplicate node ids, duplicate edge ids, and node/edge record id collisions
  - rejects an edge whose source or target node id is missing
  - rejects unsupported flowchart node kinds and malformed required fields
  - returns inspectable issue data without returning parsed graph data on failure
- `packages/graph-protocol/test/json-schema.test.ts`
  - exports machine-readable JSON Schema
  - includes graph, node, edge, flowchart kind, projection, and metadata shape descriptions
  - can read the generated schema artifact from disk after `schema:export`

### E2E / Runtime Verification
F1 has no visible UI, so browser E2E is not applicable in this sprint. The runtime final-behavior check is package-level execution:

- `pnpm --filter @production-spec-graph/graph-protocol test`
- `pnpm --filter @production-spec-graph/graph-protocol build`
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`

The schema export command must run against the actual package implementation and write or refresh `packages/graph-protocol/schema/product-graph.schema.json`. This is the sprint's runtime verification that the protocol is consumable without TypeScript imports.

## Modularity & Readability Plan
Expected files and modules to create or edit:

- `package.json`: private root package with pnpm package manager metadata and scripts that delegate to the shared package.
- `pnpm-workspace.yaml`: workspace globs for `packages/*` and future `apps/*`, without creating any UI app in this sprint.
- `tsconfig.base.json`: root TypeScript defaults shared by packages.
- `.gitignore`: Node, build output, and coverage ignores if absent.
- `packages/graph-protocol/package.json`: package name, exports, scripts, runtime dependencies, and dev tooling for the protocol package.
- `packages/graph-protocol/tsconfig.json`: package TypeScript config extending the root base config.
- `packages/graph-protocol/src/schemas.ts`: Zod schemas and schema-level constants for graph, node, edge, projection, flowchart kinds, and metadata.
- `packages/graph-protocol/src/types.ts`: exported TypeScript types inferred from the schemas where practical.
- `packages/graph-protocol/src/validation.ts`: public parse/validate entry points and semantic graph checks.
- `packages/graph-protocol/src/json-schema.ts`: JSON Schema construction and export helpers.
- `packages/graph-protocol/src/export-schema.ts`: package script entry point that writes the schema artifact.
- `packages/graph-protocol/src/index.ts`: stable public API surface for future app and AI consumers.
- `packages/graph-protocol/schema/product-graph.schema.json`: generated machine-readable schema artifact.
- `packages/graph-protocol/test/validation.test.ts`: TDD coverage for validation behavior.
- `packages/graph-protocol/test/json-schema.test.ts`: TDD coverage for schema export behavior.
- `packages/graph-protocol/test/fixtures.ts`: small reusable valid and invalid graph fixtures if it keeps tests readable.

Schemas should stay declarative, graph-level semantic validation should stay in `validation.ts`, and JSON Schema generation should stay isolated so later F2 graph operations do not need to understand export mechanics. Comments should be limited to non-obvious distinctions, especially where JSON Schema cannot express a runtime invariant that validation enforces.

## Human Checkpoint
Pause after Sprint 1 implementation before starting F2. The protocol becomes the provider contract for later graph operations and UI code, so a developer should inspect whether the flowchart kinds, projection fields, metadata shape, and validation error shape are acceptable.

Recommended local commands for the checkpoint:

- `pnpm install`
- `pnpm --filter @production-spec-graph/graph-protocol test`
- `pnpm --filter @production-spec-graph/graph-protocol build`
- `pnpm --filter @production-spec-graph/graph-protocol schema:export`

Inspect:

- `packages/graph-protocol/src/index.ts` for the intended public API
- `packages/graph-protocol/src/schemas.ts` and `packages/graph-protocol/src/validation.ts` for protocol boundaries
- `packages/graph-protocol/schema/product-graph.schema.json` for machine-readable shape
- test names and fixtures to confirm they document the expected MVP graph behavior

## Technical Approach
Create the minimal pnpm workspace scaffold first, then implement `packages/graph-protocol` as the sole owner of protocol schemas and validation. Use Zod for structural validation and add a semantic validation pass for duplicate ids and edge endpoint integrity. Generate JSON Schema from the Zod protocol schemas and expose both a library helper and a package script that writes a JSON artifact. Keep all public protocol exports behind `src/index.ts` so later sprints consume one stable package boundary.

## Dependencies
- Product dependencies: none. F1 is the first feature and does not depend on existing app or package code.
- Tooling dependencies to introduce during implementation: pnpm workspace metadata, TypeScript, Zod, a JSON Schema export library compatible with Zod, and a focused test runner such as Vitest.
- Environment dependency: installing npm packages may require network access during implementation.

## Estimated Complexity
M
