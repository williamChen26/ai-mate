# Exec Plans Index

This directory stores execution plans, completed run records, and technical debt notes.

## Directory

- [`active/`](active/README.md): harness runs and plans currently in progress.
- [`completed/`](completed/README.md): archived runs, evaluations, and post-completion fixes.
- [`quality-commands.md`](quality-commands.md): repository-specific validation commands.

## Plan Types

| Type | Shape | Use |
| --- | --- | --- |
| Harness run | `active/<run-id>/` directory | Sprint-based feature work started by `/harness` |
| Manual exec plan | `active/<name>.md` file | Complex cross-module work that needs a human-readable plan |
| Lightweight plan | PR description or commit message | Small local changes |

## Harness Run Structure

```text
Planner writes spec.md
       |
       v
while features remain:
       |
       +-- Generator picks one feature and writes contract.md
       |     +-- Behavior Scenarios before acceptance criteria
       |     +-- TDD Decision, E2E/runtime plan, modularity plan
       +-- Evaluator reviews scope, scenarios, testability, and checkpoints
       +-- Generator implements that sprint and writes build-log.md
       |     +-- Scenario evidence, TDD evidence/tradeoff, E2E/runtime result
       +-- Evaluator writes evaluation.md
       |     +-- FAIL: Generator revises, up to max rounds
       |     +-- PASS: Harness marks feature completed or pauses for manual validation
       |
       v
all features completed -> archive run
```

### Files

```text
active/<run-id>/
  meta.json
  spec.md
  sprints/
    sprint-1/
      contract.md
      contract-feedback.md
      build-log.md
      evaluation.md
      iterations/
        round-2/
          feedback.md
          changes.md
  hotfixes/
    hotfix-log.md
```

### meta.json Schema

```json
{
  "id": "2026-04-01-example-feature",
  "status": "planning | sprinting | completed | failed",
  "task": "Original user requirement",
  "created_at": "ISO",
  "updated_at": "ISO",
  "spec_features": [
    { "id": "F1", "name": "First feature", "status": "completed", "priority": "P0" },
    { "id": "F2", "name": "Second feature", "status": "pending", "priority": "P1" }
  ],
  "current_sprint": {
    "number": 2,
    "feature_id": "F2",
    "status": "contracting | approved | generating | evaluating | revising | passed | failed",
    "round": 1,
    "max_rounds": 3
  },
  "sprint_history": [
    {
      "number": 1,
      "feature_id": "F1",
      "rounds": 1,
      "verdict": "passed",
      "started": "ISO",
      "completed": "ISO"
    }
  ],
  "hotfixes": [
    {
      "id": "HF1",
      "affects_feature": "F1",
      "affects_sprint": 1,
      "title": "Short fix title",
      "date": "YYYY-MM-DD",
      "files": ["changed/file/path"]
    }
  ]
}
```

## State Machine

```text
PLANNING
  |
  v
SPRINTING
  |
  +-- CONTRACTING -> CONTRACT_REVIEW -> APPROVED
  |                                      |
  |                                      v
  |                                GENERATING -> EVALUATING
  |                                      ^          |
  |                                      |     +----+----+
  |                                      |    PASS     FAIL
  |                                      |     |        |
  |                                      +-----+-- REVISING
  |                                             |
  |                                      next sprint
  |
  v
COMPLETED / FAILED
```

## Files Are Memory

Each agent should be able to start from a clean context and reconstruct the run from files.

| Need | File |
| --- | --- |
| Overall blueprint | `spec.md` |
| Completed and pending features | `meta.json` |
| Current sprint scope | `sprints/sprint-N/contract.md` |
| Behavior scenarios | `spec.md`, `sprints/sprint-N/contract.md` |
| TDD tradeoff | `sprints/sprint-N/contract.md`, `sprints/sprint-N/build-log.md` |
| E2E/runtime evidence | `sprints/sprint-N/build-log.md`, `sprints/sprint-N/evaluation.md` |
| Human checkpoint instructions | `sprints/sprint-N/contract.md`, `sprints/sprint-N/build-log.md` |
| Previous implementation decisions | `sprints/sprint-{1..N-1}/build-log.md` |
| Revision feedback | `sprints/sprint-N/iterations/round-M/feedback.md` |

Every phase writes an artifact because that artifact is the next phase's input.

## Behavior-First Quality Lifecycle

Harness runs use a BDD -> selective TDD -> E2E/runtime verification flow:

1. **BDD scenarios first**: `spec.md` and `contract.md` describe behavior scenarios before acceptance criteria. Use Given/When/Then for user-visible behavior; for internal modules, state the precondition, operation, and observable result.
2. **Selective TDD**: `contract.md` records a `TDD Decision`. Use TDD for core deterministic logic such as parsing, state transitions, permissions, validation, ranking, scheduling, protocol mapping, pricing/calculation rules, and data transformations. TDD may be skipped for documentation, prompt copy, mechanical wiring, simple styling, one-off configuration, or exploratory UI layout when the tradeoff is recorded.
3. **E2E/runtime final behavior**: Runnable user-visible behavior needs E2E or runtime verification. Static review, typecheck, or build alone is not enough. If true E2E is impractical, the contract and build log must explain the fallback.
4. **Tests as documentation**: Focused tests should make important behavior understandable to a human developer, not just satisfy coverage.
5. **Modularity/readability gate**: Sprints should keep modules cohesive and low-coupled, avoid oversized files with mixed responsibilities, and add short comments around non-obvious algorithms, protocol behavior, or edge-case handling.
6. **Human Checkpoints**: The harness pauses at spec review, contract approval, runnable/manual-validation milestones, and completion when developer understanding matters. Build logs should include local commands and what to inspect.

## Hotfix Path

Use `/hotfix <run-id> <bug>` when a bug belongs to an archived harness run. Use `/hotfix <bug>` for small standalone fixes.

| Mode | Main record | Supporting records |
| --- | --- | --- |
| Run-linked hotfix | `completed/<run-id>/hotfixes/hotfix-log.md` | `meta.json`, affected `build-log.md`, `history.log`, `README.md` |
| Standalone fix | `completed/standalone-fixes.md` | `history.log` |

If a fix touches more than five files or changes architecture, start a new `/harness` run instead.

## Manual Plan Template

Manual execution plans should include:

1. Background and goal
2. Scope and non-goals
3. Implementation steps
4. Risks and rollback
5. Verification
6. Decision log
