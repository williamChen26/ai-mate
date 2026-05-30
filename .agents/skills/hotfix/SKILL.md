---
name: hotfix
description: "Lightweight bug-fix workflow for small post-run or standalone defects. Fixes code directly, runs validation, and records lessons without starting a full harness run."
user_invocable: true
---

# /hotfix - Lightweight Bug Fix

Use `/hotfix` for small, bounded bug fixes that do not need the full Planner -> Generator -> Evaluator loop. It supports two modes:

- **Run-linked mode**: fix a bug associated with an archived harness run.
- **Standalone mode**: fix a small bug that is not tied to a harness run.

## Usage

```text
/hotfix <run-id> <bug description>
/hotfix <bug description>
```

Examples:

```text
/hotfix 2026-04-08-provider-settings "Selecting a provider hangs during initialization"
/hotfix "The reader blanks out after scrolling to the bottom"
```

## When To Use

- A completed harness run has a small bug discovered during manual testing or real use.
- A bug is caused by implementation error, dependency behavior, or a missed edge case.
- The fix is bounded to roughly 1-5 files.
- The task is a bug fix, not a new feature.

## When Not To Use

- The issue requires a major architecture change.
- The issue requires a new data model or broad API redesign.
- The bug reveals that the original spec was wrong.
- The bug is found inside an active harness run; use the normal Evaluator feedback loop.
- The request is actually a feature; use `/harness`.

## Mode Detection

Parse the user input:

- If the first argument matches `docs/exec-plans/completed/<run-id>/`, use run-linked mode.
- Otherwise, use standalone mode.

## Run-Linked Mode

### Step 1: Locate Run

1. Find `docs/exec-plans/completed/<run-id>/`.
2. Read `meta.json` and confirm `status: "completed"`.
3. Read `spec.md` to understand the original feature definitions.

### Step 2: Diagnose

1. Reproduce or clearly understand the reported behavior.
2. Identify the affected feature ID and sprint number.
3. Read that sprint's `contract.md` and `build-log.md`.
4. Determine the root cause:
   - Generator implementation error
   - Evaluator missed case
   - Ambiguous or incomplete spec
   - External dependency or environment change

### Step 3: Fix

1. Make the smallest code change that fixes the bug.
2. Run the repository's relevant quality commands from `docs/exec-plans/quality-commands.md`, package scripts, Makefile, CI, or docs.
3. Run focused regression tests when they exist.

### Step 4: Scope Check

- **1-3 changed files**: continue.
- **4-5 changed files**: continue, but mark it as a boundary hotfix.
- **More than 5 changed files**: abort and recommend a new `/harness` run.

### Step 5: Write Records

Perform all record updates so future agents can learn from the fix.

#### 5a. Create Or Append Hotfix Log

Create or append `docs/exec-plans/completed/<run-id>/hotfixes/hotfix-log.md`:

```markdown
## HF<N>: <title> (affects <feature-id> / Sprint <sprint-number>)

### Symptom
<What the user observed>

### Root Cause
<Why the original implementation was wrong and why it was not caught>

### Fix

| File | Change |
| --- | --- |
| `<path>` | <one-line description> |

### Lesson
<Rule, checklist item, or test strategy future agents should remember>
```

#### 5b. Update meta.json

Append a `hotfixes` entry:

```json
{
  "hotfixes": [
    {
      "id": "HF<N>",
      "affects_feature": "<feature-id>",
      "affects_sprint": "<sprint-number>",
      "title": "<one-line title>",
      "date": "<YYYY-MM-DD>",
      "files": ["<changed file paths>"]
    }
  ]
}
```

Update `updated_at`.

#### 5c. Update Affected Build Log

Append to `sprints/sprint-<N>/build-log.md`:

```markdown
## Errata (HF<N> - Post-Sprint Hotfix)

**Issue**: <one-line description>
**Fix**: <one-line fix description>

See [`hotfixes/hotfix-log.md`](../../hotfixes/hotfix-log.md).
```

#### 5d. Update history.log

Append hotfix information to the matching run line in `docs/exec-plans/completed/history.log`:

```text
| +<N> hotfixes (<brief>)
```

#### 5e. Update completed/README.md

If completed runs are listed there, update the run entry with the hotfix count.

### Step 6: Report

Tell the user:

1. What was fixed.
2. Which files changed.
3. Root cause classification.
4. Which record files were updated.
5. Any rule or checklist improvement worth promoting.

## Standalone Mode

### Step 1: Diagnose

1. Understand the bug behavior.
2. Locate the related module and files.
3. Identify the root cause.

### Step 2: Fix

1. Make the smallest code change that fixes the bug.
2. Run the repository's relevant quality commands from `docs/exec-plans/quality-commands.md`, package scripts, Makefile, CI, or docs.
3. Run focused regression tests when they exist.

### Step 3: Scope Check

- **1-3 changed files**: continue.
- **4-5 changed files**: continue, but mark it as a boundary fix.
- **More than 5 changed files**: abort and recommend a new `/harness` run.

### Step 4: Write Records

#### 4a. Create Or Append Standalone Fix Log

Write to `docs/exec-plans/completed/standalone-fixes.md`:

```markdown
## SF-<YYYY-MM-DD>-<N>: <title>

- **Date**: <YYYY-MM-DD>
- **Affected module**: <module or component name>
- **Files**: `<path1>`, `<path2>`

### Symptom
<Bug behavior>

### Root Cause
<Why it happened>

### Fix
<One-sentence description>

### Lesson
<Rule, checklist item, or test strategy future agents should remember>
```

#### 4b. Update history.log

Append a standalone line to `docs/exec-plans/completed/history.log`:

```text
SF-<YYYY-MM-DD>-<N> | standalone fix | <title> | <YYYY-MM-DD>
```

### Step 5: Report

Tell the user:

1. What was fixed.
2. Which files changed.
3. Root cause.
4. Which record files were updated.

## Relationship To Other Skills

| Scenario | Use |
| --- | --- |
| New feature development | `/harness` |
| Bug inside an active run | Normal `/evaluator sprint` feedback loop |
| Small bug in a completed run | `/hotfix <run-id> <bug>` |
| Small unrelated bug | `/hotfix <bug>` |
| Major defect or broad change | New `/harness` run |
| Spec design problem | `/planner` |

## Anti-Patterns

1. **Silent fix**: changing code without writing records.
2. **Scope creep**: adding a feature while fixing a bug.
3. **Skipped validation**: not running relevant quality commands.
4. **Blame without learning**: saying the bug was missed without improving future checks.
5. **Wrong tool**: using `/hotfix` for feature work or broad rewrites.
