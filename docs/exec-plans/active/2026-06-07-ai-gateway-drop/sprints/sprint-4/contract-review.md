# Contract Review: Sprint 4 — Conversation Gateway Agent Path

## Verdict: APPROVED

The Sprint 4 contract is approved for implementation. It is scoped to F4, keeps the conversation gateway separate from AI Drop preview and `Tab` acceptance, reuses the Sprint 1 AI Gateway and Sprint 2 agent turn concepts, and includes concrete validation, TDD, modularity, Chinese-comment, and human-checkpoint requirements.

## Evidence

- **Scope and out-of-scope are clear**: `contract.md:6-17` limits the sprint to refining the raw Mate message panel into a minimal direct conversation gateway and explicitly excludes AI Edit, AI Drop preview/`Tab` changes, provider integration, broad UX polish, and F5 diagnostics dashboard expansion.
- **BDD appears before acceptance criteria**: `contract.md:19-56` defines behavior scenarios before `Acceptance Criteria` begins at `contract.md:58`.
- **Scenarios match F4 behavior**: The scenarios cover message routing, pending state, non-mutating answer rendering, canvas-context references, stale/incomplete context display, separation from AI Drop/Tab acceptance, and raw diagnostics inspectability (`contract.md:19-56`), matching the F4 scenarios in `spec.md`.
- **Acceptance criteria are testable**: AC-4.1 through AC-4.9 each name observable behavior and a verification method (`contract.md:58-69`), including unit, server, E2E, and code-review checks where appropriate.
- **Dependencies are satisfied**: `meta.json:8-24` marks F1, F2, and F3 completed, while `meta.json:39-44` shows Sprint 4 is the current contracting sprint for F4. The contract lists those same dependencies at `contract.md:123-127`.
- **TDD decision is appropriate**: `contract.md:73-83` selects TDD for deterministic classification, state transitions, response-shape validation, and conversation/AI Drop separation, with explicit RED/GREEN/REFACTOR evidence planned.
- **Runtime and E2E verification are required**: `contract.md:85-92` requires web unit tests, conditional server tests, web E2E proving a room message reaches the agent and renders without AI Drop activation or canvas mutation, and `pnpm check` before handoff. This aligns with repository quality guidance that `pnpm check` is the default gate and runnable behavior needs E2E/runtime evidence (`docs/exec-plans/quality-commands.md:47-60`).
- **Validation commands are repository-aligned**: The named commands match the documented commands in `docs/exec-plans/quality-commands.md:10`, `docs/exec-plans/quality-commands.md:18`, `docs/exec-plans/quality-commands.md:22`, and `docs/exec-plans/quality-commands.md:25`.
- **Modularity/readability plan is concrete**: `contract.md:94-102` requires reuse of shared output/gateway contracts, a small web-side conversation adapter, minimal `canvas-shell.tsx` changes, no calls into AI Drop runtime, immutable state transitions, and tests as documentation.
- **Chinese comments requirement is explicit**: AC-4.9 requires concise Chinese comments for new or changed non-obvious modules/functions (`contract.md:69`), and the modularity plan specifies where those comments are expected (`contract.md:101`).
- **Human checkpoint is useful**: `contract.md:104-118` instructs the Generator to pause after Sprint 4, lists exact local commands, and names the behavior to inspect manually, including conversation response states, raw metadata, stale/incomplete visibility, and Sprint 3 AI Drop separation.
- **Separation from AI Drop and Tab acceptance is preserved**: The scope, scenarios, acceptance criteria, modularity plan, and checkpoint all independently require that conversation responses do not create `ai-drop-preview`, do not call `window.__PSG_AI_DROP__`, do not arm `Tab`, and do not mutate canvas state by default (`contract.md:9`, `contract.md:46-50`, `contract.md:63-68`, `contract.md:98`, `contract.md:117-118`).

## Non-Blocking Notes

- If implementation touches shared contracts or mate code, the Generator should run and record the related shared/mate commands in addition to the required focused web/server checks and `pnpm check`.
- The stale/incomplete E2E fallback in `contract.md:92` is acceptable because the contract still requires normal conversation behavior to be proven through E2E and stale/incomplete classification to be covered by a focused executable fixture if browser setup is brittle.
