import { randomUUID } from "node:crypto";

/**
 * 创建 sync room 时 server 请求的 room 级 mate session 生命周期状态。
 */
export type RoomAgentLifecycleState =
  | "starting"
  | "connected"
  | "unavailable"
  | "ended";

/**
 * 单个 room 的 mate session process-local 生命周期记录。
 */
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

/**
 * 通过 readiness 和 room diagnostics 暴露的、已排序的生命周期 diagnostics。
 */
export type RoomAgentLifecycleDiagnostics = {
  roomCount: number;
  rooms: RoomAgentLifecycleRecord[];
};

/**
 * 发送给 adapter 的请求；adapter 负责启动真实 mate session。
 */
export type RoomAgentStartRequest = {
  roomId: string;
  agentSessionId: string;
};

/**
 * adapter 启动结果。默认 adapter 返回 unavailable，让协同链路在没有模型凭证或
 * 独立 agent 进程时也能运行。
 */
export type RoomAgentStartResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 请求外部 mate session 的可插拔边界。
 */
export type RoomAgentLifecycleAdapter = {
  startSession: (request: RoomAgentStartRequest) => RoomAgentStartResult;
};

/**
 * 让 lifecycle 测试可确定、adapter 可替换的选项。
 */
export type RoomAgentLifecycleRegistryOptions = {
  adapter?: RoomAgentLifecycleAdapter;
  clock?: () => string;
  createSessionId?: (roomId: string) => string;
};

/**
 * 内存 registry，确保每个 active room 都有一条 lifecycle record。
 */
export type RoomAgentLifecycleRegistry = {
  ensureRequested: (roomId: string) => RoomAgentLifecycleRecord;
  end: (roomId: string, reason: string) => RoomAgentLifecycleRecord | undefined;
  getRecord: (roomId: string) => RoomAgentLifecycleRecord | undefined;
  getDiagnostics: () => RoomAgentLifecycleDiagnostics;
};

/**
 * lifecycle record 的内部状态转换事件。
 */
export type RoomAgentLifecycleEvent =
  | { type: "mark-connected"; at: string }
  | { type: "mark-unavailable"; at: string; reason: string }
  | { type: "end"; at: string; reason: string };

const DEFAULT_UNAVAILABLE_REASON = "mate adapter is not configured";

/**
 * 本地开发使用的默认 adapter。它记录 degraded/unavailable mate 状态，同时保持
 * 白板协同可用。
 */
const unavailableAdapter: RoomAgentLifecycleAdapter = {
  startSession: () => ({ ok: false, reason: DEFAULT_UNAVAILABLE_REASON })
};

/**
 * 创建 process-local lifecycle registry。
 *
 * 对 active record 调用 `ensureRequested` 是幂等的，因此创建 room 时可以安全请求
 * mate 参与，不会重复启动。
 */
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

/**
 * lifecycle record 的纯状态转换 helper。
 */
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

/**
 * 为 room lifecycle record 生成不透明 mate session id。
 */
function createDefaultAgentSessionId(roomId: string): string {
  return `mate:${roomId}:${randomUUID()}`;
}
