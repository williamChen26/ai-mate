# Sprint 1 Contract: BDD/TDD/E2E Harness Quality Lifecycle

## Feature

F1: BDD/TDD/E2E harness quality lifecycle

## Scope

Update the harness prompt and documentation surfaces so future Ralph runs use BDD scenarios first, selective TDD for suitable core logic, E2E/runtime verification for final behavior, modularity/readability guardrails, and explicit human pause checkpoints. The work is limited to harness instructions and exec-plan documentation; it does not implement product code.

Files in scope:

- `.agents/skills/harness/SKILL.md`
- `.agents/skills/planner/SKILL.md`
- `.agents/skills/generator/SKILL.md`
- `.agents/skills/evaluator/SKILL.md`
- `.agents/agents/planner.md`
- `.agents/agents/generator.md`
- `.agents/agents/evaluator.md`
- `.claude/skills/*/SKILL.md`
- `.claude/agents/*.md`
- `.cursor/skills/*/SKILL.md`
- `.cursor/agents/*.md`
- `.codex/agents/*.toml`
- `docs/exec-plans/index.md`
- `docs/exec-plans/quality-commands.md`
- `AGENTS.md`, only if needed to explain the new checkpoint behavior

## Out of Scope

- Product feature implementation.
- Adding external dependencies or network-backed tooling.
- Rewriting the Ralph loop into a different architecture.
- Creating strict line-count-only rules that force noisy refactors.
- Making TDD mandatory for every sprint or every file.

## Behavior Scenarios

### Scenario 1: Behavior-first planning

Given a user asks for a feature through the harness  
When Planner writes `spec.md`  
Then each feature includes concrete behavior scenarios before acceptance criteria  
And the scenarios are specific enough for Generator and Evaluator to reason about expected behavior without relying on chat context.

### Scenario 2: Selective TDD tradeoff

Given a sprint contains core deterministic logic such as parsing, state transitions, permission rules, ranking, validation, protocol mapping, or pricing calculations  
When Generator proposes and implements the sprint  
Then it selects TDD, writes tests first, records RED/GREEN/REFACTOR evidence, and keeps those tests as living documentation.  
Given a sprint is mostly documentation, prompt copy, mechanical wiring, simple styling, or exploratory UI layout  
Then Generator may skip strict TDD only if it records the tradeoff and provides appropriate focused validation.

### Scenario 3: Runnable behavior checkpoint

Given a sprint produces a locally runnable vertical slice or meaningful behavior milestone  
When Generator finishes the sprint or Evaluator passes it  
Then the harness reports that the developer can pause, start the project locally, run named commands, inspect the implemented behavior, and decide whether to continue.

### Scenario 4: Readable AI implementation

Given Generator modifies or creates code  
When the sprint is handed off  
Then the implementation is split into cohesive modules with clear boundaries, avoids oversized low-cohesion files, includes comments for non-obvious logic, and has tests that help explain the behavior to a human developer.

## Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|---------------------|
| AC-1.1 | Planner specs and generator contracts require a `Behavior Scenarios` section before acceptance criteria. | Inspect updated planner/generator templates and run `rg "Behavior Scenarios" .agents .claude .cursor .codex docs/exec-plans`. |
| AC-1.2 | Generator contract/build-log instructions include selective `TDD Decision` guidance with apply/skip examples and RED/GREEN/REFACTOR evidence when chosen. | Inspect generator prompts and run `rg "TDD Decision|RED|GREEN|REFACTOR" .agents .claude .cursor .codex docs/exec-plans`. |
| AC-1.3 | Generator and Evaluator require E2E or runtime verification for runnable final behavior, with a documented fallback when true E2E is impractical. | Inspect generator/evaluator prompts and run `rg "E2E|runtime verification|runnable" .agents .claude .cursor .codex docs/exec-plans`. |
| AC-1.4 | Generator and Evaluator include modularity/readability gates for cohesive modules, low coupling, oversized files, useful comments, and tests-as-documentation. | Inspect generator/evaluator prompts and run `rg "cohesive|coupling|oversized|comments|tests as documentation|tests-as-documentation" .agents .claude .cursor .codex docs/exec-plans`. |
| AC-1.5 | Harness orchestration includes human checkpoints for spec review, contract approval, runnable/manual-validation milestones, and completion. | Inspect harness skills/docs and run `rg "Human Checkpoint|manual validation|pause" .agents .claude .cursor docs/exec-plans AGENTS.md`. |
| AC-1.6 | Mirrored prompt surfaces stay consistent across `.agents`, `.claude`, `.cursor`, and `.codex`; exec-plan docs describe the new lifecycle. | Compare corresponding prompt files, validate TOML shape with `python -m tomllib` or equivalent, and inspect docs. |

## Technical Approach (brief)

Revise the source prompt surfaces in `.agents` first, then mirror equivalent wording into `.claude`, `.cursor`, and `.codex` so all supported agent runtimes receive the same policy. Keep the Ralph loop intact, but enrich its artifacts: specs get behavior scenarios, contracts get behavior scenarios and test strategy, build logs get TDD and architecture evidence, and evaluations enforce the new gates. Update docs so future humans understand the lifecycle without reading every prompt file.

## Dependencies

None.

## Estimated Complexity

M
