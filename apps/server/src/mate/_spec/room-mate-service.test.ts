import { describe, expect, it } from "vitest";
import {
  CANVAS_CONTEXT_SCHEMA_VERSION,
  roomContextFeedSchema,
  type RoomContextFeed
} from "@production-spec-graph/shared";

import { createRoomMateService } from "../room-mate-service.js";

const source = {
  kind: "web",
  deviceId: "device:alpha",
  sessionId: "device:alpha:tab:one",
  tabId: "tab:one",
  sentAt: "2026-06-03T00:00:04.000Z"
};

describe("room mate service", () => {
  it("combines a room message with context and returns a mate turn", () => {
    const service = createRoomMateService({
      now: () => "2026-06-03T00:00:05.000Z",
      turnId: () => "turn:alpha"
    });
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "Help organize this board",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Launch plan", "Risks"],
        eventKinds: ["canvas-change"]
      }),
      agent: { agentSessionId: "mate:alpha:session" }
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        roomId: "alpha",
        agentSessionId: "mate:alpha:session",
        message: { length: 24 },
        mate: {
          roomId: "alpha",
          output: { nonMutating: true },
          observations: {
            shapeCount: 2,
            textSnippets: ["Launch plan", "Risks"]
          },
          interpretation: {
            intent: expect.stringMatching(/organize/i)
          }
        }
      }
    });
    expect(service.getLastResponse("alpha")?.mate.turnId).toBe("turn:alpha");
  });

  it("rejects empty messages before calling mate", () => {
    const service = createRoomMateService();
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "   ",
        source
      },
      context: makeRoomContextFeed({ roomId: "alpha" })
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_MATE_MESSAGE" }
    });
    expect(service.getLastResponse("alpha")).toBeUndefined();
  });

  it("rejects context feeds for another room", () => {
    const service = createRoomMateService();
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "What changed?",
        source
      },
      context: makeRoomContextFeed({ roomId: "beta" })
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "ROOM_MISMATCH" }
    });
  });

  it("returns typed proposal diagnostics without applying canvas actions", () => {
    const service = createRoomMateService({
      now: () => "2026-06-03T00:00:05.000Z",
      turnId: () => "turn:proposal"
    });
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "Add a note for the next decision",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Launch plan"],
        eventKinds: []
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        outputValidation: {
          ok: true,
          status: "pending",
          applied: false
        },
        mate: {
          output: {
            kind: "canvas-action-proposal",
            proposal: {
              requiresAcceptance: true,
              action: { kind: "create-text-note" }
            }
          }
        }
      }
    });
  });

  it("marks stale proposals as blocked using context freshness", () => {
    const service = createRoomMateService();
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "Create a note for this",
        source
      },
      context: makeRoomContextFeed({
        roomId: "alpha",
        shapeTexts: ["Old view"],
        eventKinds: ["canvas-change"],
        changedSinceSnapshot: true
      })
    });

    expect(result).toMatchObject({
      ok: true,
      response: {
        outputValidation: {
          ok: true,
          status: "blocked",
          applied: false,
          reason: expect.stringMatching(/changed after the snapshot/i)
        }
      }
    });
  });

  it("rejects malformed mate outputs with inspectable diagnostics", () => {
    const service = createRoomMateService({
      prepareTurn: () => ({
        roomId: "alpha",
        output: {
          kind: "canvas-action-proposal",
          proposal: {
            requiresAcceptance: false
          }
        }
      })
    });
    const result = service.handleMessage({
      roomId: "alpha",
      payload: {
        message: "Add a note",
        source
      },
      context: makeRoomContextFeed({ roomId: "alpha" })
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_AGENT_OUTPUT" }
    });
    expect(service.getLastResponse("alpha")).toBeUndefined();
  });
});

function makeRoomContextFeed({
  roomId,
  shapeTexts = ["Launch plan"],
  eventKinds = ["canvas-change"],
  changedSinceSnapshot
}: {
  roomId: string;
  shapeTexts?: string[];
  eventKinds?: Array<"canvas-change" | "selection-change">;
  changedSinceSnapshot?: boolean;
}): RoomContextFeed {
  const eventVersion = changedSinceSnapshot ? eventKinds.length + 1 : eventKinds.length;
  return roomContextFeedSchema.parse({
    roomId,
    agentSessionId: `mate:${roomId}:session`,
    latestSnapshot: {
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId,
      source: {
        kind: "web",
        deviceId: "device:alpha",
        sessionId: "device:alpha:tab:one",
        tabId: "tab:one",
        capturedAt: "2026-06-03T00:00:00.000Z"
      },
      document: {
        shapeCount: shapeTexts.length,
        shapes: shapeTexts.map((text, index) => ({
          id: `shape:${index + 1}`,
          type: "text",
          text
        }))
      },
      selection: { selectedShapeIds: shapeTexts.length > 0 ? ["shape:1"] : [] },
      viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
      freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
    },
    recentEvents: eventKinds.map((kind, index) => ({
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId,
      eventId: `event:${index + 1}`,
      eventVersion: index + 1,
      kind,
      source: {
        kind: "web",
        deviceId: "device:alpha",
        sessionId: "device:alpha:tab:one",
        tabId: "tab:one",
        capturedAt: "2026-06-03T00:00:01.000Z"
      },
      occurredAt: "2026-06-03T00:00:02.000Z",
      ...(kind === "canvas-change"
        ? { affectedShapeIds: ["shape:1"], summary: "fixture change" }
        : { selectedShapeIds: ["shape:1"] })
    })),
    freshness: {
      snapshotVersion: 1,
      eventVersion,
      changedSinceSnapshot: changedSinceSnapshot ?? eventKinds.length > 0
    },
    generatedAt: "2026-06-03T00:00:03.000Z"
  });
}
