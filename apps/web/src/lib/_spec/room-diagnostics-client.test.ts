import { describe, expect, it, vi } from "vitest";

import { createRoomDiagnosticsClient } from "../room-diagnostics-client.js";

describe("web room diagnostics client", () => {
  it("fetches room-scoped diagnostics", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        diagnostics: {
          roomId: "alpha",
          room: { active: true }
        }
      })
    })) as unknown as typeof globalThis.fetch;
    const client = createRoomDiagnosticsClient({
      baseUrl: "http://127.0.0.1:3001/",
      roomId: "alpha",
      fetch
    });

    await expect(client.fetchDiagnostics()).resolves.toMatchObject({
      ok: true,
      value: {
        diagnostics: {
          roomId: "alpha"
        }
      }
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/rooms/alpha/diagnostics"
    );
  });

  it("returns inspectable failures for server and network errors", async () => {
    const serverFetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({
        error: { message: "Room not found." }
      })
    })) as unknown as typeof globalThis.fetch;
    const networkFetch = vi.fn(async () => {
      throw new Error("backend unavailable");
    }) as unknown as typeof globalThis.fetch;

    await expect(
      createRoomDiagnosticsClient({
        baseUrl: "http://127.0.0.1:3001",
        roomId: "alpha",
        fetch: serverFetch
      }).fetchDiagnostics()
    ).resolves.toEqual({ ok: false, error: "Room not found." });

    await expect(
      createRoomDiagnosticsClient({
        baseUrl: "http://127.0.0.1:3001",
        roomId: "alpha",
        fetch: networkFetch
      }).fetchDiagnostics()
    ).resolves.toEqual({ ok: false, error: "backend unavailable" });
  });
});
