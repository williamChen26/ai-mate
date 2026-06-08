import { describe, expect, it, vi } from "vitest";

import { CANVAS_CONTEXT_SCHEMA_VERSION } from "@production-spec-graph/shared";

import {
  createChatBoundaryOperationEvent,
  createRoomContextPublisher,
  extractCanvasSnapshotFromEditor,
  registerRoomContextRuntime
} from "../room-context.js";

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

  it("keeps read-only extraction on the last published snapshot version", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    })) as unknown as typeof globalThis.fetch;
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("window", {});

    const cleanup = registerRoomContextRuntime(
      {
        getCurrentPageShapes: () => [],
        getSelectedShapeIds: () => [],
        getViewportPageBounds: () => ({ x: 0, y: 0, w: 800, h: 600 }),
        getZoomLevel: () => 1
      },
      {
        baseUrl: "http://127.0.0.1:3001",
        roomId: "alpha",
        source
      }
    );

    try {
      const runtime = window.__PSG_ROOM_CONTEXT__;
      if (!runtime) {
        throw new Error("room context runtime was not registered");
      }

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(runtime.extractSnapshot().freshness.snapshotVersion).toBe(1);
      expect(runtime.extractSnapshot().freshness.snapshotVersion).toBe(1);

      const publishResult = await runtime.publishSnapshot();

      expect(publishResult.ok).toBe(true);
      expect(publishResult.snapshot?.freshness.snapshotVersion).toBe(2);
      expect(runtime.extractSnapshot().freshness.snapshotVersion).toBe(2);
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it("automatically publishes canvas changes and dispatches an authoring signal", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    })) as unknown as typeof globalThis.fetch;
    const dispatchEvent = vi.fn((_event: Event) => true);
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      dispatchEvent
    });
    const listeners = createFakeStoreListeners();
    const cleanup = registerRoomContextRuntime(
      {
        getCurrentPageShapes: () => [
          { id: "shape:one", type: "text", props: { text: "Draft" } }
        ],
        getSelectedShapeIds: () => ["shape:one"],
        getViewportPageBounds: () => ({ x: 0, y: 0, w: 800, h: 600 }),
        getZoomLevel: () => 1,
        store: listeners.store
      },
      {
        baseUrl: "http://127.0.0.1:3001",
        roomId: "alpha",
        source,
        autoPublish: { debounceMs: 1 }
      }
    );

    try {
      await wait(0);
      listeners.document?.({ changes: { added: {}, updated: {}, removed: {} } });
      await wait(10);

      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:3001/rooms/alpha/context/events",
        expect.objectContaining({
          body: expect.stringContaining("text edited")
        })
      );
      expect(fetch).toHaveBeenLastCalledWith(
        "http://127.0.0.1:3001/rooms/alpha/context/snapshot",
        expect.objectContaining({ method: "POST" })
      );
      expect(dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "psg:room-context:auto",
          detail: expect.objectContaining({
            kind: "canvas-change",
            roomId: "alpha"
          })
        })
      );
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it("automatically emits selection and viewport events without canvas authoring signals", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    })) as unknown as typeof globalThis.fetch;
    const dispatchEvent = vi.fn((_event: Event) => true);
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      dispatchEvent
    });
    const listeners = createFakeStoreListeners();
    let selectedShapeIds = ["shape:one"];
    const cleanup = registerRoomContextRuntime(
      {
        getCurrentPageShapes: () => [
          { id: "shape:one", type: "text", props: { text: "Draft" } }
        ],
        getSelectedShapeIds: () => selectedShapeIds,
        getViewportPageBounds: () => ({ x: 10, y: 20, w: 800, h: 600 }),
        getZoomLevel: () => 1.2,
        store: listeners.store
      },
      {
        baseUrl: "http://127.0.0.1:3001",
        roomId: "alpha",
        source,
        autoPublish: { debounceMs: 1 }
      }
    );

    try {
      await wait(0);
      selectedShapeIds = ["shape:two"];
      listeners.session?.({ changes: { added: {}, updated: {}, removed: {} } });
      await wait(10);

      const eventBodies = vi.mocked(fetch).mock.calls
        .filter((call) => String(call[0]).endsWith("/context/events"))
        .map((call) => String((call[1] as { body?: unknown }).body));
      expect(eventBodies.some((body) => body.includes("selection-change"))).toBe(
        true
      );
      expect(eventBodies.some((body) => body.includes("viewport-change"))).toBe(
        true
      );
      expect(
        dispatchEvent.mock.calls.some((call) =>
          JSON.stringify(call[0]).includes("canvas-change")
        )
      ).toBe(false);
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
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

function createFakeStoreListeners() {
  type FakeEntry = { changes?: { added?: {}; updated?: {}; removed?: {} } };
  type FakeListener = (entry: FakeEntry) => void;
  const listeners: {
    document?: FakeListener;
    session?: FakeListener;
    cleanup: Array<() => void>;
  } = { cleanup: [] };
  return {
    get document() {
      return listeners.document;
    },
    get session() {
      return listeners.session;
    },
    store: {
      listen(listener: FakeListener, filters?: { scope?: string }) {
        if (filters?.scope === "document") {
          listeners.document = listener;
        }
        if (filters?.scope === "session") {
          listeners.session = listener;
        }
        const cleanup = vi.fn(() => undefined);
        listeners.cleanup.push(cleanup);
        return cleanup;
      }
    },
    cleanup: listeners.cleanup
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
