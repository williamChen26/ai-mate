# Feedback: Sprint 1 Round 1

## Must Fix (blocks approval)
1. Fix the server package test script — `pnpm --filter @production-spec-graph/server test` currently runs only 2 files and 7 tests, skipping `src/config.test.ts` and `src/room-id.test.ts`. Update `apps/server/package.json` so the required command runs all server tests, then verify it reports all 4 files and 14 tests. (AC-1.2)

## Should Fix (won't block but noted)
1. Update the build log in the next round with the corrected server test count and command output so the TDD evidence matches the package script.

## Won't Fix (acceptable tradeoffs)
1. The current `apps/web` tldraw 5.0.1 typecheck failure is treated as an F2 dependency-alignment caveat, not an F1 blocker, because Sprint 1 does not implement web sync and the direct status-label E2E repair passed.
