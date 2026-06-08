import { describe, expect, it } from "vitest";

import { createGatewayRequest } from "@production-spec-graph/shared";

import {
  createCanvasAgentPromptPack,
  normalizeCanvasAgentOutput
} from "../canvas-agent-prompt.js";
import { makeRoomContextFeed } from "../test-fixtures.js";

describe("canvas agent prompt pack", () => {
  it("explains canvas semantics with selection, freshness, and ordered operations", () => {
    const context = makeRoomContextFeed({
      roomId: "prompt-room",
      shapeTexts: ["User story: As a", "Acceptance criteria"],
      eventKinds: ["canvas-change", "selection-change"],
      eventSummaries: ["text edited in shape:1"]
    });
    const gateway = createGatewayRequest({
      requestId: "gateway:prompt-room",
      roomId: "prompt-room",
      createdAt: "2026-06-08T00:00:00.000Z",
      trigger: {
        kind: "completion",
        invokedBy: "ai-drop",
        selection: {
          state: "selected",
          selectedShapeIds: ["shape:1"],
          source: {
            origin: "front-end-runtime-signal",
            source: context.latestSnapshot?.source
          }
        },
        viewport: {
          state: "available",
          pageBounds: { x: 0, y: 0, w: 1200, h: 800 },
          zoom: 1,
          source: {
            origin: "front-end-runtime-signal",
            source: context.latestSnapshot?.source
          }
        },
        source: context.latestSnapshot!.source
      },
      context
    });

    const pack = createCanvasAgentPromptPack({ gateway, context });

    expect(pack).toMatchObject({
      schemaVersion: "canvas-agent-prompt-pack.v1",
      path: "completion",
      roomId: "prompt-room",
      context: {
        triggerKind: "completion",
        selection: {
          selectedShapeIds: ["shape:1"],
          selectedShapes: [
            expect.objectContaining({
              id: "shape:1",
              text: "User story: As a"
            })
          ]
        },
        freshness: {
          snapshotVersion: 1,
          eventVersion: 2,
          stale: false
        },
        recentOperations: [
          expect.objectContaining({
            index: 0,
            kind: "canvas-change",
            summary: "text edited in shape:1"
          }),
          expect.objectContaining({
            index: 1,
            kind: "selection-change"
          })
        ]
      }
    });
    expect(pack.system).toMatch(/structured context/i);
    expect(pack.system).toMatch(/ordered intent evidence/i);
    expect(pack.context.safetyPolicy).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/completion-proposal/i),
        expect.stringMatching(/previewOnly/i)
      ])
    );
    expect(pack.user).toMatch(/Snapshot facts describe current state/);
  });

  it("uses bounded gateway operations instead of older full context operations", () => {
    const context = makeRoomContextFeed({
      roomId: "prompt-bounded",
      shapeTexts: ["Decision"],
      eventKinds: ["canvas-change", "selection-change", "viewport-change"],
      eventSummaries: ["old text edit"]
    });
    const gateway = createGatewayRequest({
      requestId: "gateway:prompt-bounded",
      roomId: "prompt-bounded",
      createdAt: "2026-06-08T00:00:00.000Z",
      operationLimit: 2,
      trigger: {
        kind: "completion",
        invokedBy: "ai-drop",
        selection: {
          state: "selected",
          selectedShapeIds: ["shape:1"],
          source: {
            origin: "front-end-runtime-signal",
            source: context.latestSnapshot?.source
          }
        },
        viewport: {
          state: "available",
          pageBounds: { x: 0, y: 0, w: 1200, h: 800 },
          zoom: 1,
          source: {
            origin: "front-end-runtime-signal",
            source: context.latestSnapshot?.source
          }
        },
        source: context.latestSnapshot!.source
      },
      context
    });

    const pack = createCanvasAgentPromptPack({ gateway, context });

    expect(pack.context.recentOperations.map((operation) => operation.kind)).toEqual([
      "selection-change",
      "viewport-change"
    ]);
    expect(JSON.stringify(pack.context.recentOperations)).not.toContain(
      "old text edit"
    );
  });
});

describe("canvas agent output normalization", () => {
  const basedOn = {
    snapshotVersion: 1,
    eventVersion: 1,
    changedSinceSnapshot: false,
    stale: false
  };

  it("turns plain conversation text into conversation-answer output", () => {
    const result = normalizeCanvasAgentOutput({
      path: "conversation",
      raw: "This board is about launch planning.",
      roomId: "normalize-room",
      outputId: "normalize-output",
      createdAt: "2026-06-08T00:00:00.000Z",
      basedOn
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        kind: "conversation-answer",
        text: "This board is about launch planning.",
        nonMutating: true
      }
    });
  });

  it("rejects plain text for AI Drop completion", () => {
    const result = normalizeCanvasAgentOutput({
      path: "completion",
      raw: "Just add another step",
      roomId: "normalize-room",
      outputId: "normalize-output",
      createdAt: "2026-06-08T00:00:00.000Z",
      basedOn
    });

    expect(result).toEqual({
      ok: false,
      reason: "plain-text-not-supported-for-completion"
    });
  });

  it("accepts valid completion-proposal output for completion path", () => {
    const result = normalizeCanvasAgentOutput({
      path: "completion",
      raw: {
        schemaVersion: "agent-output.v1",
        kind: "completion-proposal",
        outputId: "completion-output",
        roomId: "normalize-room",
        createdAt: "2026-06-08T00:00:00.000Z",
        basedOn,
        nonMutating: true,
        proposal: {
          proposalId: "proposal:1",
          status: "pending",
          previewOnly: true,
          requiresAcceptance: true,
          applied: false,
          completion: {
            kind: "text-in-element",
            shapeId: "shape:1",
            currentText: "As a",
            proposedText: "As a user, I want to save my work"
          },
          rationale: "Selected text and recent typing suggest text completion."
        }
      },
      roomId: "normalize-room",
      outputId: "normalize-output",
      createdAt: "2026-06-08T00:00:00.000Z",
      basedOn
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        kind: "completion-proposal",
        proposal: {
          completion: {
            kind: "text-in-element"
          }
        }
      }
    });
  });

  it("rejects completion-proposal on the conversation path", () => {
    const result = normalizeCanvasAgentOutput({
      path: "conversation",
      raw: {
        schemaVersion: "agent-output.v1",
        kind: "completion-proposal",
        outputId: "completion-output",
        roomId: "normalize-room",
        createdAt: "2026-06-08T00:00:00.000Z",
        basedOn,
        nonMutating: true,
        proposal: {
          proposalId: "proposal:1",
          status: "pending",
          previewOnly: true,
          requiresAcceptance: true,
          applied: false,
          completion: {
            kind: "text-in-element",
            shapeId: "shape:1",
            currentText: "As a",
            proposedText: "As a user"
          },
          rationale: "Wrong path."
        }
      },
      roomId: "normalize-room",
      outputId: "normalize-output",
      createdAt: "2026-06-08T00:00:00.000Z",
      basedOn
    });

    expect(result).toEqual({
      ok: false,
      reason: "completion-proposal-not-supported-for-conversation"
    });
  });
});
