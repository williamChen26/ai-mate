# Spec: Harness Quality Lifecycle Upgrade

## Background

The current Ralph Harness already separates planning, generation, and evaluation, but its quality loop is still mostly acceptance-criteria driven. That leaves several gaps: requirements are not always grounded in concrete behavior scenarios, TDD is applied too broadly instead of selectively, final behavior can pass static checks without true end-to-end validation, and AI-generated code can grow into large files that are hard for a human developer to understand after several sprints.

This upgrade turns the harness into a behavior-first, evidence-rich, human-readable delivery loop.

## Goals

1. Make BDD scenarios the first-class expression of behavior before sprint acceptance criteria.
2. Add a selective TDD policy that uses test-first development for core logic where it pays off, while allowing documented tradeoffs for low-risk wiring or exploratory work.
3. Require E2E or runtime verification for final user-visible behavior whenever the feature has an executable surface.
4. Add implementation guardrails for modularity, cohesion, coupling, comments, and tests-as-documentation.
5. Add human checkpoints so the loop pauses when a runnable slice is ready for local manual validation or when the developer needs time to understand the product direction and architecture.

## Non-Goals

- Do not build an actual product feature in this sprint; this is a harness architecture upgrade.
- Do not require blanket TDD for every change. Documentation, prompt changes, simple styling, mechanical wiring, and low-risk adapters can use conventional validation if the tradeoff is recorded.
- Do not replace the existing Planner -> Generator -> Evaluator shape.
- Do not add heavyweight automation that requires external services or network access.

## Feature List

### F1: BDD/TDD/E2E harness quality lifecycle

Update the harness, planner, generator, evaluator, and exec-plan documentation so every sprint can carry behavior scenarios, selective TDD decisions, E2E/runtime verification plans, modularity expectations, and human checkpoint recommendations as durable artifacts.

**Acceptance Criteria:**

- AC-1.1: Planner specs and generator contracts require a `Behavior Scenarios` section before acceptance criteria, using Given/When/Then style scenarios for user-visible behavior or concrete module behavior for non-UI work.
- AC-1.2: Generator contract and build-log templates require a `TDD Decision` that records whether TDD is applied, why, examples of when to apply or skip it, and RED/GREEN/REFACTOR evidence when TDD is selected.
- AC-1.3: Generator and Evaluator instructions require E2E or runtime verification for final behavior whenever a runnable surface exists, with documented fallback only when true E2E is not practical.
- AC-1.4: Generator and Evaluator instructions include modularity/readability gates: cohesive modules, explicit boundaries, avoidance of oversized single files, useful comments for non-obvious logic, and tests that help a developer understand behavior.
- AC-1.5: Harness orchestration includes human checkpoints at spec review, contract approval, runnable/manual-validation milestones, and completion; a sprint can intentionally pause with clear local run and validation instructions.
- AC-1.6: All mirrored prompt surfaces used by this repo stay consistent: `.agents`, `.claude`, `.cursor`, `.codex`, plus `docs/exec-plans/index.md` and `docs/exec-plans/quality-commands.md`.

**Priority:** P0 (must-have)
**Dependencies:** None

## Risks & Dependencies

- Prompt drift is the main risk because this repository stores multiple mirrored agent surfaces. The implementation must update them consistently.
- Overly rigid TDD wording could slow future agents down. The policy must be explicit about tradeoffs and give practical examples.
- E2E requirements can become vague if no runnable target exists. Contracts must require either an executable E2E path or a documented runtime substitute.
- Modularity rules should guide judgment rather than impose arbitrary churn on existing code.

## Open Questions

- Default pause frequency: this spec proposes pausing at every runnable/manual-validation milestone and after any sprint that introduces a new end-to-end vertical slice.
- File-size threshold: this spec proposes "avoid adding or leaving large single-purpose files without justification" rather than a hard numeric line limit, because target stacks differ.

## Suggested Sprint Order

1. F1 only. This repo's harness surface is small, and the requested improvements are tightly coupled as one lifecycle policy.
