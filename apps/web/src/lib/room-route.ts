import { parseRoomId } from "./sync-config";

export const ROOM_ROUTE_PREFIX = "/rooms";

export type RoomRouteDecision =
  | {
      kind: "create";
      roomId: string;
      path: string;
    }
  | {
      kind: "join";
      roomId: string;
      path: string;
    }
  | {
      kind: "invalid";
      attemptedRoomId: string;
      reason: string;
    };

export function createRoomId(randomUUID: () => string = defaultRandomUUID) {
  return `room-${randomUUID().toLowerCase()}`;
}

export function buildRoomPath(roomId: string) {
  const result = parseRoomId(roomId);
  if (!result.ok) {
    throw new Error(result.reason);
  }

  return `${ROOM_ROUTE_PREFIX}/${encodeURIComponent(result.value)}`;
}

export function decideRoomRoute(input: {
  roomId?: string | null | undefined;
  generateRoomId?: () => string;
}): RoomRouteDecision {
  if (input.roomId === undefined || input.roomId === null) {
    const roomId = input.generateRoomId?.() ?? createRoomId();
    return {
      kind: "create",
      roomId,
      path: buildRoomPath(roomId)
    };
  }

  const result = parseRoomId(input.roomId);
  if (!result.ok) {
    return {
      kind: "invalid",
      attemptedRoomId: input.roomId,
      reason: result.reason
    };
  }

  return {
    kind: "join",
    roomId: result.value,
    path: buildRoomPath(result.value)
  };
}

export function isCanonicalRoomPath(pathname: string, roomId: string) {
  return pathname === buildRoomPath(roomId);
}

function defaultRandomUUID() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}
