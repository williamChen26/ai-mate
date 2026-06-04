import { describe, expect, it } from "vitest";

import {
  CANVAS_CONTEXT_SCHEMA_VERSION,
  canvasSnapshotSchema,
  createCanvasChangeEvent,
  createChatBoundaryEvent,
  createEmptyRoomContextFeed,
  agentOutputSchema,
  canvasActionProposalOutputSchema,
  roomContextFeedSchema,
  roomOperationEventSchema
} from "../index.js";

const baseSource = {
  kind: "web" as const,
  deviceId: "device:alpha",
  sessionId: "device:alpha:tab:one",
  tabId: "tab:one",
  capturedAt: "2026-06-03T00:00:00.000Z"
};

describe("canvas context shared contracts", () => {
  it("validates compact canvas snapshots with empty canvas and no selection", () => {
    const snapshot = canvasSnapshotSchema.parse({
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId: "alpha",
      source: baseSource,
      document: {
        shapeCount: 0,
        shapes: []
      },
      selection: {
        selectedShapeIds: []
      },
      viewport: {
        pageBounds: { x: 0, y: 0, w: 800, h: 600 },
        zoom: 1
      },
      freshness: {
        snapshotVersion: 1,
        eventVersionAtSnapshot: 0
      }
    });

    expect(snapshot.document.shapeCount).toBe(0);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("rejects malformed snapshots and unknown event kinds", () => {
    expect(() =>
      canvasSnapshotSchema.parse({
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "../bad",
        source: baseSource,
        document: { shapeCount: 0, shapes: [] },
        selection: { selectedShapeIds: [] },
        viewport: { pageBounds: { x: 0, y: 0, w: 100, h: 100 }, zoom: 1 },
        freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
      })
    ).toThrow();

    expect(() =>
      roomOperationEventSchema.parse({
        schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
        roomId: "alpha",
        eventId: "event:bad",
        eventVersion: 1,
        kind: "agent-output",
        source: baseSource,
        occurredAt: "2026-06-03T00:00:01.000Z"
      })
    ).toThrow();
  });

  it("creates input-side operation events", () => {
    const canvasEvent = createCanvasChangeEvent({
      roomId: "alpha",
      eventId: "event:canvas",
      eventVersion: 1,
      source: baseSource,
      occurredAt: "2026-06-03T00:00:01.000Z",
      affectedShapeIds: ["shape:1"],
      summary: "shape created"
    });
    const chatBoundary = createChatBoundaryEvent({
      roomId: "alpha",
      eventId: "event:chat",
      eventVersion: 2,
      source: baseSource,
      occurredAt: "2026-06-03T00:00:02.000Z",
      messageLength: 12
    });

    expect(roomOperationEventSchema.parse(canvasEvent)).toMatchObject({
      kind: "canvas-change",
      affectedShapeIds: ["shape:1"]
    });
    expect(roomOperationEventSchema.parse(chatBoundary)).toMatchObject({
      kind: "chat-boundary",
      messageLength: 12
    });
  });

  it("builds room context feeds with freshness metadata", () => {
    const feed = createEmptyRoomContextFeed({
      roomId: "alpha",
      agentSessionId: "mate:alpha:001",
      generatedAt: "2026-06-03T00:00:03.000Z"
    });

    expect(roomContextFeedSchema.parse(feed)).toMatchObject({
      roomId: "alpha",
      agentSessionId: "mate:alpha:001",
      latestSnapshot: null,
      recentEvents: [],
      freshness: {
        snapshotVersion: 0,
        eventVersion: 0,
        changedSinceSnapshot: false
      }
    });
  });
});

describe("agent output shared contracts", () => {
  const basedOn = {
    snapshotVersion: 1,
    eventVersion: 1,
    changedSinceSnapshot: false,
    stale: false
  };

  it("validates non-mutating suggestions and questions with freshness metadata", () => {
    expect(
      agentOutputSchema.parse({
        schemaVersion: "agent-output.v1",
        kind: "suggestion",
        outputId: "output:suggestion",
        roomId: "alpha",
        createdAt: "2026-06-03T00:00:04.000Z",
        basedOn,
        text: "Group related risks together.",
        nonMutating: true
      })
    ).toMatchObject({
      kind: "suggestion",
      nonMutating: true,
      basedOn
    });

    expect(
      agentOutputSchema.parse({
        schemaVersion: "agent-output.v1",
        kind: "question",
        outputId: "output:question",
        roomId: "alpha",
        createdAt: "2026-06-03T00:00:04.000Z",
        basedOn,
        text: "Should I create a next-step note?",
        nonMutating: true
      })
    ).toMatchObject({ kind: "question" });
  });

  it("validates safe canvas action proposals that require acceptance", () => {
    const output = canvasActionProposalOutputSchema.parse({
      schemaVersion: "agent-output.v1",
      kind: "canvas-action-proposal",
      outputId: "output:proposal",
      roomId: "alpha",
      createdAt: "2026-06-03T00:00:04.000Z",
      basedOn,
      nonMutating: true,
      proposal: {
        proposalId: "proposal:add-note",
        status: "pending",
        statusReason: "Ready for review.",
        requiresAcceptance: true,
        action: {
          kind: "create-text-note",
          mutatesCanvas: true,
          text: "Next step: assign owners.",
          x: 120,
          y: 160
        },
        rationale: "The board has a launch plan but no owner note."
      }
    });

    expect(output.proposal).toMatchObject({
      requiresAcceptance: true,
      action: { kind: "create-text-note", mutatesCanvas: true }
    });
  });

  it("rejects unsafe or ambiguous proposals", () => {
    expect(() =>
      canvasActionProposalOutputSchema.parse({
        schemaVersion: "agent-output.v1",
        kind: "canvas-action-proposal",
        outputId: "output:proposal",
        roomId: "alpha",
        createdAt: "2026-06-03T00:00:04.000Z",
        basedOn,
        nonMutating: true,
        proposal: {
          proposalId: "proposal:bad",
          status: "pending",
          requiresAcceptance: false,
          action: {
            kind: "create-text-note",
            mutatesCanvas: true,
            text: "Bad"
          },
          rationale: "Bad proposal."
        }
      })
    ).toThrow();
  });
});
