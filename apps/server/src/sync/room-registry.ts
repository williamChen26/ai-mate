import { InMemorySyncStorage, TLSocketRoom } from "@tldraw/sync-core";

import { parseRoomId } from "../room-id.js";

export type SyncRoom = TLSocketRoom;

export type RoomRegistryStats = {
  roomCount: number;
  roomIds: string[];
};

export type RoomRegistry = {
  getOrCreateRoom: (roomId: string) => SyncRoom;
  getStats: () => RoomRegistryStats;
  closeAll: () => void;
};

export function createRoomRegistry(): RoomRegistry {
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
      return room;
    },

    getStats() {
      const roomIds = [...rooms.keys()].sort();
      return {
        roomCount: roomIds.length,
        roomIds
      };
    },

    closeAll() {
      for (const room of rooms.values()) {
        room.close();
      }
      rooms.clear();
    }
  };
}
