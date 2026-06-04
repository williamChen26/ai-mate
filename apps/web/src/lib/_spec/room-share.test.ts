import { describe, expect, it } from "vitest";

import { buildRoomShareUrl } from "../room-share";

describe("room share url", () => {
  it("builds a canonical room URL from an origin and validated room id", () => {
    expect(
      buildRoomShareUrl({
        origin: "http://127.0.0.1:3100",
        roomId: "alpha-room"
      })
    ).toEqual({
      ok: true,
      value: "http://127.0.0.1:3100/rooms/alpha-room"
    });
  });

  it("uses only the origin, not the caller path or query", () => {
    expect(
      buildRoomShareUrl({
        origin: "https://example.test/app/current?token=secret",
        roomId: "product.spec_1"
      })
    ).toEqual({
      ok: true,
      value: "https://example.test/rooms/product.spec_1"
    });
  });

  it("rejects invalid room ids before producing a share URL", () => {
    const result = buildRoomShareUrl({
      origin: "https://example.test",
      roomId: "../bad"
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Room id may only contain letters, numbers, dots, underscores, and hyphens."
    });
  });
});
