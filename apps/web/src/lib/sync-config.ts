export const DEFAULT_SYNC_SERVER_URL = "ws://127.0.0.1:3001";
export const SYNC_ROUTE_PATH = "/sync";

const MAX_ROOM_ID_LENGTH = 80;
const MAX_SESSION_ID_LENGTH = 128;
const ROOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export type SyncConfigErrorCode =
  | "INVALID_SERVER_URL"
  | "HOSTED_DEMO_SYNC_URL"
  | "INVALID_ROOM_ID"
  | "INVALID_SESSION_ID";

export type SyncConfigError = {
  code: SyncConfigErrorCode;
  message: string;
};

export type SyncConfigResult =
  | {
      ok: true;
      value: {
        roomId: string;
        roomUri: string;
        sessionId: string;
      };
    }
  | {
      ok: false;
      error: SyncConfigError;
    };

export type SyncConfigInput = {
  serverUrl?: string | null | undefined;
  roomId?: string | null | undefined;
  deviceId: string;
  tabId: string;
};

export function resolveSyncConfig(input: SyncConfigInput): SyncConfigResult {
  const serverUrl = input.serverUrl?.trim();
  if (!serverUrl) {
    return {
      ok: false,
      error: {
        code: "INVALID_SERVER_URL",
        message: "Sync server URL must be configured explicitly."
      }
    };
  }

  const roomValidation = parseRoomId(input.roomId);
  if (!roomValidation.ok) {
    return {
      ok: false,
      error: { code: "INVALID_ROOM_ID", message: roomValidation.reason }
    };
  }

  const sessionId = buildSyncSessionId(input.deviceId, input.tabId);
  const sessionValidation = parseSessionId(sessionId);
  if (!sessionValidation.ok) {
    return {
      ok: false,
      error: { code: "INVALID_SESSION_ID", message: sessionValidation.reason }
    };
  }

  const roomUri = buildSyncRoomUri({
    serverUrl,
    roomId: roomValidation.value
  });
  if (!roomUri.ok) {
    return roomUri;
  }

  return {
    ok: true,
    value: {
      roomId: roomValidation.value,
      roomUri: roomUri.value,
      sessionId
    }
  };
}

export function buildSyncSessionId(deviceId: string, tabId: string) {
  return `${deviceId}:${tabId}`;
}

export function buildSyncRoomUri(input: {
  serverUrl: string;
  roomId: string;
}): { ok: true; value: string } | { ok: false; error: SyncConfigError } {
  const roomValidation = parseRoomId(input.roomId);
  if (!roomValidation.ok) {
    return {
      ok: false,
      error: { code: "INVALID_ROOM_ID", message: roomValidation.reason }
    };
  }

  let url: URL;
  try {
    url = new URL(input.serverUrl);
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_SERVER_URL",
        message: "Sync server URL must be an absolute HTTP(S) or WS(S) URL."
      }
    };
  }

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    return {
      ok: false,
      error: {
        code: "INVALID_SERVER_URL",
        message: "Sync server URL must use http, https, ws, or wss."
      }
    };
  }

  if (isHostedDemoSyncHost(url.hostname)) {
    return {
      ok: false,
      error: {
        code: "HOSTED_DEMO_SYNC_URL",
        message: "The web client must use the dedicated project sync backend."
      }
    };
  }

  url.pathname = joinUrlPath(url.pathname, SYNC_ROUTE_PATH, roomValidation.value);
  url.search = "";
  url.hash = "";

  return { ok: true, value: url.toString() };
}

export function parseRoomId(
  input: unknown
): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof input !== "string") {
    return { ok: false, reason: "Room id must be a string." };
  }

  const value = input.trim();
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

function parseSessionId(
  input: unknown
): { ok: true; value: string } | { ok: false; reason: string } {
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

function joinUrlPath(...parts: string[]) {
  return parts
    .flatMap((part) => part.split("/"))
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/")
    .replace(/^/, "/");
}

function isHostedDemoSyncHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "demo.tldraw.xyz" || normalized.endsWith(".demo.tldraw.xyz");
}
