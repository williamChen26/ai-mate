# Feedback: Sprint 2 Round 1

## Must Fix (blocks approval)
1. Agent completion decisions ignore the gateway's bounded ordered operation stack. Use `gateway.context.recentOperations.operations` for gateway-triggered decisions, preserve enough ordered operation evidence in the decision summary, and add a regression test proving older/full `context.recentEvents` cannot trigger completion when the bounded gateway stack lacks authoring evidence. (AC-2.2)
2. Add focused verification for incomplete completion evidence. A completion gateway request with missing, stale, contradictory, or sparse evidence must return `clarifying-question` or no-op/refusal, make no completion tool call, and identify the missing/uncertain evidence source in the decision summary. (AC-2.5)

## Should Fix (won't block but noted)
1. Remove the duplicated/orphaned comment before `chooseOutput` in `apps/mate/src/context/mate-turn.ts`.

## Won't Fix (acceptable tradeoffs)
1. True browser E2E for AI Drop preview remains out of scope for Sprint 2; the contract correctly uses mate/server smoke and root `pnpm check` as runtime verification for this logic boundary.
