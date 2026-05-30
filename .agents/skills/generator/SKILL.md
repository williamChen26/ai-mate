---
name: generator
description: "Generator agent skill: propose sprint contracts or implement sprint features. Operates within the ralph loop under orchestrator control."
user_invocable: true
---

# /generator — Sprint Generator

Operates in two modes: **contract proposal** or **implementation**. Contracts are BDD-first, implementation uses selective TDD, and every runnable final behavior needs E2E or runtime verification.

## Usage

```
/generator contract <run-id>    # Propose next sprint contract
/generator build <run-id>       # Implement current sprint
```

## Mode: Contract Proposal

### Step 1: Resolve Run

Locate `docs/exec-plans/active/<run-id>/`. Verify `meta.json` exists and `status` is `"sprinting"`.

### Step 2: Determine Sprint Number

From `meta.json`, count completed sprints + 1. Create `sprints/sprint-<N>/` directory.

### Step 3: Gather Context

- `spec.md` — big picture blueprint
- `meta.json` — which features are done/pending
- Previous sprints' `build-log.md` — what already exists

### Step 4: Invoke Generator Agent (contract mode)

Spawn Generator agent with the preferred coding model, with:
- Agent instructions from `.claude/agents/generator.md` (Mode 1 section)
- Gathered context
- Instruction to write `sprints/sprint-<N>/contract.md` with behavior scenarios, TDD Decision, E2E/runtime plan, modularity/readability plan, and Human Checkpoint recommendation

### Step 5: Update Meta

```json
{
  "current_sprint": {
    "number": <N>,
    "feature_id": "<picked feature>",
    "status": "contracting",
    "round": 0,
    "max_rounds": 3
  }
}
```

### Step 6: Report

Show proposed contract summary. Prompt: "Run `/evaluator contract <run-id>` to review the contract."

---

## Mode: Implementation

### Step 1: Resolve Run + Sprint

Verify `current_sprint.status` is `"approved"` or `"revising"`.

### Step 2: Determine Round

If `"approved"` → round 1. If `"revising"` → increment round.

### Step 3: Gather Context (Progressive Disclosure)

**Round 1:**
- `sprints/sprint-<N>/contract.md`
- `ARCHITECTURE.md`
- Relevant existing code

**Round 2+:**
- All of round 1
- `sprints/sprint-<N>/evaluation.md`
- `sprints/sprint-<N>/iterations/round-<M>/feedback.md`
- Previous `build-log.md`

### Step 4: Invoke Generator Agent (implementation mode)

Spawn Generator agent with the preferred coding model, with:
- Agent instructions from `.claude/agents/generator.md` (Mode 2 section)
- Gathered context
- Instruction to: follow the TDD Decision → implement modularly → run E2E/runtime checks where runnable → self-evaluate → write `build-log.md`

### Step 5: Update Meta

```json
{
  "current_sprint": {
    "status": "generating",
    "round": <M>
  }
}
```

After completion: `status → "evaluating"`

### Step 6: Report

Show build summary from `build-log.md`. If the sprint produced a runnable/manual-validation milestone, include the exact local commands and what the developer should inspect before continuing. Prompt: "Run `/evaluator sprint <run-id>` to evaluate."

## Required Artifact Sections

### contract.md additions

Every sprint contract must include these sections before `Technical Approach`:

- `Behavior Scenarios`: carry over or refine the spec scenarios. Use Given/When/Then for user-visible behavior; for internal modules, state the precondition, operation, and observable result.
- `TDD Decision`: say whether TDD will be used. Use TDD for core deterministic logic such as parsing, state transitions, permissions, validation, ranking, scheduling, protocol mapping, pricing/calculation rules, and data transformations. TDD may be skipped for documentation, prompt copy, mechanical wiring, simple styling, one-off configuration, or exploratory UI layout when the tradeoff is recorded.
- `E2E / Runtime Verification`: name the executable final-behavior check, such as an E2E command, browser scenario, spawned process, CLI invocation, or runtime smoke test. If true E2E is impractical, explain the fallback.
- `Modularity & Readability Plan`: describe cohesive module boundaries, files likely to change, how oversized low-cohesion or tight-coupling problems will be avoided, and where comments/tests should explain non-obvious behavior.
- `Human Checkpoint`: say whether this sprint should pause for manual validation. If yes, list local commands and what the developer should inspect.

### build-log.md additions

Every build log must include:

- `Behavior Scenario Evidence`: map each scenario to a test, E2E/runtime check, or manual observation.
- `TDD Decision & Evidence`: record RED/GREEN/REFACTOR evidence when TDD was selected, or the substitute focused validation and tradeoff when TDD was skipped.
- `E2E / Runtime Verification`: command or scenario executed, result, and fallback rationale if needed.
- `Modularity & Readability Notes`: module boundaries, extracted helpers, large-file risks avoided or justified, useful comments, and tests that act as documentation.
- `Human Checkpoint`: whether to pause, exact local commands, and what behavior or architecture to inspect.
