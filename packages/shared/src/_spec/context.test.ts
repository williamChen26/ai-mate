import { describe, expect, it } from "vitest";

import {
  CANVAS_CONTEXT_SCHEMA_VERSION,
  canvasSnapshotSchema,
  createCanvasChangeEvent,
  createChatBoundaryEvent,
  createEmptyRoomContextFeed,
  createGatewayRequest,
  gatewayRequestSchema,
  agentOutputSchema,
  canvasActionProposalOutputSchema,
  completionProposalOutputSchema,
  roomContextFeedSchema,
  roomOperationEventSchema,
  type RoomContextFeed
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

describe("ai gateway shared contracts", () => {
  it("builds distinct completion and conversation gateway requests", () => {
    const context = makeGatewayContextFeed();

    const completion = createGatewayRequest({
      requestId: "gateway:completion",
      roomId: "alpha",
      createdAt: "2026-06-03T00:00:05.000Z",
      trigger: {
        kind: "completion",
        invokedBy: "ai-drop",
        selection: {
          state: "selected",
          selectedShapeIds: ["shape:1"],
          source: { origin: "front-end-runtime-signal", source: baseSource }
        },
        viewport: {
          state: "available",
          pageBounds: { x: 0, y: 0, w: 800, h: 600 },
          zoom: 1,
          source: { origin: "front-end-runtime-signal", source: baseSource }
        },
        source: baseSource
      },
      context
    });
    const conversation = createGatewayRequest({
      requestId: "gateway:conversation",
      roomId: "alpha",
      createdAt: "2026-06-03T00:00:05.000Z",
      trigger: {
        kind: "conversation",
        message: "Help organize this board",
        chatBoundary: {
          state: "available",
          messageLength: 24,
          source: { origin: "front-end-runtime-signal", source: baseSource }
        },
        source: {
          kind: "web",
          deviceId: "device:alpha",
          sessionId: "device:alpha:tab:one",
          tabId: "tab:one",
          sentAt: "2026-06-03T00:00:05.000Z"
        }
      },
      context
    });

    expect(gatewayRequestSchema.parse(completion)).toMatchObject({
      trigger: { kind: "completion" },
      context: {
        snapshot: { source: { origin: "server-context-feed" } },
        recentOperations: { source: { origin: "server-context-feed" } }
      }
    });
    expect(gatewayRequestSchema.parse(conversation)).toMatchObject({
      trigger: { kind: "conversation", message: "Help organize this board" },
      context: {
        chatBoundary: { state: "available" }
      }
    });
  });

  it("requires latest snapshot and bounded ordered recent operations for intent context", () => {
    const context = makeGatewayContextFeed({
      events: [
        makeCanvasEvent("event:1", 1, "first change"),
        makeCanvasEvent("event:2", 2, "second change"),
        makeCanvasEvent("event:3", 3, "third change")
      ]
    });

    const request = createGatewayRequest({
      requestId: "gateway:bounded",
      roomId: "alpha",
      createdAt: "2026-06-03T00:00:05.000Z",
      operationLimit: 2,
      trigger: {
        kind: "completion",
        invokedBy: "ai-drop",
        selection: {
          state: "empty",
          source: { origin: "front-end-runtime-signal", source: baseSource }
        },
        viewport: { state: "missing", reason: "viewport not published" },
        source: baseSource
      },
      context
    });

    expect(request.context.snapshot.state).toBe("available");
    expect(request.context.recentOperations.state).toBe("available");
    expect(request.context.recentOperations.operations.map((event) => event.eventId)).toEqual([
      "event:2",
      "event:3"
    ]);

    expect(() =>
      gatewayRequestSchema.parse({
        requestId: "gateway:snapshot-only",
        roomId: "alpha",
        createdAt: "2026-06-03T00:00:05.000Z",
        trigger: {
          kind: "completion",
          invokedBy: "ai-drop",
          selection: {
            state: "empty",
            source: { origin: "front-end-runtime-signal", source: baseSource }
          },
          viewport: { state: "missing", reason: "viewport not published" },
          source: baseSource
        },
        context: {
          roomId: "alpha",
          snapshot: request.context.snapshot,
          freshness: request.context.freshness,
          intentReadiness: {
            state: "ready",
            missing: [],
            stale: false
          }
        }
      })
    ).toThrow();
  });

  it("represents stale, empty-selection, no-selection, and missing-context states explicitly", () => {
    const request = createGatewayRequest({
      requestId: "gateway:incomplete",
      roomId: "alpha",
      createdAt: "2026-06-03T00:00:05.000Z",
      trigger: {
        kind: "completion",
        invokedBy: "ai-drop",
        selection: { state: "none", reason: "no editor selection event yet" },
        viewport: { state: "missing", reason: "viewport not published" },
        source: baseSource
      },
      context: makeGatewayContextFeed({
        latestSnapshot: null,
        events: [],
        changedSinceSnapshot: true
      })
    });

    expect(request).toMatchObject({
      trigger: {
        selection: { state: "none" },
        viewport: { state: "missing" }
      },
      context: {
        snapshot: { state: "missing" },
        recentOperations: { state: "missing", operations: [] },
        freshness: {
          stale: true,
          changedSinceSnapshot: true
        },
        intentReadiness: {
          state: "incomplete",
          missing: expect.arrayContaining(["latest-snapshot", "recent-operations"]),
          stale: true
        }
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

  it("validates preview-only completion proposals and explicit agent turn outputs", () => {
    const completion = completionProposalOutputSchema.parse({
      schemaVersion: "agent-output.v1",
      kind: "completion-proposal",
      outputId: "output:completion",
      roomId: "alpha",
      createdAt: "2026-06-03T00:00:04.000Z",
      basedOn,
      nonMutating: true,
      proposal: {
        proposalId: "proposal:completion",
        status: "pending",
        previewOnly: true,
        requiresAcceptance: true,
        applied: false,
        completion: {
          kind: "text-in-element",
          shapeId: "shape:1",
          currentText: "User story:",
          proposedText: "User story: As a buyer"
        },
        rationale: "Recent operations show text authoring."
      }
    });

    expect(agentOutputSchema.parse(completion)).toMatchObject({
      kind: "completion-proposal",
      nonMutating: true,
      proposal: {
        previewOnly: true,
        requiresAcceptance: true,
        applied: false
      }
    });
    expect(
      agentOutputSchema.parse({
        schemaVersion: "agent-output.v1",
        kind: "conversation-answer",
        outputId: "output:answer",
        roomId: "alpha",
        createdAt: "2026-06-03T00:00:04.000Z",
        basedOn,
        text: "I would group the launch risks first.",
        nonMutating: true
      })
    ).toMatchObject({ kind: "conversation-answer" });
    expect(
      agentOutputSchema.parse({
        schemaVersion: "agent-output.v1",
        kind: "no-op",
        outputId: "output:no-op",
        roomId: "alpha",
        createdAt: "2026-06-03T00:00:04.000Z",
        basedOn,
        reason: "Selection alone is not enough evidence for completion.",
        nonMutating: true
      })
    ).toMatchObject({ kind: "no-op" });
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

function makeGatewayContextFeed({
  latestSnapshot,
  events = [makeCanvasEvent("event:1", 1, "shape created")],
  changedSinceSnapshot
}: {
  latestSnapshot?: RoomContextFeed["latestSnapshot"];
  events?: RoomContextFeed["recentEvents"];
  changedSinceSnapshot?: boolean;
} = {}): RoomContextFeed {
  const snapshot =
    latestSnapshot === undefined
      ? {
          schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
          roomId: "alpha",
          source: baseSource,
          document: {
            shapeCount: 1,
            shapes: [{ id: "shape:1", type: "text", text: "Launch plan" }]
          },
          selection: { selectedShapeIds: ["shape:1"] },
          viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
          freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
        }
      : latestSnapshot;
  const eventVersion = events.at(-1)?.eventVersion ?? 0;

  return roomContextFeedSchema.parse({
    roomId: "alpha",
    latestSnapshot: snapshot,
    recentEvents: events,
    freshness: {
      snapshotVersion: snapshot?.freshness.snapshotVersion ?? 0,
      eventVersion,
      changedSinceSnapshot: changedSinceSnapshot ?? eventVersion > 0
    },
    generatedAt: "2026-06-03T00:00:04.000Z"
  });
}

function makeCanvasEvent(eventId: string, eventVersion: number, summary: string) {
  return createCanvasChangeEvent({
    roomId: "alpha",
    eventId,
    eventVersion,
    source: baseSource,
    occurredAt: "2026-06-03T00:00:01.000Z",
    affectedShapeIds: ["shape:1"],
    summary
  });
}
