import { randomUUID } from "node:crypto";

export type RoomAgentLifecycleState =
  | "starting"
  | "connected"
  | "unavailable"
  | "ended";

export type RoomAgentLifecycleRecord = {
  roomId: string;
  agentSessionId: string;
  state: RoomAgentLifecycleState;
  requestedAt: string;
  updatedAt: string;
  connectedAt?: string;
  unavailableReason?: string;
  endedAt?: string;
  endReason?: string;
};

export type RoomAgentLifecycleDiagnostics = {
  roomCount: number;
  rooms: RoomAgentLifecycleRecord[];
};

export type RoomAgentStartRequest = {
  roomId: string;
  agentSessionId: string;
};

export type RoomAgentStartResult =
  | { ok: true }
  | { ok: false; reason: string };

export type RoomAgentLifecycleAdapter = {
  startSession: (request: RoomAgentStartRequest) => RoomAgentStartResult;
};

export type RoomAgentLifecycleRegistryOptions = {
  adapter?: RoomAgentLifecycleAdapter;
  clock?: () => string;
  createSessionId?: (roomId: string) => string;
};

export type RoomAgentLifecycleRegistry = {
  ensureRequested: (roomId: string) => RoomAgentLifecycleRecord;
  end: (roomId: string, reason: string) => RoomAgentLifecycleRecord | undefined;
  getRecord: (roomId: string) => RoomAgentLifecycleRecord | undefined;
  getDiagnostics: () => RoomAgentLifecycleDiagnostics;
};

export type RoomAgentLifecycleEvent =
  | { type: "mark-connected"; at: string }
  | { type: "mark-unavailable"; at: string; reason: string }
  | { type: "end"; at: string; reason: string };

const DEFAULT_UNAVAILABLE_REASON = "mate adapter is not configured";

const unavailableAdapter: RoomAgentLifecycleAdapter = {
  startSession: () => ({ ok: false, reason: DEFAULT_UNAVAILABLE_REASON })
};

export function createRoomAgentLifecycleRegistry({
  adapter = unavailableAdapter,
  clock = () => new Date().toISOString(),
  createSessionId = createDefaultAgentSessionId
}: RoomAgentLifecycleRegistryOptions = {}): RoomAgentLifecycleRegistry {
  const records = new Map<string, RoomAgentLifecycleRecord>();

  return {
    ensureRequested(roomId) {
      const existing = records.get(roomId);
      if (existing && existing.state !== "ended") {
        return existing;
      }

      const now = clock();
      const starting: RoomAgentLifecycleRecord = {
        roomId,
        agentSessionId: createSessionId(roomId),
        state: "starting",
        requestedAt: now,
        updatedAt: now
      };

      let next = starting;
      try {
        const started = adapter.startSession({
          roomId,
          agentSessionId: starting.agentSessionId
        });
        next = transitionRoomAgentRecord(
          starting,
          started.ok
            ? { type: "mark-connected", at: clock() }
            : { type: "mark-unavailable", at: clock(), reason: started.reason }
        );
      } catch (error) {
        next = transitionRoomAgentRecord(starting, {
          type: "mark-unavailable",
          at: clock(),
          reason: error instanceof Error ? error.message : String(error)
        });
      }

      records.set(roomId, next);
      return next;
    },

    end(roomId, reason) {
      const existing = records.get(roomId);
      if (!existing) {
        return undefined;
      }
      const ended = transitionRoomAgentRecord(existing, {
        type: "end",
        at: clock(),
        reason
      });
      records.set(roomId, ended);
      return ended;
    },

    getRecord(roomId) {
      return records.get(roomId);
    },

    getDiagnostics() {
      const rooms = [...records.values()].sort((a, b) =>
        a.roomId.localeCompare(b.roomId)
      );

      return {
        roomCount: rooms.length,
        rooms
      };
    }
  };
}

export function transitionRoomAgentRecord(
  record: RoomAgentLifecycleRecord,
  event: RoomAgentLifecycleEvent
): RoomAgentLifecycleRecord {
  if (record.state === "ended") {
    return record;
  }

  if (event.type === "mark-connected") {
    return {
      roomId: record.roomId,
      agentSessionId: record.agentSessionId,
      state: "connected",
      requestedAt: record.requestedAt,
      updatedAt: event.at,
      connectedAt: event.at
    };
  }

  if (event.type === "mark-unavailable") {
    return {
      roomId: record.roomId,
      agentSessionId: record.agentSessionId,
      state: "unavailable",
      requestedAt: record.requestedAt,
      updatedAt: event.at,
      unavailableReason: event.reason
    };
  }

  return {
    roomId: record.roomId,
    agentSessionId: record.agentSessionId,
    state: "ended",
    requestedAt: record.requestedAt,
    updatedAt: event.at,
    ...(record.connectedAt ? { connectedAt: record.connectedAt } : {}),
    ...(record.unavailableReason
      ? { unavailableReason: record.unavailableReason }
      : {}),
    endedAt: event.at,
    endReason: event.reason
  };
}

function createDefaultAgentSessionId(roomId: string): string {
  return `mate:${roomId}:${randomUUID()}`;
}
