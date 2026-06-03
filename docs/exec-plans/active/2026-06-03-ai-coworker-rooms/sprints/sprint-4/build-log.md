# Build Log: Sprint 4 — Logic-First Web AI Interaction Path

## Round 1

### What Was Built
- Exported the deterministic F3 mate context boundary from `apps/mate/package.json` for server reuse.
- Updated `apps/server/package.json` so server test/dev/smoke builds mate first and declares direct `mate` and `zod` dependencies.
- Added `apps/server/src/mate/room-mate-service.ts`, a room-scoped mate message service that validates message payloads, reads a F2 room context feed, invokes F3 `prepareMateTurn`, stores the latest response per room, and returns raw structured result data.
- Added server routes:
  - `POST /rooms/:roomId/mate/messages`
  - `GET /rooms/:roomId/mate`
  - CORS preflight support for mate messages
- Added server tests for valid context-aware mate messages, invalid messages, and room mismatch safety.
- Added `apps/web/src/lib/mate-client.ts`, a small web fetch helper for room-scoped mate messages.
- Added web client tests for request URL/body/session metadata plus server/network error handling.
- Added a minimal `MateRawPanel` inside `CanvasShell`: textarea, send button, pending/error/ready status, and raw JSON response output.
- Added E2E coverage for the full web -> server -> mate -> web message path.
- Updated `ARCHITECTURE.md` and `docs/exec-plans/quality-commands.md` to document the raw AI interaction path.

### Acceptance Criteria Status
| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-4.1 | Web provides a room-scoped input path that sends user messages to a server mate endpoint. | PASS | `createRoomMateClient` posts to `/rooms/:roomId/mate/messages` with session metadata in `apps/web/src/lib/mate-client.ts:15`; E2E sends a message from the room at `apps/web/e2e/canvas-smoke.spec.ts:160`. |
| AC-4.2 | Server endpoint validates room/message payloads, reads the latest room context feed, invokes F3 mate, and returns structured raw result data. | PASS | `createRoomMateService` validates message/source at `apps/server/src/mate/room-mate-service.ts:55` and invokes `prepareMateTurn` at `apps/server/src/mate/room-mate-service.ts:98`; route wiring is in `apps/server/src/http/app.ts:154`. |
| AC-4.3 | Web renders pending, success raw result, and error state without requiring polished chat UI. | PASS | `MateRawPanel` state and raw JSON rendering live at `apps/web/src/components/canvas-shell.tsx:163`; E2E asserts raw result data at `apps/web/e2e/canvas-smoke.spec.ts:171`. |
| AC-4.4 | Message payloads include enough room/session metadata for server and mate correlation. | PASS | Web client sends device/session/tab/sentAt metadata at `apps/web/src/lib/mate-client.ts:34`; server response includes room, agent session when present, message metadata, context freshness, and mate result at `apps/server/src/mate/room-mate-service.ts:106`. |
| AC-4.5 | Existing tldraw canvas remains primary and interactive while the raw AI surface exists. | PASS | `Tldraw` remains mounted before `MateRawPanel` in `apps/web/src/components/canvas-shell.tsx:152`; E2E asserts `.tl-container` remains visible after mate response. |
| AC-4.6 | No F5 safe action protocol or canvas mutation behavior is introduced. | PASS | Targeted `rg` for action/mutation/proposal/apply names across mate/server/web/shared returned no matches. |
| AC-4.7 | Root quality gate remains green with the new web/server/mate path. | PASS | `pnpm check` passed, including 6 Playwright E2E tests and recovery smoke. |

### Behavior Scenario Evidence
- User sends a message from the whiteboard room: verified by E2E filling `mate-message-input`, clicking `mate-send-button`, and receiving raw result data.
- Server combines message with room context before calling mate: verified by server route/service tests asserting canvas text observations and organize intent in the mate result.
- User sees context-aware raw AI output: verified by E2E assertions for room id, `observations`, `interpretation`, and `nonMutating` in the raw JSON output.
- Web surfaces pending and failure state: verified by web client unit tests for server/network failures and component state selectors in E2E for sending/ready.
- AI surface does not dominate canvas work: verified by existing canvas smoke and new mate E2E asserting the tldraw container remains visible.

### TDD Decision & Evidence
Use TDD: Yes

Evidence:
- RED: web unit tests failed on missing `mate-client.js`; server tests failed on missing `room-mate-service.js` and 404 responses for mate routes.
- GREEN: implemented mate package exports, server mate service/routes, web mate client helper, minimal raw panel, and E2E message path until focused tests passed.
- REFACTOR: fixed explicit server `zod` dependency, exact optional property handling for optional agent context, and kept UI minimal after the core path passed.

### E2E / Runtime Verification
Commands run:
- `pnpm install`: PASS, linked workspace dependency changes; no downloads.
- `pnpm --filter @production-spec-graph/server test`: PASS, 7 files / 32 tests.
- `pnpm --filter @production-spec-graph/server typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web test:unit`: PASS, 8 files / 36 tests.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS with local port/browser permission, 6 tests.
- `rg "actionProposal|canvasMutation|mutationSchema|proposalSchema|applyCanvas|proposedAction|acceptProposal" apps/mate/src apps/server/src apps/web/src packages/shared/src`: PASS by no matches.
- `git diff --check`: PASS.
- `pnpm check`: PASS.

### Modularity & Readability Notes
Server route glue stays in `apps/server/src/http/app.ts`; mate request validation and orchestration live in `apps/server/src/mate/room-mate-service.ts`. Web fetch logic lives in `apps/web/src/lib/mate-client.ts`, while `CanvasShell` contains only a small raw panel and keeps tldraw mounted as the primary workspace.

No rich chat UI, markdown rendering, assistant styling, proposal state, or canvas mutation logic was introduced. The panel intentionally renders raw structured response data so future sprints can inspect the actual path before styling it.

### Human Checkpoint
Pause after Sprint 4.

Recommended local commands:
- `pnpm --filter @production-spec-graph/server test`
- `pnpm --filter @production-spec-graph/web test:e2e`
- `pnpm check`

Manual inspection:
- Start server and web.
- Open a room, add a small text shape, type into the `Mate raw` input, and send.
- Confirm the raw JSON includes `response.roomId`, `response.context.freshness`, `response.mate.observations`, `response.mate.interpretation`, and `response.mate.output.nonMutating`.
- Confirm no canvas change is applied by the AI response.

### Decisions Made
- Kept F4 UI as a raw data surface per user direction.
- Let web publish current snapshot and chat-boundary before sending the mate message, so server-side mate has the latest available F2 context feed.
- Used direct workspace import of F3 deterministic mate logic from server; no model credentials or live Mastra runtime required.
- Added mate build before server test/dev/smoke so runtime imports resolve to built JS.

### Quality Command Results
- `pnpm check`: PASS.
- `git diff --check`: PASS.

### Known Issues
- The raw panel is intentionally not a final chat UX.
- The server calls mate in-process; a real process/network adapter can be introduced later if needed.
- Agent lifecycle still reports unavailable when no adapter is configured, even though the deterministic in-process turn boundary can answer messages.
- Safe action proposals and canvas mutation approval remain F5.
