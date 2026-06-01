import { describe, expect, it } from "vitest";
import { InMemorySyncStorage } from "@tldraw/sync-core";

import { createRoomRegistry } from "./room-registry.js";

describe("sync room registry", () => {
  it("creates and reuses one process-local room per normalized id", () => {
    const registry = createRoomRegistry();

    const first = registry.getOrCreateRoom(" alpha ");
    const second = registry.getOrCreateRoom("alpha");

    expect(first).toBe(second);
    expect(first.storage).toBeInstanceOf(InMemorySyncStorage);
    expect(registry.getStats()).toEqual({ roomCount: 1, roomIds: ["alpha"] });
  });

  it("isolates distinct valid room ids", () => {
    const registry = createRoomRegistry();

    const alpha = registry.getOrCreateRoom("alpha");
    const beta = registry.getOrCreateRoom("beta");

    expect(alpha).not.toBe(beta);
    expect(registry.getStats()).toEqual({
      roomCount: 2,
      roomIds: ["alpha", "beta"]
    });
  });

  it("rejects invalid room ids before creating registry entries", () => {
    const registry = createRoomRegistry();

    expect(() => registry.getOrCreateRoom("../secret")).toThrow(/Invalid room/);
    expect(registry.getStats()).toEqual({ roomCount: 0, roomIds: [] });
  });

  it("starts empty for a fresh process-local registry", () => {
    const registry = createRoomRegistry();
    registry.getOrCreateRoom("alpha");

    const restarted = createRoomRegistry();

    expect(restarted.getStats()).toEqual({ roomCount: 0, roomIds: [] });
  });
});
