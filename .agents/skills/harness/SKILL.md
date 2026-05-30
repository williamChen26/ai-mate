---
name: harness
description: "End-to-end orchestrator: takes a user requirement, runs the full Planner -> Generator -> Evaluator Ralph loop with sprint-based execution, contract negotiation, and quality gates."
user_invocable: true
---

# /harness - Ralph Loop Orchestrator

You are the **orchestrator** of a harness-engineered multi-agent system. You coordinate three agents - Planner, Generator, and Evaluator - through a sprint-based Ralph loop.

## Core Loop

```python
spec = Planner(user_requirement)

while spec_has_unfinished_features:
    contract = Generator.propose_contract(spec, completed_features)
    Evaluator.review_contract(contract)

    Generator.implement(contract)
    verdict = Evaluator.evaluate(implementation)

    if verdict == FAIL:
        for round in range(max_rounds):
            Generator.revise(feedback)
            verdict = Evaluator.evaluate(revision)
            if verdict == PASS:
                break

    update_state(feature -> completed)
```

## Design Principles

1. **One feature slice at a time** - Generator does not implement the whole spec at once.
2. **Contract first** - Each sprint starts with an explicit contract that Evaluator approves before implementation.
3. **Files are memory** - Every phase writes artifacts under `docs/exec-plans/` so the next agent can recover state after context resets.
4. **Hard quality gate** - One failed acceptance criterion fails the entire sprint.
5. **Progressive disclosure** - Each agent reads only the files needed for its phase.

## Full Orchestration Protocol

### Phase 1: Plan

**Input**: User requirement, ideally 1-4 sentences.
**Output**: `spec.md` and `meta.json`.

1. Create run directory: `docs/exec-plans/active/<YYYY-MM-DD-slug>/`.
2. Write initial `meta.json` with `status: "planning"`.
3. Spawn **Planner** with the strongest available planning model and provide:
   - User requirement
   - `ARCHITECTURE.md`, `AGENTS.md`, and relevant project/product/design references that exist
   - Run directory path
   - Instruction to write `spec.md`
4. Extract the feature list from `spec.md` and populate `meta.json.spec_features`.
5. Update run status to `"sprinting"`.
6. Human checkpoint: present the spec summary and feature list before starting the sprint loop.

### Phase 2: Sprint Loop

For each pending feature in `spec_features`:

#### 2a. Contract Negotiation

1. Spawn **Generator** in contract mode with:
   - `spec.md`
   - `meta.json`
   - Previous sprints' `build-log.md` files, if any
   - Instruction to write `sprints/sprint-<N>/contract.md`
2. Update `current_sprint.status` to `"contracting"`.
3. Spawn **Evaluator** in contract review mode with:
   - `contract.md`
   - `spec.md`
   - `meta.json`
4. Process verdict:
   - **APPROVED**: update `current_sprint.status` to `"approved"` and proceed to implementation.
   - **REVISE**: write `contract-feedback.md`, ask Generator to revise, then resubmit.

#### 2b. Implementation

1. Spawn **Generator** in implementation mode with:
   - `contract.md`
   - `ARCHITECTURE.md`, if present
   - Relevant code and repository docs
   - For round 2+: `evaluation.md` and `feedback.md` from the previous round
   - Instruction to write tests first, implement, run quality commands, and write `build-log.md`
2. Update `current_sprint.status` to `"generating"`.
3. After Generator completes, update `current_sprint.status` to `"evaluating"`.

#### 2c. Evaluation

1. Spawn **Evaluator** in evaluation mode with:
   - `contract.md` as the grading rubric
   - `build-log.md` as a claim to cross-check
   - Actual changed files
   - Repository quality commands and test output
   - Instruction to write `evaluation.md`; if FAIL, also write `iterations/round-M/feedback.md`
2. File gate: verify `sprints/sprint-<N>/evaluation.md` exists. If it is missing, re-spawn Evaluator with an explicit instruction to write it. An evaluation without this file is invalid.
3. Process verdict:
   - **PASS**: mark the feature completed in `meta.json` and proceed to the next feature.
   - **FAIL + rounds remain**: update status to `"revising"` and loop back to implementation.
   - **FAIL + max rounds reached**: mark sprint failed and escalate to the human for skip, replan, or manual intervention.
   - **REPLAN**: set run status to `"failed"` and recommend a new planning pass.

### Phase 3: Completion

When all features in `spec_features` are `"completed"`:

1. Set `meta.json.status` to `"completed"` and `current_sprint` to `null`.
2. Archive the run by moving:
   `docs/exec-plans/active/<run-id>/` -> `docs/exec-plans/completed/<run-id>/`
3. Append one summary line to `docs/exec-plans/completed/history.log`:
   `<run-id> | <feature-count> features | <total-sprints> sprints | <total-rounds> rounds | <date>`
4. Update `docs/exec-plans/active/README.md` if it lists active runs.
5. Report final summary to the user.

Important: archiving happens only in Phase 3. Evaluator does not archive runs.

## Agent Isolation

| Agent | Reads | Writes | Model |
| --- | --- | --- | --- |
| Planner | Requirements, architecture, project/product/design references | `spec.md` | Strong planning model |
| Generator (contract) | `spec.md`, `meta.json`, previous build logs | `contract.md` | Preferred coding model |
| Generator (implementation) | `contract.md`, architecture, code, feedback | Code, tests, `build-log.md` | Preferred coding model |
| Evaluator (contract) | `contract.md`, `spec.md`, `meta.json` | Contract verdict and feedback | Strong review model |
| Evaluator (sprint) | `contract.md`, `build-log.md`, code, tests | `evaluation.md`, `feedback.md` | Strong review model |

Isolation rules:

- No agent reads another agent's system prompt.
- Generator does not see Evaluator's hidden instructions.
- Evaluator never modifies implementation code.
- Planner does not inspect implementation code.

## State Tracking

Each phase transition updates `meta.json`. This provides:

- **Context reset**: agents rebuild state from files.
- **Recovery**: interrupted runs resume from recorded state.
- **Observability**: humans can inspect any phase.
- **Audit trail**: phase, timestamp, verdict, and evidence stay in the repo.

## Error Recovery

| Scenario | Handling |
| --- | --- |
| Agent did not produce a required file | Retry once, then escalate to the human |
| Contract review rejected | Generator revises the contract and resubmits |
| Sprint implementation failed evaluation | Generator revises, up to `max_rounds` |
| Max rounds reached | Escalate for skip, replan, or manual intervention |
| Evaluator recommends REPLAN | Return to planning with refined requirements |
| Run interrupted | Resume from `meta.json` |

## Usage

```text
/harness <requirement in 1-4 sentences>
```

Example:

```text
/harness Build an RSS reader with OPML import, feed subscription management, and an immersive article reading view.
```

The orchestrator will:

1. Create a run, invoke Planner, and present the spec.
2. For each feature: contract -> implement -> evaluate -> revise or pass.
3. Archive the completed run with a full audit trail.
