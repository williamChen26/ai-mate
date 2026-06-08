import { describe, expect, it, vi } from "vitest";

import { createRoomMateClient } from "../mate-client.js";

const source = {
  deviceId: "device:alpha",
  sessionId: "device:alpha:tab:one",
  tabId: "tab:one"
};

describe("web mate client", () => {
  it("sends room-scoped messages with session metadata", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        response: { roomId: "alpha", mate: { output: { nonMutating: true } } }
      })
    })) as unknown as typeof globalThis.fetch;
    const client = createRoomMateClient({
      baseUrl: "http://127.0.0.1:3001",
      roomId: "alpha",
      source,
      fetch,
      now: () => "2026-06-03T00:00:01.000Z"
    });

    await expect(client.sendMessage("Help organize")).resolves.toMatchObject({
      ok: true,
      value: {
        response: { roomId: "alpha" }
      }
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/rooms/alpha/mate/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "Help organize",
          source: {
            kind: "web",
            ...source,
            sentAt: "2026-06-03T00:00:01.000Z"
          }
        })
      })
    );
  });

  it("returns inspectable failures for server and network errors", async () => {
    const serverFetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "Message is required." }
      })
    })) as unknown as typeof globalThis.fetch;
    const networkFetch = vi.fn(async () => {
      throw new Error("backend unavailable");
    }) as unknown as typeof globalThis.fetch;

    await expect(
      createRoomMateClient({
        baseUrl: "http://127.0.0.1:3001",
        roomId: "alpha",
        source,
        fetch: serverFetch
      }).sendMessage("")
    ).resolves.toEqual({ ok: false, error: "Message is required." });

    await expect(
      createRoomMateClient({
        baseUrl: "http://127.0.0.1:3001",
        roomId: "alpha",
        source,
        fetch: networkFetch
      }).sendMessage("hello")
    ).resolves.toEqual({ ok: false, error: "backend unavailable" });
  });

  it("requests AI Drop completion with live selection and viewport facts", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        response: {
          mate: {
            output: {
              kind: "completion-proposal"
            }
          }
        }
      })
    })) as unknown as typeof globalThis.fetch;
    const client = createRoomMateClient({
      baseUrl: "http://127.0.0.1:3001/",
      roomId: "alpha",
      source,
      fetch
    });

    await expect(
      client.requestCompletion({
        schemaVersion: "canvas-context.v1",
        roomId: "alpha",
        source: {
          kind: "web",
          ...source,
          capturedAt: "2026-06-08T00:00:00.000Z"
        },
        document: {
          shapeCount: 1,
          shapes: [{ id: "shape:1", type: "text", text: "As a" }]
        },
        selection: { selectedShapeIds: ["shape:1"] },
        viewport: { pageBounds: { x: 0, y: 0, w: 800, h: 600 }, zoom: 1 },
        freshness: { snapshotVersion: 1, eventVersionAtSnapshot: 0 }
      })
    ).resolves.toMatchObject({
      ok: true,
      value: {
        response: {
          mate: {
            output: { kind: "completion-proposal" }
          }
        }
      }
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/rooms/alpha/mate/completions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          selection: {
            state: "selected",
            selectedShapeIds: ["shape:1"]
          },
          viewport: {
            state: "available",
            pageBounds: { x: 0, y: 0, w: 800, h: 600 },
            zoom: 1
          },
          source: {
            kind: "web",
            ...source,
            capturedAt: "2026-06-08T00:00:00.000Z"
          }
        })
      })
    );
  });
});
