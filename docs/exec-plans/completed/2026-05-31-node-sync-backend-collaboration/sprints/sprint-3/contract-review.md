APPROVED

Rationale:
- Scope is limited to F3 route-driven room creation/joining and explicitly excludes presence/status polish, auth, persistence, share UI affordances, and F4 failure recovery.
- Behavior Scenarios appear before Acceptance Criteria and cover no-room creation, valid shared-route join, invalid-route recovery, reload/same-URL multi-tab/back-forward no-loop behavior, and same-room two-client sync.
- The contract defines `/rooms/:roomId` as the canonical route and requires replacement of the F2 fixed `psg-default-room` behavior.
- TDD is selected with a practical rationale for deterministic route parsing, validation, generation, sync gating, and no-loop decisions, including RED/GREEN/REFACTOR evidence expectations.
- E2E/runtime verification is required for the runnable route/collaboration surface, including `/`, valid room URLs, invalid room URLs, reload, multi-context sharing, and backend-bound sync diagnostics.
- The F2 constraint that `NEXT_PUBLIC_PSG_SYNC_SERVER_URL` remains explicitly required is preserved in scope and AC-3.6.
- Modularity/readability expectations and a useful human checkpoint with exact local commands and manual inspection targets are included.
