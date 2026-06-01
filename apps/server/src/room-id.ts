export const MAX_ROOM_ID_LENGTH = 80;
export const MAX_SESSION_ID_LENGTH = 128;

const ROOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export type IdParseResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

export function normalizeRoomId(input: string): string {
  return input.trim();
}

export function parseRoomId(input: unknown): IdParseResult {
  if (typeof input !== "string") {
    return { ok: false, reason: "Room id must be a string." };
  }

  const value = normalizeRoomId(input);

  if (value.length === 0) {
    return { ok: false, reason: "Room id cannot be empty." };
  }
  if (value.length > MAX_ROOM_ID_LENGTH) {
    return {
      ok: false,
      reason: `Room id cannot exceed ${MAX_ROOM_ID_LENGTH} characters.`
    };
  }
  if (!ROOM_ID_PATTERN.test(value)) {
    return {
      ok: false,
      reason:
        "Room id may only contain letters, numbers, dots, underscores, and hyphens."
    };
  }

  return { ok: true, value };
}

export function isValidRoomId(input: unknown): boolean {
  return parseRoomId(input).ok;
}

export function parseSessionId(input: unknown): IdParseResult {
  if (typeof input !== "string") {
    return { ok: false, reason: "Session id must be a string." };
  }

  const value = input.trim();

  if (value.length === 0) {
    return { ok: false, reason: "Session id cannot be empty." };
  }
  if (value.length > MAX_SESSION_ID_LENGTH) {
    return {
      ok: false,
      reason: `Session id cannot exceed ${MAX_SESSION_ID_LENGTH} characters.`
    };
  }
  if (!SESSION_ID_PATTERN.test(value)) {
    return {
      ok: false,
      reason:
        "Session id may only contain letters, numbers, dots, underscores, hyphens, and colons."
    };
  }

  return { ok: true, value };
}
