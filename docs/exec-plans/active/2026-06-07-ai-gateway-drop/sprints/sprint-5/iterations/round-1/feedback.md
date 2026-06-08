# Feedback: Sprint 5 Round 1

## Must Fix (blocks approval)
1. Malformed server mate output is rejected without diagnostics — after `INVALID_AGENT_OUTPUT`, `/rooms/:roomId/diagnostics` cannot report an invalid output validation status or reason because no latest response/diagnostic record is stored. Add bounded diagnostics for the failed turn and a server endpoint test that verifies the malformed state/reason appears in room diagnostics. (AC-5.3, AC-5.4)

## Should Fix (won't block but noted)
1. Review whether `RoomMateOutputValidation.status: "invalid"` is reachable; malformed outputs are currently rejected before `validateOutput` can produce that status.

## Won't Fix (acceptable tradeoffs)
1. AI Drop diagnostics remain web-local; this matches the contract fallback because preview/apply state is browser-local and unsynced.
