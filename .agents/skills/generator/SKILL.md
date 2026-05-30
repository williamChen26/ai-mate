---
name: generator
description: "Generator agent skill: propose sprint contracts or implement sprint features. Operates within the ralph loop under orchestrator control."
user_invocable: true
---

# /generator — Sprint Generator

Operates in two modes: **contract proposal** or **implementation**.

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
- Instruction to write `sprints/sprint-<N>/contract.md`

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
- Instruction to: write tests first → implement → self-evaluate → write `build-log.md`

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

Show build summary from `build-log.md`. Prompt: "Run `/evaluator sprint <run-id>` to evaluate."
