import { describe, expect, it } from "vitest";

import {
  MAX_ROOM_ID_LENGTH,
  isValidRoomId,
  normalizeRoomId,
  parseRoomId
} from "./room-id.js";

describe("room id validation", () => {
  it("normalizes safe room ids and trims accidental whitespace", () => {
    expect(normalizeRoomId("  alpha-room_123  ")).toBe("alpha-room_123");
    expect(parseRoomId("spec.2026").ok).toBe(true);
  });

  it("accepts bounded url-safe ids only", () => {
    expect(isValidRoomId("alpha")).toBe(true);
    expect(isValidRoomId("room-123_abc.def")).toBe(true);
    expect(isValidRoomId("a".repeat(MAX_ROOM_ID_LENGTH))).toBe(true);
  });

  it("rejects empty, oversized, path-like, and unsafe ids", () => {
    const invalidIds = [
      "",
      "   ",
      "a".repeat(MAX_ROOM_ID_LENGTH + 1),
      "../secret",
      "room/name",
      "room?name",
      "room#name",
      "room name",
      "中文-room",
      "room:%2Funsafe"
    ];

    for (const id of invalidIds) {
      const parsed = parseRoomId(id);
      expect(parsed.ok, id).toBe(false);
      expect(isValidRoomId(id), id).toBe(false);
    }
  });
});
