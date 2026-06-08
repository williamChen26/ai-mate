import { describe, expect, it, vi } from "vitest";

import {
  AGENT_OUTPUT_SCHEMA_VERSION,
  CANVAS_CONTEXT_SCHEMA_VERSION,
  type CanvasSnapshot,
  type CompletionProposalOutput
} from "@production-spec-graph/shared";

import {
  acceptAiDropProposal,
  activateAiDropProposal,
  beginAiDropProposalApply,
  clearAiDropProposal,
  createAiDropDiagnostics,
  finishAiDropProposalApply,
  type AiDropRuntimeContext
} from "../ai-drop-proposal.js";

describe("AI Drop proposal lifecycle", () => {
  it("activates a valid text completion without mutating the canvas", () => {
    const context = createRuntimeContext({
      selectedShapeIds: ["shape:text"],
      shapes: [{ id: "shape:text", type: "text", text: "Question:" }]
    });
    const output = createTextCompletionOutput();

    const state = activateAiDropProposal(output, context);

    expect(state.status).toBe("active");
    expect(state.status === "active" ? state.preview.kind : null).toBe(
      "text-in-element"
    );
    expect(context.mutationCount).toBe(0);
  });

  it("activates a valid flow continuation candidate", () => {
    const context = createRuntimeContext({
      selectedShapeIds: ["shape:flow"],
      shapes: [{ id: "shape:flow", type: "geo", text: "Start" }]
    });
    const output = createFlowCompletionOutput();

    const state = activateAiDropProposal(output, context);

    expect(state.status).toBe("active");
    expect(state.status === "active" ? state.preview.kind : null).toBe(
      "flow-continuation"
    );
  });

  it("refuses malformed, unsupported, stale, and blocked outputs", () => {
    const context = createRuntimeContext({
      selectedShapeIds: ["shape:text"],
      shapes: [{ id: "shape:text", type: "text", text: "Question:" }]
    });
    const unsupported = {
      ...createTextCompletionOutput(),
      kind: "conversation-answer",
      text: "not a completion"
    };
    const stale = {
      ...createTextCompletionOutput(),
      basedOn: { snapshotVersion: 1, eventVersion: 1, changedSinceSnapshot: true, stale: true }
    };
    const blocked = {
      ...createTextCompletionOutput(),
      proposal: { ...createTextCompletionOutput().proposal, status: "blocked" }
    };

    expect(activateAiDropProposal({ nope: true }, context).status).toBe(
      "refused"
    );
    expect(activateAiDropProposal(unsupported, context).status).toBe("refused");
    expect(activateAiDropProposal(stale, context).status).toBe("stale");
    expect(activateAiDropProposal(blocked, context).status).toBe("refused");
  });

  it("refuses selection mismatches before previewing", () => {
    const context = createRuntimeContext({
      selectedShapeIds: ["shape:other"],
      shapes: [
        { id: "shape:text", type: "text" },
        { id: "shape:other", type: "text" }
      ]
    });

    const state = activateAiDropProposal(createTextCompletionOutput(), context);

    expect(state).toMatchObject({
      status: "refused",
      reason: "selection-mismatch"
    });
  });

  it("revalidates freshness and selection before Tab acceptance", async () => {
    const activeContext = createRuntimeContext({
      selectedShapeIds: ["shape:text"],
      shapes: [{ id: "shape:text", type: "text" }]
    });
    const staleContext = createRuntimeContext({
      selectedShapeIds: ["shape:other"],
      shapes: [
        { id: "shape:text", type: "text" },
        { id: "shape:other", type: "text" }
      ]
    });
    const active = activateAiDropProposal(
      createTextCompletionOutput(),
      activeContext
    );
    const apply = vi.fn();

    const state = await acceptAiDropProposal(active, staleContext, apply);

    expect(state.status).toBe("refused");
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses context-mismatched and no-active Tab acceptance without applying", async () => {
    const context = createRuntimeContext({
      selectedShapeIds: ["shape:text"],
      shapes: [{ id: "shape:text", type: "text", text: "Question:" }]
    });
    const changedContext = {
      ...context,
      freshness: {
        snapshotVersion: 2,
        eventVersion: 2,
        changedSinceSnapshot: false,
        stale: false
      }
    };
    const active = activateAiDropProposal(createTextCompletionOutput(), context);
    const apply = vi.fn();

    await expect(
      acceptAiDropProposal(active, changedContext, apply)
    ).resolves.toMatchObject({
      status: "stale",
      reason: "freshness-mismatch"
    });
    await expect(
      acceptAiDropProposal(clearAiDropProposal("no candidate"), context, apply)
    ).resolves.toMatchObject({
      status: "refused",
      reason: "no-active-proposal"
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("marks a text completion stale when the target text keeps changing", () => {
    const context = createRuntimeContext({
      selectedShapeIds: ["shape:text"],
      shapes: [{ id: "shape:text", type: "text", text: "Question:" }]
    });
    const editedContext = createRuntimeContext({
      selectedShapeIds: ["shape:text"],
      shapes: [{ id: "shape:text", type: "text", text: "Question: draft" }]
    });
    const active = activateAiDropProposal(createTextCompletionOutput(), context);

    expect(beginAiDropProposalApply(active, editedContext)).toMatchObject({
      status: "stale",
      reason: "target-text-changed"
    });
  });

  it("accepts only an active fresh proposal through the apply boundary", async () => {
    const context = createRuntimeContext({
      selectedShapeIds: ["shape:text"],
      shapes: [{ id: "shape:text", type: "text", text: "Question:" }]
    });
    const active = activateAiDropProposal(createTextCompletionOutput(), context);
    const apply = vi.fn(async () => ({
      ok: true as const,
      appliedShapeIds: ["shape:accepted"]
    }));

    const applying = beginAiDropProposalApply(active, context);
    const accepted = await acceptAiDropProposal(active, context, apply);

    expect(applying.status).toBe("applying");
    expect(accepted).toMatchObject({
      status: "applied",
      appliedShapeIds: ["shape:accepted"]
    });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("records apply failures and clears active proposals explicitly", async () => {
    const context = createRuntimeContext({
      selectedShapeIds: ["shape:text"],
      shapes: [{ id: "shape:text", type: "text", text: "Question:" }]
    });
    const active = activateAiDropProposal(createTextCompletionOutput(), context);
    const failed = finishAiDropProposalApply(
      beginAiDropProposalApply(active, context),
      { ok: false, reason: "editor rejected shape" }
    );

    expect(failed).toMatchObject({
      status: "failed",
      reason: "editor rejected shape"
    });
    expect(clearAiDropProposal("escape")).toMatchObject({
      status: "cleared",
      reason: "escape"
    });
  });

  it("creates bounded diagnostics for preview, apply, refusal, and failure states", () => {
    const context = createRuntimeContext({
      selectedShapeIds: ["shape:text"],
      shapes: [{ id: "shape:text", type: "text", text: "Question:" }]
    });
    const active = activateAiDropProposal(createTextCompletionOutput(), context);
    const applying = beginAiDropProposalApply(active, context);
    const applied = finishAiDropProposalApply(applying, {
      ok: true,
      appliedShapeIds: ["shape:accepted"]
    });
    const failed = finishAiDropProposalApply(applying, {
      ok: false,
      reason: "editor rejected shape"
    });
    const refused = activateAiDropProposal(createTextCompletionOutput(), {
      ...context,
      snapshot: {
        ...context.snapshot,
        selection: { selectedShapeIds: ["shape:other"] }
      }
    });

    expect(createAiDropDiagnostics(active)).toMatchObject({
      path: "ai-drop",
      lifecycleStatus: "preview",
      outputKind: "completion-proposal",
      proposalId: "proposal:text",
      targetShapeId: "shape:text",
      preview: {
        active: true,
        kind: "text-in-element"
      },
      safety: {
        previewOnly: true,
        requiresAcceptance: true,
        applied: false,
        hiddenCanvasMutation: false
      },
      bounded: {
        storesPromptText: false,
        storesFullPromptHistory: false
      }
    });
    expect(createAiDropDiagnostics(applied)).toMatchObject({
      lifecycleStatus: "applied",
      appliedShapeIds: ["shape:accepted"],
      safety: { applied: true, hiddenCanvasMutation: false }
    });
    expect(createAiDropDiagnostics(failed)).toMatchObject({
      lifecycleStatus: "failed",
      refusalReason: "editor rejected shape",
      safety: { applied: false }
    });
    expect(createAiDropDiagnostics(refused)).toMatchObject({
      lifecycleStatus: "refused",
      refusalReason: "selection-mismatch",
      safety: { applied: false }
    });
  });
});

function createRuntimeContext(input: {
  selectedShapeIds: string[];
  shapes: Array<{ id: string; type: string; text?: string }>;
}): AiDropRuntimeContext & { mutationCount: number } {
  return {
    mutationCount: 0,
    snapshot: {
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId: "alpha",
      source: {
        kind: "web",
        deviceId: "device:alpha",
        sessionId: "session:alpha",
        tabId: "tab:alpha",
        capturedAt: "2026-06-07T00:00:00.000Z"
      },
      document: {
        shapeCount: input.shapes.length,
        shapes: input.shapes.map((shape, index) => ({
          ...shape,
          bounds: { x: 100 + index * 120, y: 100, w: 120, h: 48 }
        }))
      },
      selection: { selectedShapeIds: input.selectedShapeIds },
      viewport: { pageBounds: { x: 0, y: 0, w: 900, h: 700 }, zoom: 1 },
      freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 1 }
    } satisfies CanvasSnapshot,
    freshness: {
      snapshotVersion: 1,
      eventVersion: 1,
      changedSinceSnapshot: false,
      stale: false
    }
  };
}

function createTextCompletionOutput(): CompletionProposalOutput {
  return {
    schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
    outputId: "output:text",
    roomId: "alpha",
    createdAt: "2026-06-07T00:00:01.000Z",
    basedOn: {
      snapshotVersion: 1,
      eventVersion: 1,
      changedSinceSnapshot: false,
      stale: false
    },
    nonMutating: true,
    kind: "completion-proposal",
    proposal: {
      proposalId: "proposal:text",
      status: "pending",
      previewOnly: true,
      requiresAcceptance: true,
      applied: false,
      completion: {
        kind: "text-in-element",
        shapeId: "shape:text",
        currentText: "Question:",
        proposedText: "Question: What outcome should this step produce?"
      },
      rationale: "The user is editing a text element."
    }
  };
}

function createFlowCompletionOutput(): CompletionProposalOutput {
  return {
    ...createTextCompletionOutput(),
    outputId: "output:flow",
    proposal: {
      ...createTextCompletionOutput().proposal,
      proposalId: "proposal:flow",
      completion: {
        kind: "flow-continuation",
        anchorShapeId: "shape:flow",
        proposedNodes: [{ text: "Validate outcome", type: "geo" }],
        proposedConnectors: [{ fromShapeId: "shape:flow", toProposedNodeIndex: 0 }]
      },
      rationale: "The user is extending a flow."
    }
  };
}
