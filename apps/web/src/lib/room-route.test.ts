import { describe, expect, it } from "vitest";

import {
  buildRoomPath,
  createRoomId,
  decideRoomRoute,
  isCanonicalRoomPath
} from "./room-route";

describe("room route decisions", () => {
  it("generates safe unique room ids", () => {
    const roomId = createRoomId(
      () => "11111111-1111-4111-8111-111111111111"
    );

    expect(roomId).toBe("room-11111111-1111-4111-8111-111111111111");
    expect(buildRoomPath(roomId)).toBe(
      "/rooms/room-11111111-1111-4111-8111-111111111111"
    );
  });

  it("decides to create a canonical room path when no room id is present", () => {
    expect(
      decideRoomRoute({
        generateRoomId: () => "room-22222222-2222-4222-8222-222222222222"
      })
    ).toEqual({
      kind: "create",
      roomId: "room-22222222-2222-4222-8222-222222222222",
      path: "/rooms/room-22222222-2222-4222-8222-222222222222"
    });
  });

  it("joins a valid route room id without generating a new room", () => {
    expect(
      decideRoomRoute({
        roomId: "shared-safe-room",
        generateRoomId: () => "room-should-not-be-used"
      })
    ).toEqual({
      kind: "join",
      roomId: "shared-safe-room",
      path: "/rooms/shared-safe-room"
    });
  });

  it("rejects unsafe, empty, and oversized route room ids", () => {
    expect(decideRoomRoute({ roomId: "../bad" })).toMatchObject({
      kind: "invalid",
      attemptedRoomId: "../bad"
    });
    expect(decideRoomRoute({ roomId: "" })).toMatchObject({
      kind: "invalid"
    });
    expect(decideRoomRoute({ roomId: "a".repeat(81) })).toMatchObject({
      kind: "invalid"
    });
  });

  it("detects canonical room paths for no-loop navigation", () => {
    expect(isCanonicalRoomPath("/rooms/team-room", "team-room")).toBe(true);
    expect(isCanonicalRoomPath("/", "team-room")).toBe(false);
    expect(isCanonicalRoomPath("/rooms/other-room", "team-room")).toBe(false);
  });
});
