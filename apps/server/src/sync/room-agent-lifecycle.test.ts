import { describe, expect, it } from "vitest";

import {
  createRoomAgentLifecycleRegistry,
  transitionRoomAgentRecord
} from "./room-agent-lifecycle.js";

describe("room agent lifecycle", () => {
  it("requests a room-scoped mate lifecycle record with serializable degraded state by default", () => {
    const lifecycle = createRoomAgentLifecycleRegistry({
      clock: () => "2026-06-03T00:00:00.000Z",
      createSessionId: (roomId) => `mate:${roomId}:001`
    });

    const record = lifecycle.ensureRequested("alpha");

    expect(record).toMatchObject({
      roomId: "alpha",
      agentSessionId: "mate:alpha:001",
      state: "unavailable",
      requestedAt: "2026-06-03T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:00.000Z",
      unavailableReason: "mate adapter is not configured"
    });
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it("reuses the same agent lifecycle record for repeated room access", () => {
    const lifecycle = createRoomAgentLifecycleRegistry({
      clock: () => "2026-06-03T00:00:00.000Z",
      createSessionId: (roomId) => `mate:${roomId}:stable`
    });

    const first = lifecycle.ensureRequested("alpha");
    const second = lifecycle.ensureRequested("alpha");

    expect(second).toEqual(first);
    expect(lifecycle.getDiagnostics()).toMatchObject({
      roomCount: 1,
      rooms: [{ roomId: "alpha", agentSessionId: "mate:alpha:stable" }]
    });
  });

  it("isolates agent session identity and state per room", () => {
    const lifecycle = createRoomAgentLifecycleRegistry({
      clock: () => "2026-06-03T00:00:00.000Z",
      createSessionId: (roomId) => `mate:${roomId}`
    });

    lifecycle.ensureRequested("beta");
    lifecycle.ensureRequested("alpha");

    expect(lifecycle.getDiagnostics().rooms).toEqual([
      expect.objectContaining({
        roomId: "alpha",
        agentSessionId: "mate:alpha"
      }),
      expect.objectContaining({
        roomId: "beta",
        agentSessionId: "mate:beta"
      })
    ]);
  });

  it("marks a room agent ended when the room lifecycle closes", () => {
    const lifecycle = createRoomAgentLifecycleRegistry({
      clock: () => "2026-06-03T00:00:00.000Z",
      createSessionId: (roomId) => `mate:${roomId}`
    });

    lifecycle.ensureRequested("alpha");
    const ended = lifecycle.end("alpha", "room closed");

    expect(ended).toMatchObject({
      roomId: "alpha",
      state: "ended",
      endedAt: "2026-06-03T00:00:00.000Z",
      endReason: "room closed"
    });
    expect(lifecycle.getDiagnostics().rooms[0]).toMatchObject({
      roomId: "alpha",
      state: "ended"
    });
  });

  it("refuses invalid state regressions after a room agent has ended", () => {
    const ended = {
      roomId: "alpha",
      agentSessionId: "mate:alpha",
      state: "ended" as const,
      requestedAt: "2026-06-03T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:00.000Z",
      endedAt: "2026-06-03T00:00:00.000Z",
      endReason: "room closed"
    };

    expect(
      transitionRoomAgentRecord(ended, {
        type: "mark-connected",
        at: "2026-06-03T00:00:01.000Z"
      })
    ).toEqual(ended);
  });
});
