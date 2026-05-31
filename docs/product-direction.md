# Product Direction: Tldraw-First AI Coworker Canvas

## Decision

The product direction is now **tldraw-first**. The canvas document, tldraw editor/store, and future tldraw sync layer should be treated as the source of truth. We should not continue building a separate flowchart-specific graph protocol for the MVP.

The next architecture layer should be an AI coworker layer that reads the current tldraw document state, recent user changes, selection, viewport, and collaboration context, then proposes or performs typed tldraw editing actions. This keeps the product close to the real user workspace instead of maintaining a parallel model that can drift from the canvas.

## Why This Changed

The original plan assumed we needed a separate protocol so AI could understand and edit flowchart data. After reviewing tldraw's AI, agent, collaboration, and sync documentation, that assumption no longer fits the best path:

- tldraw already owns a rich editable document model, shape records, editor APIs, and whiteboard interactions.
- The tldraw AI direction is oriented around agents that inspect and act on tldraw content, not around replacing the tldraw document with an external flowchart model.
- The collaboration path should build on tldraw sync/presence concepts so human users and future AI agents operate in the same shared workspace.

## Current MVP Scope

Keep the current app as a runnable tldraw canvas shell:

- Full-screen editable tldraw canvas.
- Compact operational chrome.
- No custom flowchart CRUD.
- No custom flowchart graph protocol.
- No AI agent implementation yet.
- No collaboration implementation yet.

## Future Architecture

### Source Of Truth

Use tldraw document/editor state as the canonical workspace data.

### AI Coworker Layer

Add a package later, likely under `packages/agent-runtime` or `packages/canvas-intelligence`, that owns:

- canvas context extraction for AI prompts
- recent-change summaries
- typed agent action schemas
- conflict/ambiguity checks before applying agent edits
- audit trail of agent suggestions and applied changes

This package should depend on tldraw concepts and should not invent product-domain graph types unless a specific product-spec extraction feature needs them.

### Collaboration Layer

Add collaboration later using tldraw sync primitives. The AI agent should eventually appear as a collaborator-like participant that can:

- observe current canvas state
- notice user changes since its last plan
- explain conflicts or stale assumptions
- propose edits before applying them
- apply edits through the same tldraw editor/store action path as humans

## Deprecated Direction

The previous flowchart-specific graph protocol is superseded. It was useful for thinking through AI-readable data, but it is too narrow and would create a second source of truth beside tldraw.

If structured product spec output is needed later, derive it from the tldraw document and agent context rather than forcing the canvas to mirror a custom flowchart protocol in real time.
