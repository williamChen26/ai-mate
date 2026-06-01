# Product Direction: Tldraw-First AI Coworker Canvas

## Decision

The product direction is now **tldraw-first**. The canvas document, tldraw
editor/store, and tldraw sync layer should be treated as the source of truth.
We should not continue building a separate flowchart-specific graph protocol
for the MVP.

The next architecture layer should be a server-side AI coworker that joins or
observes a sync room as a trusted participant. It should read room state and
editing changes through the collaboration backend, then propose or perform
controlled tldraw edits through that server-side boundary. The front-end should
not expose browser-global canvas context or AI action hooks.

## Why This Changed

The original plan assumed we needed a separate protocol so AI could understand and edit flowchart data. After reviewing tldraw's AI, agent, collaboration, and sync documentation, that assumption no longer fits the best path:

- tldraw already owns a rich editable document model, shape records, editor APIs, and whiteboard interactions.
- The tldraw AI direction is oriented around agents that inspect and act on tldraw content, not around replacing the tldraw document with an external flowchart model.
- The collaboration path should build on tldraw sync/presence concepts so human users and future AI agents operate in the same shared workspace.

## Current MVP Scope

Keep the current app as a runnable tldraw canvas shell:

- Full-screen editable tldraw canvas.
- Compact operational chrome.
- Route-backed live collaboration through the dedicated Node sync backend.
- No custom flowchart CRUD.
- No custom flowchart graph protocol.
- No AI agent implementation yet.

## Future Architecture

### Source Of Truth

Use tldraw document/editor state as the canonical workspace data.

### AI Coworker Layer

Add server-side AI orchestration later, likely under `apps/server` or a backend
package when it grows large enough. It should own:

- room snapshot and change observation through tldraw sync primitives
- trusted AI participant/session identity
- typed server-side edit proposals or commands
- conflict/ambiguity checks before applying AI edits
- audit trail of AI suggestions and applied changes

This layer should depend on tldraw/sync concepts and should not invent
product-domain graph types unless a specific product-spec extraction feature
needs them.

### Collaboration Layer

Human collaboration is implemented with tldraw sync primitives. The AI agent
should eventually appear as a collaborator-like participant from the backend
side that can:

- observe current room state
- notice user changes since its last plan through sync events or room snapshots
- explain conflicts or stale assumptions
- propose edits before applying them
- apply edits through the same shared document/sync boundary as humans

## Deprecated Direction

The previous flowchart-specific graph protocol is superseded. It was useful for thinking through AI-readable data, but it is too narrow and would create a second source of truth beside tldraw.

If structured product spec output is needed later, derive it from the tldraw document and agent context rather than forcing the canvas to mirror a custom flowchart protocol in real time.
