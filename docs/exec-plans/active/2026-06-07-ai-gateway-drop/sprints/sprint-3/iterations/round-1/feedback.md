# Feedback: Sprint 3 Round 1

## Must Fix (blocks approval)
1. Missing TDD evidence — `implementation.md` must document RED/GREEN/REFACTOR evidence because the approved contract selected TDD for the proposal state and apply-boundary logic. (TDD Decision quality gate)
2. Missing human checkpoint — `implementation.md` must tell the developer to pause and include concrete manual inspection steps for the AI Drop preview, pre-`Tab` non-mutation, `Tab` acceptance, stale refusal, and unchanged raw Mate surface. (Human Checkpoint quality gate)

## Should Fix (won't block but noted)
1. Add or rename focused tests for context-mismatch, no-active `Tab`, and target-text-changed cleanup to make AC-3.6 and AC-3.7 easier to audit in later rounds.

## Won't Fix (acceptable tradeoffs)
1. Flow continuation uses the same minimal DOM overlay and creates a text shape on acceptance; this is acceptable for Sprint 3’s logic-first proof of the controlled boundary.
