import { InMemorySyncStorage, TLSocketRoom } from "@tldraw/sync-core";

import { parseRoomId } from "../room-id.js";
import {
  createRoomAgentLifecycleRegistry,
  type RoomAgentLifecycleDiagnostics,
  type RoomAgentLifecycleRegistry
} from "./room-agent-lifecycle.js";

export type SyncRoom = TLSocketRoom;

export type RoomRegistryStats = {
  roomCount: number;
  roomIds: string[];
};

export type RoomRegistry = {
  getOrCreateRoom: (roomId: string) => SyncRoom;
  getStats: () => RoomRegistryStats;
  getAgentLifecycleDiagnostics: () => RoomAgentLifecycleDiagnostics;
  getAgentSessionId: (roomId: string) => string | undefined;
  closeAll: () => void;
};

export type CreateRoomRegistryOptions = {
  agentLifecycle?: RoomAgentLifecycleRegistry;
};

export function createRoomRegistry({
  agentLifecycle = createRoomAgentLifecycleRegistry()
}: CreateRoomRegistryOptions = {}): RoomRegistry {
  const rooms = new Map<string, SyncRoom>();

  return {
    getOrCreateRoom(roomId: string) {
      const parsed = parseRoomId(roomId);
      if (!parsed.ok) {
        throw new Error(`Invalid room id: ${parsed.reason}`);
      }

      const existing = rooms.get(parsed.value);
      if (existing) {
        return existing;
      }

      const room = new TLSocketRoom({
        storage: new InMemorySyncStorage(),
        log: {
          warn: console.warn,
          error: console.error
        }
      });
      rooms.set(parsed.value, room);
      agentLifecycle.ensureRequested(parsed.value);
      return room;
    },

    getStats() {
      const roomIds = [...rooms.keys()].sort();
      return {
        roomCount: roomIds.length,
        roomIds
      };
    },

    getAgentLifecycleDiagnostics() {
      return agentLifecycle.getDiagnostics();
    },

    getAgentSessionId(roomId) {
      return agentLifecycle.getRecord(roomId)?.agentSessionId;
    },

    closeAll() {
      for (const [roomId, room] of rooms.entries()) {
        room.close();
        agentLifecycle.end(roomId, "room closed");
      }
      rooms.clear();
    }
  };
}
