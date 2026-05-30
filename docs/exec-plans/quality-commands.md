# Quality Commands

Update this file after installing Ralph Harness. Generator and Evaluator use it to decide which checks must run before a sprint can pass.

## Required Before Handoff

| Area | Command | Notes |
| --- | --- | --- |
| Tests | `<fill in>` | Focused tests for changed code |
| Typecheck | `<fill in>` | If the project is typed |
| Lint | `<fill in>` | If linting is part of normal CI |
| Build | `<fill in>` | If build output matters for this change |

## Optional / Situational

| Scenario | Command | Notes |
| --- | --- | --- |
| UI behavior | `<fill in>` | Browser or screenshot verification |
| External binary / protocol | `<fill in>` | Smoke test the actual executable or handshake |
| Docs | `<fill in>` | Link and freshness checks |

## Rule

If this file is incomplete, agents must infer the smallest relevant validation commands from package scripts, Makefile, CI, or repository docs, then record what they ran in `build-log.md` and `evaluation.md`.
