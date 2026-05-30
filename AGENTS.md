# AGENTS

This repository uses Ralph Harness for agent-first work.

## Start Here

- Read `README.md` for the project goal.
- Read `ARCHITECTURE.md` if it exists.
- Read `docs/exec-plans/active/` before starting complex work.
- Read `docs/exec-plans/quality-commands.md` before handing work off for review.

## Harness Commands

| Command | Purpose |
| --- | --- |
| `/harness <requirement>` | Full Planner -> Generator -> Evaluator loop |
| `/planner <requirement>` | Create only the product/technical spec |
| `/generator contract <run-id>` | Propose the next sprint contract |
| `/generator build <run-id>` | Implement the approved sprint |
| `/evaluator contract <run-id>` | Review a sprint contract |
| `/evaluator sprint <run-id>` | Evaluate sprint implementation |
| `/hotfix [run-id] <bug>` | Fix a small bug and record the lesson |

## Operating Principles

1. Put important context in repository files, not only in chat.
2. Keep work sliced into small, verifiable sprints.
3. Treat `docs/exec-plans/` as the memory and audit log.
4. Do not start implementation until the sprint contract is approved.
5. A single failed acceptance criterion fails the sprint.
6. Preserve user changes you did not make.
7. Write BDD behavior scenarios before acceptance criteria in specs and sprint contracts.
8. Use TDD selectively for core deterministic logic, and record the tradeoff when strict TDD is skipped.
9. Verify final runnable behavior with E2E or runtime checks whenever practical.
10. Keep implementations modular, cohesive, low-coupled, and readable; tests should help explain AI-generated behavior.
11. Pause at meaningful manual-validation milestones with local commands and what the developer should inspect.

## Repository Map

- `docs/exec-plans/active/`: current harness runs.
- `docs/exec-plans/completed/`: archived runs and hotfix records.
- `docs/exec-plans/index.md`: run structure and state machine.
- `docs/exec-plans/quality-commands.md`: validation commands for this repo.
