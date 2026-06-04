import { InMemorySyncStorage, TLSocketRoom } from "@tldraw/sync-core";

import { parseRoomId } from "../room-id.js";
import {
  createRoomAgentLifecycleRegistry,
  type RoomAgentLifecycleDiagnostics,
  type RoomAgentLifecycleRegistry
} from "./room-agent-lifecycle.js";

/**
 * `@tldraw/sync-core` 拥有的运行时 room 对象。
 */
export type SyncRoom = TLSocketRoom;

/**
 * readiness 和 diagnostics 使用的 process-local room registry 摘要。
 */
export type RoomRegistryStats = {
  roomCount: number;
  roomIds: string[];
};

/**
 * 创建 tldraw sync rooms，并把它们和 mate lifecycle records 关联起来的 registry API。
 */
export type RoomRegistry = {
  getOrCreateRoom: (roomId: string) => SyncRoom;
  getStats: () => RoomRegistryStats;
  getAgentLifecycleDiagnostics: () => RoomAgentLifecycleDiagnostics;
  getAgentSessionId: (roomId: string) => string | undefined;
  closeAll: () => void;
};

/**
 * 构造 room registry 时可选注入的依赖。
 */
export type CreateRoomRegistryOptions = {
  agentLifecycle?: RoomAgentLifecycleRegistry;
};

/**
 * 创建 process-local tldraw room registry。
 *
 * 对某个合法 room id 第一次调用 `getOrCreateRoom` 时，会同时创建 `TLSocketRoom`
 * 和对应的 mate lifecycle record。
 */
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
