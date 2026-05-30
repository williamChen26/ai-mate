---
name: planner
description: "Expand a user requirement into a structured product spec (big picture blueprint) with feature list, priorities, and acceptance criteria. Creates a new harness run."
user_invocable: true
---

# /planner — Harness Planner

Expand a user requirement into a big picture spec that Generator and Evaluator will execute sprint by sprint.

## Protocol

### Step 1: Create Run Directory

Generate run ID: `YYYY-MM-DD-<slug>` (2-3 word kebab-case summary).

Create: `docs/exec-plans/active/<run-id>/`

Write `meta.json`:
```json
{
  "id": "<run-id>",
  "status": "planning",
  "task": "<original user requirement>",
  "created_at": "<ISO>",
  "updated_at": "<ISO>",
  "spec_features": [],
  "current_sprint": null,
  "sprint_history": []
}
```

### Step 2: Gather Context (Progressive Disclosure)

Read ONLY the available project orientation files:
1. `ARCHITECTURE.md`
2. `AGENTS.md` or equivalent contributor guidance
3. `docs/design-docs/core-beliefs.md`, `docs/product-specs/`, or equivalent product/design references if present
4. User's requirement text

Do NOT read: code, tests, build artifacts.

### Step 3: Invoke Planner Agent

Spawn Planner agent with the strongest available planning model, with:
- Agent instructions from `.claude/agents/planner.md`
- Gathered context
- Run directory path
- Instruction to write `spec.md`

### Step 4: Extract Feature List

After Planner completes, read `spec.md` and populate `meta.json.spec_features`:
```json
{
  "spec_features": [
    { "id": "F1", "name": "<feature name>", "status": "pending", "priority": "P0" },
    { "id": "F2", "name": "<feature name>", "status": "pending", "priority": "P0" }
  ]
}
```

### Step 5: Update Meta

Set `status → "sprinting"`, `updated_at`.

### Step 6: Report

Tell the user:
- Run ID and directory path
- Plan summary
- Feature list with priorities
- Suggested sprint order
- Open questions

Prompt: "Run `/harness <run-id>` to start sprinting, or review the spec first at `docs/exec-plans/active/<run-id>/spec.md`"
