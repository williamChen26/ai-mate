import { describe, expect, it } from "vitest";

import { createRoomMemoryStore } from "../room-memory.js";

describe("createRoomMemoryStore", () => {
  it("keeps bounded recent turns per room", () => {
    const store = createRoomMemoryStore({ maxTurnsPerRoom: 2 });

    store.recordTurn("room-a", {
      turnId: "turn-1",
      generatedAt: "2026-06-03T00:00:00.000Z",
      summary: "first"
    });
    store.recordTurn("room-a", {
      turnId: "turn-2",
      generatedAt: "2026-06-03T00:00:01.000Z",
      summary: "second"
    });
    store.recordTurn("room-a", {
      turnId: "turn-3",
      generatedAt: "2026-06-03T00:00:02.000Z",
      summary: "third"
    });

    expect(store.getTurns("room-a").map((turn) => turn.turnId)).toEqual([
      "turn-2",
      "turn-3"
    ]);
    expect(store.getDiagnostics("room-a")).toMatchObject({
      retainedTurnCount: 2,
      maxTurnsPerRoom: 2,
      persistent: false
    });
  });

  it("does not leak memory across rooms", () => {
    const store = createRoomMemoryStore({ maxTurnsPerRoom: 3 });

    store.recordTurn("room-a", {
      turnId: "turn-a",
      generatedAt: "2026-06-03T00:00:00.000Z",
      summary: "room a"
    });
    store.recordTurn("room-b", {
      turnId: "turn-b",
      generatedAt: "2026-06-03T00:00:01.000Z",
      summary: "room b"
    });

    expect(store.getTurns("room-a")).toHaveLength(1);
    expect(store.getTurns("room-a")[0]?.summary).toBe("room a");
    expect(store.getTurns("room-b")[0]?.summary).toBe("room b");
  });
});
