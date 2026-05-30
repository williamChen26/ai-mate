# Build Log: Sprint 1 - BDD/TDD/E2E Harness Quality Lifecycle

## Round 1

### What Was Built

- `.agents/agents/planner.md`: added BDD-first planning requirements, behavior-scenario template, and human-comprehension sprint slicing guidance.
- `.agents/agents/generator.md`: added behavior-first contract structure, selective TDD policy, RED/GREEN/REFACTOR evidence, E2E/runtime verification, modularity/readability notes, and Human Checkpoint fields.
- `.agents/agents/evaluator.md`: added contract and sprint quality gates for behavior scenarios, selective TDD, E2E/runtime behavior, modularity/readability, and checkpoint readiness.
- `.agents/skills/harness/SKILL.md`: upgraded the orchestration loop with BDD-first planning, selective TDD, E2E/runtime verification, readable increments, and human pause points.
- `.agents/skills/planner/SKILL.md`: requires specs to include `Behavior Scenarios` before acceptance criteria and treats planner report as a Human Checkpoint.
- `.agents/skills/generator/SKILL.md`: requires contract/build-log sections for BDD, TDD Decision, E2E/runtime, modularity/readability, and Human Checkpoint evidence.
- `.agents/skills/evaluator/SKILL.md`: documents required quality gates for contract review and sprint evaluation.
- `.claude/**` and `.cursor/**`: mirrored the updated skill and agent instructions. Cursor agent frontmatter was preserved.
- `.codex/agents/*.toml`: regenerated Codex agent `developer_instructions` from the updated `.agents/agents/*.md` sources.
- `docs/exec-plans/index.md`: documented the BDD -> selective TDD -> E2E/runtime lifecycle, tests-as-documentation, modularity/readability gate, and Human Checkpoints.
- `docs/exec-plans/quality-commands.md`: added lifecycle validation rules for future sprints.
- `AGENTS.md`: added repository operating principles for behavior scenarios, selective TDD, E2E/runtime checks, modularity/readability, and manual-validation pauses.

### Acceptance Criteria Status

| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-1.1 | Planner specs and generator contracts require `Behavior Scenarios` before acceptance criteria. | PASS | `rg "Behavior Scenarios" .agents .claude .cursor .codex docs/exec-plans`: PASS |
| AC-1.2 | Generator contract/build-log instructions include selective `TDD Decision` guidance with RED/GREEN/REFACTOR evidence. | PASS | `rg "TDD Decision|RED|GREEN|REFACTOR" .agents .claude .cursor .codex docs/exec-plans`: PASS |
| AC-1.3 | Generator and Evaluator require E2E or runtime verification for runnable final behavior. | PASS | `rg "E2E|runtime verification|runnable" .agents .claude .cursor .codex docs/exec-plans`: PASS |
| AC-1.4 | Generator and Evaluator include modularity/readability gates. | PASS | `rg "cohesive|coupling|oversized|comments|tests as documentation|tests-as-documentation" .agents .claude .cursor .codex docs/exec-plans`: PASS |
| AC-1.5 | Harness orchestration includes human checkpoints for review, approval, manual validation, and completion. | PASS | `rg "Human Checkpoint|manual validation|pause" .agents .claude .cursor docs/exec-plans AGENTS.md`: PASS |
| AC-1.6 | Mirrored prompt surfaces stay consistent and exec-plan docs describe the lifecycle. | PASS | `diff -q` checks for `.agents` vs `.claude`/`.cursor` skills and `.agents` vs `.claude` agents: PASS. Node comparison of `.agents` bodies against `.cursor` bodies and `.codex` TOML instructions: PASS. TOML parse check: PASS. |

### Behavior Scenario Evidence

- Scenario 1, behavior-first planning: verified by planner prompt updates and `rg "Behavior Scenarios" ...`.
- Scenario 2, selective TDD tradeoff: verified by generator/evaluator prompt updates and `rg "TDD Decision|RED|GREEN|REFACTOR" ...`.
- Scenario 3, runnable behavior checkpoint: verified by harness/generator/evaluator checkpoint wording and `rg "Human Checkpoint|manual validation|pause" ...`.
- Scenario 4, readable AI implementation: verified by generator/evaluator modularity/readability gates and `rg "cohesive|coupling|oversized|comments|tests as documentation|tests-as-documentation" ...`.

### TDD Decision & Evidence

Use TDD: No

Rationale:
This sprint is a prompt/documentation architecture change, not core deterministic runtime logic. Strict RED/GREEN/REFACTOR would be artificial here. The focused validation is contract-driven text coverage, mirror consistency, and TOML parseability.

Focused validation:
- Keyword coverage checks with `rg`.
- Mirror consistency checks with `diff -q` and a Node body comparison.
- `.codex/agents/*.toml` parse check with Python `tomllib`.

### E2E / Runtime Verification

No product runtime surface exists in this repository for this docs/prompt-only sprint. The runtime substitute was parsing `.codex/agents/*.toml` with `tomllib` and verifying the mirrored agent bodies programmatically.

### Modularity & Readability Notes

The change keeps the harness policy split by responsibility:

- Planner owns behavior-first specs.
- Generator owns contract/build-log structure, selective TDD, implementation readability, and checkpoint instructions.
- Evaluator owns quality gates and independent evidence.
- Harness owns orchestration timing and pause points.
- Exec-plan docs explain the lifecycle for humans without requiring prompt-file spelunking.

No product code was created or enlarged. The only generated TOML content is a mechanical mirror of the updated agent Markdown.

### Human Checkpoint

Pause here for review. This sprint has no app to launch, but the developer can inspect:

- `docs/exec-plans/index.md` for the new lifecycle.
- `.agents/agents/generator.md` for the selective TDD rules.
- `.agents/agents/evaluator.md` for the new quality gates.
- `.agents/skills/harness/SKILL.md` for the pause/checkpoint orchestration.

Recommended local checks:

- `python -c 'import pathlib,tomllib; [tomllib.loads(p.read_text()) for p in pathlib.Path(".codex/agents").glob("*.toml")]; print("toml ok")'`
- `rg "Behavior Scenarios|TDD Decision|Human Checkpoint" .agents docs/exec-plans AGENTS.md`

### Decisions Made

- Kept TDD selective instead of mandatory, with explicit examples for apply/skip decisions.
- Used "avoid oversized low-cohesion files without justification" rather than a hard line-count limit so the policy can fit different stacks.
- Preserved Cursor agent frontmatter while keeping the instruction body identical to `.agents`.
- Mirrored Codex TOML from `.agents` Markdown to reduce future prompt drift.

### Quality Command Results

- `rg "Behavior Scenarios" .agents .claude .cursor .codex docs/exec-plans`: PASS
- `rg "TDD Decision|RED|GREEN|REFACTOR" .agents .claude .cursor .codex docs/exec-plans`: PASS
- `rg "E2E|runtime verification|runnable" .agents .claude .cursor .codex docs/exec-plans`: PASS
- `rg "cohesive|coupling|oversized|comments|tests as documentation|tests-as-documentation" .agents .claude .cursor .codex docs/exec-plans`: PASS
- `rg "Human Checkpoint|manual validation|pause" .agents .claude .cursor docs/exec-plans AGENTS.md`: PASS
- `python -c 'import pathlib,tomllib; [tomllib.loads(p.read_text()) for p in pathlib.Path(".codex/agents").glob("*.toml")]; print("toml ok")'`: PASS
- Mirror checks with `diff -q` and Node body comparison: PASS

### Known Issues

- This workspace is not a git repository, so no `git diff` or commit-oriented validation was available.
- `.codex/agents/*.toml` required escalated permission to update because the sandbox denied the initial write.

### Test Results

No unit tests exist for this prompt-only repository. Focused validation commands all passed.
