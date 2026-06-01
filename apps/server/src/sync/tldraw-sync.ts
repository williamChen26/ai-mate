import type { WebSocketMinimal } from "@tldraw/sync-core";
import {
  TLSyncErrorCloseEventCode,
  TLSyncErrorCloseEventReason
} from "@tldraw/sync-core";
import type { WebSocket } from "ws";

import { isOriginAllowed, type ServerConfig } from "../config.js";
import { parseRoomId, parseSessionId } from "../room-id.js";
import type { RoomRegistry } from "./room-registry.js";

export type SyncConnectionRequest = {
  roomId: unknown;
  sessionId: unknown;
  origin: string | undefined;
};

export type SyncConnectionResult =
  | { ok: true; roomId: string; sessionId: string }
  | { ok: false; reason: string };

export function attachTldrawSyncSocket(
  socket: WebSocket,
  request: SyncConnectionRequest,
  registry: RoomRegistry,
  config: Pick<ServerConfig, "allowedOrigins">
): SyncConnectionResult {
  if (!isOriginAllowed(request.origin, config.allowedOrigins)) {
    closeSocket(socket, TLSyncErrorCloseEventReason.FORBIDDEN);
    return { ok: false, reason: "Origin is not allowed." };
  }

  const roomId = parseRoomId(request.roomId);
  if (!roomId.ok) {
    closeSocket(socket, TLSyncErrorCloseEventReason.NOT_FOUND);
    return { ok: false, reason: roomId.reason };
  }

  const sessionId = parseSessionId(request.sessionId);
  if (!sessionId.ok) {
    closeSocket(socket, TLSyncErrorCloseEventReason.NOT_AUTHENTICATED);
    return { ok: false, reason: sessionId.reason };
  }

  const room = registry.getOrCreateRoom(roomId.value);
  room.handleSocketConnect({
    sessionId: sessionId.value,
    socket: toMinimalWebSocket(socket)
  });

  return { ok: true, roomId: roomId.value, sessionId: sessionId.value };
}

function closeSocket(socket: WebSocket, reason: string): void {
  socket.close(TLSyncErrorCloseEventCode, reason);
}

function toMinimalWebSocket(socket: WebSocket): WebSocketMinimal {
  const listeners = new Map<
    (event: unknown) => void,
    { type: "message" | "close" | "error"; wrapped: (...args: unknown[]) => void }
  >();

  return {
    get readyState() {
      return socket.readyState;
    },
    send(data: string) {
      socket.send(data);
    },
    close(code?: number, reason?: string) {
      socket.close(code, reason);
    },
    addEventListener(type, listener) {
      const wrapped = (...args: unknown[]) => {
        if (type === "message") {
          listener({ data: normalizeMessageData(args[0]) });
          return;
        }
        listener(args[0] ?? {});
      };

      listeners.set(listener, { type, wrapped });
      socket.on(type, wrapped);
    },
    removeEventListener(type, listener) {
      const registered = listeners.get(listener);
      if (registered && registered.type === type) {
        socket.off(type, registered.wrapped);
        listeners.delete(listener);
      }
    }
  };
}

function normalizeMessageData(data: unknown): string | ArrayBufferLike | ArrayBufferView {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data as Buffer[]);
  }

  return Buffer.from(String(data));
}
