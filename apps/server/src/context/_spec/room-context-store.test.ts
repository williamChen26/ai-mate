import { describe, expect, it } from "vitest";

import {
  CANVAS_CONTEXT_SCHEMA_VERSION,
  createCanvasChangeEvent,
  createChatBoundaryEvent,
  createEmptyRoomContextFeed,
  type CanvasSnapshot
} from "@production-spec-graph/shared";

import { createRoomContextStore } from "../room-context-store.js";

const snapshot: CanvasSnapshot = {
  schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
  roomId: "alpha",
  source: {
    kind: "web",
    deviceId: "device:alpha",
    sessionId: "device:alpha:tab:one",
    tabId: "tab:one",
    capturedAt: "2026-06-03T00:00:00.000Z"
  },
  document: {
    shapeCount: 1,
    shapes: [
      {
        id: "shape:one",
        type: "text",
        text: "Hello",
        bounds: { x: 1, y: 2, w: 120, h: 40 }
      }
    ]
  },
  selection: {
    selectedShapeIds: ["shape:one"]
  },
  viewport: {
    pageBounds: { x: 0, y: 0, w: 800, h: 600 },
    zoom: 1
  },
  freshness: {
    snapshotVersion: 1,
    eventVersionAtSnapshot: 0
  }
};

describe("room context store", () => {
  it("stores the latest snapshot with agent lifecycle correlation", () => {
    const store = createRoomContextStore({
      now: () => "2026-06-03T00:00:01.000Z"
    });

    const result = store.acceptSnapshot("alpha", snapshot, {
      agentSessionId: "mate:alpha:001"
    });

    expect(result.ok).toBe(true);
    expect(store.getFeed("alpha", { agentSessionId: "mate:alpha:001" })).toMatchObject({
      roomId: "alpha",
      agentSessionId: "mate:alpha:001",
      latestSnapshot: {
        roomId: "alpha",
        document: { shapeCount: 1 }
      },
      freshness: {
        snapshotVersion: 1,
        eventVersion: 0,
        changedSinceSnapshot: false
      }
    });
  });

  it("rejects route/payload room mismatches without mutating previous context", () => {
    const store = createRoomContextStore();
    expect(store.acceptSnapshot("alpha", snapshot).ok).toBe(true);

    const result = store.acceptSnapshot("beta", snapshot);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "ROOM_MISMATCH" }
    });
    expect(store.getFeed("alpha").latestSnapshot?.roomId).toBe("alpha");
    expect(store.getFeed("beta").latestSnapshot).toBeNull();
  });

  it("appends bounded ordered events and marks changed-since-snapshot freshness", () => {
    const store = createRoomContextStore({
      eventLimit: 2,
      now: () => "2026-06-03T00:00:03.000Z"
    });
    store.acceptSnapshot("alpha", snapshot);

    const first = createCanvasChangeEvent({
      roomId: "alpha",
      eventId: "event:1",
      eventVersion: 1,
      source: snapshot.source,
      occurredAt: "2026-06-03T00:00:01.000Z",
      affectedShapeIds: ["shape:one"],
      summary: "shape edited"
    });
    const second = createChatBoundaryEvent({
      roomId: "alpha",
      eventId: "event:2",
      eventVersion: 2,
      source: snapshot.source,
      occurredAt: "2026-06-03T00:00:02.000Z",
      messageLength: 5
    });
    const third = createCanvasChangeEvent({
      roomId: "alpha",
      eventId: "event:3",
      eventVersion: 3,
      source: snapshot.source,
      occurredAt: "2026-06-03T00:00:03.000Z",
      affectedShapeIds: [],
      summary: "viewport settled"
    });

    expect(store.appendEvent("alpha", first).ok).toBe(true);
    expect(store.appendEvent("alpha", second).ok).toBe(true);
    expect(store.appendEvent("alpha", third).ok).toBe(true);

    expect(store.getFeed("alpha").recentEvents.map((event) => event.eventId)).toEqual([
      "event:2",
      "event:3"
    ]);
    expect(store.getFeed("alpha").freshness).toMatchObject({
      snapshotVersion: 1,
      eventVersion: 3,
      changedSinceSnapshot: true
    });
  });

  it("returns valid empty feeds for quiet rooms", () => {
    const store = createRoomContextStore({
      now: () => "2026-06-03T00:00:04.000Z"
    });

    expect(store.getFeed("quiet")).toEqual(
      createEmptyRoomContextFeed({
        roomId: "quiet",
        generatedAt: "2026-06-03T00:00:04.000Z"
      })
    );
  });
});
