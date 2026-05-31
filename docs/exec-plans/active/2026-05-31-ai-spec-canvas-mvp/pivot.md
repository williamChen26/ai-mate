# Pivot: Tldraw-First AI Coworker Canvas

## Date

2026-05-31

## Trigger

After the runnable tldraw canvas shell passed Sprint 3, the product direction was revisited against the real goal: an AI agent that behaves like a coworker on the canvas, understands current canvas state, notices changes and conflicts, and eventually collaborates in real time.

## Decision

Stop pursuing custom flowchart CRUD and a separate flowchart graph protocol as the MVP foundation. Use tldraw itself as the document/source-of-truth layer.

## Superseded Features

- F4: Flowchart Element CRUD on Canvas
- F5: Canvas and Protocol Synchronization Inspector
- F6: MVP Demo Hardening and Verification, as originally written around flowchart protocol synchronization

## Replacement Direction

Future sprints should focus on:

1. Tldraw-native canvas hardening and UX quality.
2. Agent-ready canvas context extraction from tldraw editor/store state.
3. Typed agent actions that operate on tldraw records/editor APIs.
4. Collaboration readiness using tldraw sync/presence concepts.
5. Agent conflict awareness based on recent user changes and stale agent assumptions.

## Implementation Note

The flowchart-specific `packages/graph-protocol` package is removed as active product code. The app no longer imports it for status display. The product direction is recorded in `docs/product-direction.md`.
