# Contract Review: Sprint 3

## Verdict: APPROVED

The Sprint 3 contract is well-scoped to F3: AI Drop Completion Proposal Surface and is ready for implementation. It includes behavior scenarios before acceptance criteria, a practical TDD decision, runtime/E2E verification, modularity/readability guidance, and a human checkpoint.

## Checklist

- **Scope**: PASS. The contract covers only the minimal AI Drop completion proposal surface from F3, matching the spec's F3 description of a translucent preview accepted with `Tab` through a controlled canvas/collaboration path (`spec.md:119-150`, `contract.md:6-13`). It explicitly excludes broad AI Edit, hidden autonomous mutation, F4 conversation UI, F5 dashboards, real provider work, and durable storage (`contract.md:15-23`).
- **Behavior scenarios**: PASS. `Behavior Scenarios` appear before acceptance criteria (`contract.md:25-67`) and cover text preview, flow preview, `Tab` acceptance, stale/mismatched refusal, cancellation, and malformed/unsupported output refusal.
- **Acceptance criteria**: PASS. Criteria are independently testable with focused unit/component tests, E2E/runtime observation, and code review where appropriate (`contract.md:67-78`). They cover proposal state, preview-only representation, existing Sprint 2 candidate types, narrow activation, controlled `Tab` apply, refusal cases, cleanup, minimal UI scope, and concise Chinese comments.
- **TDD Decision**: PASS. The contract selects TDD because this sprint adds deterministic state transitions, freshness/selection validation, keyboard acceptance, and apply-boundary behavior (`contract.md:82-92`). The RED/GREEN/REFACTOR evidence plan is concrete and suitable for the risk profile.
- **Dependencies**: PASS. Sprint 1 and Sprint 2 are completed and passed in run metadata (`meta.json:46-58`), and the contract depends on those completed gateway and `completion-proposal` contracts (`contract.md:128-132`).
- **Out of scope**: PASS. The out-of-scope list is explicit and protects the requested boundaries: no broad AI Edit, no autonomous hidden canvas mutation, no F4 conversation surface, no full F5 diagnostics, and no new broad server redesign (`contract.md:15-23`).
- **Completeness**: PASS. The contract covers all F3 spec requirements: translucent text/flow preview, no authoritative mutation before acceptance, `Tab` apply through controlled path, stale/irrelevant clearing, and non-blocking normal editing (`spec.md:123-150`, `contract.md:25-78`).
- **Quality commands**: PASS. The contract names relevant web unit, web E2E, and full `pnpm check` gates (`contract.md:94-100`), aligning with repository quality commands for web unit/E2E and root handoff (`quality-commands.md:10`, `quality-commands.md:22-25`, `quality-commands.md:47-50`).
- **Runtime verifiability**: PASS. Verification is not static-only: the contract requires web E2E that opens a room, activates a deterministic `completion-proposal`, observes preview before acceptance, presses `Tab`, and observes the accepted result (`contract.md:94-100`).
- **E2E/runtime final behavior plan**: PASS. The E2E plan exercises the user-visible final behavior and includes a fallback that still spawns the app through the web E2E command and verifies preview lifecycle plus `Tab` handling if direct editor-store assertions are impractical (`contract.md:97-100`).
- **Modularity/readability plan**: PASS. The contract requires separate proposal validation/lifecycle, rendering, and tldraw apply wiring; it names the controlled apply boundary as the only mutation point and requires tests that document refusal behavior (`contract.md:102-108`).
- **Human checkpoint**: PASS. The contract says to pause after Sprint 3, lists local commands, and names concrete behaviors to inspect manually, including preview translucency, no mutation before `Tab`, controlled apply, stale/mismatch refusal, and no raw mate/conversation redesign (`contract.md:110-123`).

## Focus Areas Confirmed

- Logic-first, UI-minimal scope is explicit (`contract.md:9-13`, `contract.md:77`).
- No broad AI Edit or hidden autonomous canvas mutation is explicitly excluded (`contract.md:15-18`, `contract.md:74`).
- Sprint 2 `completion-proposal` data reuse is required, and parallel output protocols are forbidden (`contract.md:7`, `contract.md:11`, `contract.md:70-73`, `contract.md:105`).
- Preview is not authoritative before `Tab`; persisted canvas shape count/content must remain unchanged before acceptance (`contract.md:9`, `contract.md:31`, `contract.md:39`, `contract.md:71`).
- `Tab` acceptance is constrained to an active fresh proposal and must pass through an explicit controlled apply boundary (`contract.md:41-46`, `contract.md:74`, `contract.md:104`, `contract.md:125-126`).
- Stale, selection-mismatched, context-mismatched, malformed, unsupported, and no-active-proposal cases must be refused without mutation (`contract.md:48-65`, `contract.md:75-76`).
- Concise Chinese comments are required only where useful around non-obvious proposal validation, freshness checks, and acceptance boundaries (`contract.md:78`, `contract.md:108`).

## Required Generator Attention

During implementation, keep the E2E proof meaningful: the preview-before-`Tab` assertion must demonstrate that real canvas state is unchanged, and the post-`Tab` assertion must demonstrate that mutation occurs only after the controlled apply boundary accepts the fresh active proposal.
