import { describe, expect, it, vi } from "vitest";

import { CANVAS_CONTEXT_SCHEMA_VERSION } from "@production-spec-graph/shared";

import {
  createChatBoundaryOperationEvent,
  createRoomContextPublisher,
  extractCanvasSnapshotFromEditor
} from "./room-context.js";

const source = {
  deviceId: "device:alpha",
  sessionId: "device:alpha:tab:one",
  tabId: "tab:one"
};

describe("web room context extraction and publishing", () => {
  it("extracts compact tldraw facts from a mounted editor", () => {
    const editor = {
      getCurrentPageShapes: () => [
        {
          id: "shape:one",
          type: "text",
          x: 10,
          y: 20,
          props: {
            richText: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Hello" }]
                }
              ]
            }
          }
        }
      ],
      getSelectedShapeIds: () => ["shape:one"],
      getShapePageBounds: () => ({
        x: 10,
        y: 20,
        w: 120,
        h: 40,
        toJson() {
          return { x: 10, y: 20, w: 120, h: 40 };
        }
      }),
      getViewportPageBounds: () => ({
        x: 0,
        y: 0,
        w: 800,
        h: 600,
        toJson() {
          return { x: 0, y: 0, w: 800, h: 600 };
        }
      }),
      getZoomLevel: () => 1
    };

    const snapshot = extractCanvasSnapshotFromEditor(editor, {
      roomId: "alpha",
      source,
      capturedAt: "2026-06-03T00:00:00.000Z",
      snapshotVersion: 1,
      eventVersionAtSnapshot: 0
    });

    expect(snapshot).toMatchObject({
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId: "alpha",
      document: {
        shapeCount: 1,
        shapes: [{ id: "shape:one", type: "text", text: "Hello" }]
      },
      selection: { selectedShapeIds: ["shape:one"] }
    });
  });

  it("creates chat boundary events without retaining chat text", () => {
    const event = createChatBoundaryOperationEvent({
      roomId: "alpha",
      source,
      eventId: "event:chat",
      eventVersion: 1,
      occurredAt: "2026-06-03T00:00:01.000Z",
      message: "hello assistant"
    });

    expect(event).toMatchObject({
      kind: "chat-boundary",
      messageLength: 15
    });
    expect(JSON.stringify(event)).not.toContain("hello assistant");
  });

  it("publishes snapshots and operation events to room-scoped server endpoints", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    })) as unknown as typeof globalThis.fetch;
    const publisher = createRoomContextPublisher({
      baseUrl: "http://127.0.0.1:3001",
      roomId: "alpha",
      fetch
    });

    await publisher.publishSnapshot({
      schemaVersion: CANVAS_CONTEXT_SCHEMA_VERSION,
      roomId: "alpha",
      source: {
        kind: "web",
        ...source,
        capturedAt: "2026-06-03T00:00:00.000Z"
      },
      document: { shapeCount: 0, shapes: [] },
      selection: { selectedShapeIds: [] },
      viewport: { pageBounds: { x: 0, y: 0, w: 100, h: 100 }, zoom: 1 },
      freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
    });

    await publisher.publishEvent(
      createChatBoundaryOperationEvent({
        roomId: "alpha",
        source,
        eventId: "event:chat",
        eventVersion: 1,
        occurredAt: "2026-06-03T00:00:01.000Z",
        message: "hello"
      })
    );

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:3001/rooms/alpha/context/snapshot",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3001/rooms/alpha/context/events",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns inspectable publish failures instead of throwing on network errors", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("backend unavailable");
    }) as unknown as typeof globalThis.fetch;
    const publisher = createRoomContextPublisher({
      baseUrl: "http://127.0.0.1:3001",
      roomId: "alpha",
      fetch
    });

    await expect(
      publisher.publishEvent(
        createChatBoundaryOperationEvent({
          roomId: "alpha",
          source,
          eventId: "event:chat",
          eventVersion: 1,
          occurredAt: "2026-06-03T00:00:01.000Z",
          message: "hello"
        })
      )
    ).resolves.toEqual({
      ok: false,
      error: "backend unavailable"
    });
    await expect(publisher.getContext()).resolves.toBeNull();
  });
});
