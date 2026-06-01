# Feedback: Sprint 2 Round 2

## Must Fix (blocks approval)
1. Missing backend sync configuration silently falls back to localhost instead of surfacing a recoverable configuration error. `resolveSyncConfig` uses `input.serverUrl ?? DEFAULT_SYNC_SERVER_URL`, and the unit test currently asserts that missing `serverUrl` succeeds. The contract requires missing configuration to error visibly. (AC-2.3)

## Should Fix (won't block but noted)
1. Keep the fixed F2 default room behavior; do not implement F3 route-driven room creation or joining in this revision.
2. Keep using `useSync` from `@tldraw/sync`; do not manually add `sessionId` to the URI because installed `@tldraw/sync@5.0.1` appends reserved `sessionId` and `storeId`.

## Won't Fix (acceptable tradeoffs)
1. Passing a room URI shaped as `/sync/:roomId` without a manual query string is acceptable for `@tldraw/sync@5.0.1`.
