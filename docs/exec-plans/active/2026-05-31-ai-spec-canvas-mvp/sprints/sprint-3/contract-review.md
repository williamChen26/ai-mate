# Contract Review: Sprint 3 — Runnable Canvas Application Shell

## Verdict: APPROVED

## Summary
Sprint 3 is scoped to one feature, F3 Runnable Canvas Application Shell, and does not pull in F4 canvas CRUD, F5 synchronization inspector, or later hardening work. The contract is testable and includes BDD scenarios before acceptance criteria, a practical TDD skip rationale, runtime/browser verification for visible canvas behavior, modularity/readability expectations, and a human checkpoint.

## Evidence
- Scope matches F3: the contract creates a runnable `apps/web` Next.js/tldraw shell and a small graph-protocol integration point at `contract.md:6-27`, while excluding custom flowchart CRUD, synchronization, inspector, import/export, persistence, AI workflows, and landing-page/marketing work at `contract.md:29-36`.
- Dependencies are met: `meta.json:9-18` shows F1 and F2 completed, `meta.json:45-49` shows Sprint 3 is the current contracting sprint for F3, and Sprint 2 evaluation passed with graph-protocol tests/build/schema export green.
- BDD-first structure is present: `Behavior Scenarios` appear before `Acceptance Criteria` at `contract.md:38-67`. The scenarios cover opening the canvas demo, accessing editing controls, preserving product-engine orientation, and validating monorepo/runtime integration.
- First-screen usable canvas is explicit: the contract requires the first screen to be the runnable canvas app rather than a landing page at `contract.md:43`, visible editable tldraw canvas without placeholder-only content at `contract.md:44`, and first-screen tldraw primary experience verification at `contract.md:71`.
- Acceptance criteria are objective and independently verifiable: AC-3.1 through AC-3.7 define concrete file/package, runtime, import-boundary, interaction, shared-package regression, and script-validation checks at `contract.md:70-76`.
- TDD decision is documented with a reasonable tradeoff: the contract skips TDD for UI shell/framework wiring, explains why deterministic TDD is low value for this sprint, and requires focused executable validation instead at `contract.md:80-95`.
- Runtime/browser verification is required: the contract requires a Playwright or equivalent browser smoke check that loads the app, locates the tldraw editor, performs a lightweight interaction, and checks the editor remains visible without an error overlay at `contract.md:97-109`.
- Modularity/readability expectations are sufficient: route thinness, component/helper separation, graph-protocol as provider contract, no parallel protocol types, no tldraw leakage into the shared package, and stable full-viewport layout constraints are specified at `contract.md:111-116`.
- Human checkpoint is present and useful: the contract instructs a pause after implementation, lists local commands, and names exact manual inspection targets for canvas usability, app chrome, protocol imports, and console/runtime errors at `contract.md:118-135`.

## Notes For Implementation Review
During sprint evaluation, runtime evidence must actually exercise the visible canvas behavior described in AC-3.2 and AC-3.5. A static build or DOM-only page-response check should not pass unless the contract's fallback condition is clearly triggered and documented.
