import { describe, expect, it } from "vitest";

import { AGENT_OUTPUT_SCHEMA_VERSION } from "@production-spec-graph/shared";

import {
  createCompletionProposal,
  readCanvasContext
} from "../tools/canvas-tools.js";

describe("Mastra canvas tools", () => {
  it("reads bounded canvas context without mutation authority", () => {
    const result = readCanvasContext({
      roomId: "alpha",
      shapeCount: 2,
      selectedShapeIds: ["shape:1"],
      recentOperationCount: 3,
      freshness: {
        snapshotVersion: 4,
        eventVersion: 5,
        changedSinceSnapshot: true
      }
    });

    expect(result).toEqual({
      roomId: "alpha",
      shapeCount: 2,
      selectedShapeIds: ["shape:1"],
      recentOperationCount: 3,
      freshness: {
        snapshotVersion: 4,
        eventVersion: 5,
        changedSinceSnapshot: true
      },
      readOnly: true,
      bounded: true
    });
  });

  it("validates completion proposals through the shared AI Drop schema", () => {
    const proposal = createCompletionProposal({
      schemaVersion: AGENT_OUTPUT_SCHEMA_VERSION,
      outputId: "output:tool",
      roomId: "alpha",
      createdAt: "2026-06-08T00:00:00.000Z",
      basedOn: {
        snapshotVersion: 1,
        eventVersion: 1,
        changedSinceSnapshot: false,
        stale: false
      },
      nonMutating: true,
      kind: "completion-proposal",
      proposal: {
        proposalId: "proposal:tool",
        status: "pending",
        previewOnly: true,
        requiresAcceptance: true,
        applied: false,
        completion: {
          kind: "text-in-element",
          shapeId: "shape:1",
          currentText: "Question:",
          proposedText: "Question: What should happen next?"
        },
        rationale: "The selected text shape has recent authoring evidence."
      }
    });

    expect(proposal).toMatchObject({
      kind: "completion-proposal",
      proposal: {
        previewOnly: true,
        requiresAcceptance: true,
        applied: false
      }
    });
  });
});
