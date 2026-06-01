import { buildRoomPath } from "./room-route";
import { parseRoomId } from "./sync-config";

export type RoomShareUrlResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function buildRoomShareUrl(input: {
  origin: string;
  roomId: string;
}): RoomShareUrlResult {
  const roomValidation = parseRoomId(input.roomId);
  if (!roomValidation.ok) {
    return { ok: false, error: roomValidation.reason };
  }

  let url: URL;
  try {
    url = new URL(input.origin);
  } catch {
    return { ok: false, error: "Share URL origin must be absolute." };
  }

  url.pathname = buildRoomPath(roomValidation.value);
  url.search = "";
  url.hash = "";

  return { ok: true, value: url.toString() };
}
