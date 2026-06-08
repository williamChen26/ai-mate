# Feedback: Sprint 2 Round 2

## Must Fix (blocks approval)
1. No-op/refusal completion decision evidence drops ordered operation facts. The inspect/navigate branch should include the ordered `operation:<index>:...` facts from the bounded gateway stack in `agentTurn.decision.evidence.recentOperations`, not only the aggregate `selection-or-viewport-only` label. Add a focused test asserting the ordered facts are present for the misleading-selection or bounded-stack no-op case. (AC-2.2)

## Should Fix (won't block but noted)
1. None.

## Won't Fix (acceptable tradeoffs)
1. True browser E2E for AI Drop preview remains out of scope for Sprint 2; runtime mate/server smoke and `pnpm check` are sufficient for this logic-only boundary.
