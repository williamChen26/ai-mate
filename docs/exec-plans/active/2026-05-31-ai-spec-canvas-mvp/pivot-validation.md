# Pivot Validation: Tldraw-First Direction

## Date

2026-05-31

## What Changed

- Removed the custom flowchart graph protocol package from active product code.
- Removed the web app dependency on `@production-spec-graph/graph-protocol`.
- Updated the canvas shell status from protocol/flowchart language to tldraw-first AI coworker direction.
- Updated root scripts and quality commands to validate the current web app surface.
- Recorded the product direction in `docs/product-direction.md`.
- Marked the remaining old flowchart-protocol features as superseded in `meta.json`.

## Validation Commands

- `pnpm install`: PASS.
- `pnpm --filter @production-spec-graph/web typecheck`: PASS.
- `pnpm --filter @production-spec-graph/web build`: PASS.
- `pnpm --filter @production-spec-graph/web test:e2e`: PASS, 1 Playwright smoke test passed using system Chrome.
- `git diff --check`: PASS.

## Runtime Notes

- The local Next.js dev server is available at `http://127.0.0.1:3000`.
- The Playwright smoke verifies the app shell, tldraw editor container, tldraw-first status text, click interaction, and wheel zoom without runtime error text.

## Follow-Up Direction

The next sprint should not revive custom flowchart CRUD. It should define the agent coworker layer around tldraw-native state:

- extract canvas context from tldraw editor/store state
- summarize recent changes
- define typed agent actions over tldraw records/editor APIs
- plan later collaboration/conflict awareness with tldraw sync and presence
