---
name: evaluator
description: "Evaluator agent skill: review sprint contracts or evaluate sprint implementations. Quality gate with hard thresholds."
user_invocable: true
---

# /evaluator — Sprint Evaluator

Operates in two modes: **contract review** or **sprint evaluation**. The quality gate covers behavior scenarios, selective TDD evidence, E2E/runtime behavior, modularity/readability, and human checkpoint readiness.

## Usage

```
/evaluator contract <run-id>    # Review proposed sprint contract
/evaluator sprint <run-id>      # Evaluate sprint implementation
```

## Mode: Contract Review

### Step 1: Resolve Run

Locate `docs/exec-plans/active/<run-id>/`. Verify `current_sprint.status` is `"contracting"`.

### Step 2: Gather Context

- `sprints/sprint-<N>/contract.md` — proposed contract
- `spec.md` — big picture
- `meta.json` — completion status

### Step 3: Invoke Evaluator Agent (contract review mode)

Spawn Evaluator agent with the strongest available review model, with:
- Agent instructions from `.claude/agents/evaluator.md` (Mode 1 section)
- Gathered context
- Instruction to review behavior scenarios, acceptance criteria, TDD Decision, E2E/runtime plan, modularity/readability plan, Human Checkpoint, and write verdict

### Step 4: Process Verdict

**APPROVED:**
- Update `current_sprint.status → "approved"`
- Report: "Contract approved. Run `/generator build <run-id>` to start implementation."

**REVISE:**
- Write Evaluator's feedback to `sprints/sprint-<N>/contract-feedback.md`
- Update `current_sprint.status → "contracting"` (Generator needs to revise)
- Report: what needs to change. Prompt: "Run `/generator contract <run-id>` to revise."

---

## Mode: Sprint Evaluation

### Step 1: Resolve Run

Verify `current_sprint.status` is `"evaluating"`.

### Step 2: Gather Context (Progressive Disclosure)

- `sprints/sprint-<N>/contract.md` — grading rubric
- `sprints/sprint-<N>/build-log.md` — Generator's self-assessment (cross-reference only)
- Actual code changes (read modified files from build-log)
- Run tests independently
- Previous feedback (if round 2+)

### Step 3: Invoke Evaluator Agent (evaluation mode)

Spawn Evaluator agent with the strongest available review model, with:
- Agent instructions from `.claude/agents/evaluator.md` (Mode 2 section)
- Gathered context
- Instruction to: evaluate behavior scenarios, TDD evidence/tradeoff, E2E/runtime behavior, modularity/readability, every criterion → write `evaluation.md` → if FAIL write `feedback.md`

### Step 4: Process Verdict

**PASS:**
```json
{
  "current_sprint": { "status": "passed" },
  "spec_features": [{ "id": "F-X", "status": "completed" }],
  "sprint_history": [..., { "number": N, "feature_id": "F-X", "rounds": M, "verdict": "passed" }]
}
```

Check if more features remain:
- **Yes**: Report success + "Run `/generator contract <run-id>` for the next sprint."
- **No**: Set `status → "completed"`. Report: all features implemented.

**FAIL + rounds remain:**
```json
{
  "current_sprint": { "status": "revising", "round": <M> }
}
```

Create `sprints/sprint-<N>/iterations/round-<M+1>/` directory.
Report: which criteria failed. Prompt: "Run `/generator build <run-id>` to address feedback."

**FAIL + max rounds reached:**
```json
{
  "current_sprint": { "status": "failed" },
  "sprint_history": [..., { "verdict": "failed" }]
}
```

Report: max iterations reached. Recommend: skip this feature and continue, or escalate to human.

**REPLAN:**
Set `status → "failed"`. Report: Evaluator recommends replanning. Suggest `/planner` with refined requirements.

> **Note:** Evaluator's work ends at Step 4. Archiving (`active/` -> `completed/`) belongs to Harness Phase 3, not Evaluator.

## Required Quality Gates

### Contract Review

Reject a contract if any of these are missing or too vague:

- `Behavior Scenarios` before acceptance criteria, preserving the spec's intended behavior.
- A practical `TDD Decision` with evidence plan. TDD should be selected for core deterministic logic such as parsing, state transitions, permissions, validation, ranking, scheduling, protocol mapping, pricing/calculation rules, and data transformations. Skips are acceptable for documentation, prompt copy, mechanical wiring, simple styling, one-off configuration, or exploratory UI layout when the tradeoff is recorded.
- E2E/runtime final-behavior verification when a runnable user-visible surface exists, or a documented fallback when true E2E is impractical.
- Modularity/readability plan covering cohesive boundaries, oversized-file risk, coupling, useful comments, and tests-as-documentation.
- Human Checkpoint recommendation with local commands when manual validation will help the developer understand the sprint.

### Sprint Evaluation

Fail the sprint when:

- A behavior scenario has no test, E2E/runtime, or manual-observation evidence.
- A selected TDD path lacks RED/GREEN/REFACTOR evidence, or a skipped TDD path has a weak tradeoff for high-risk core logic.
- Runnable final behavior was not exercised through E2E/runtime verification.
- The implementation creates severe low cohesion, avoidable tight coupling, oversized files with mixed responsibilities, missing comments around non-obvious logic, or tests that do not explain core behavior.
- `build-log.md` omits the Human Checkpoint status and local validation instructions when a meaningful pause point exists.
