import {
  canvasSnapshotSchema,
  createEmptyRoomContextFeed,
  roomContextFeedSchema,
  roomOperationEventSchema,
  type CanvasSnapshot,
  type RoomContextFeed,
  type RoomOperationEvent
} from "@production-spec-graph/shared";

export type RoomContextErrorCode =
  | "INVALID_CONTEXT"
  | "INVALID_EVENT"
  | "ROOM_MISMATCH";

export type RoomContextError = {
  code: RoomContextErrorCode;
  message: string;
};

/**
 * context ingestion endpoints 返回的结果。成功时返回最新 feed，调用方可以立即检查
 * mate 将会看到什么。
 */
export type RoomContextResult =
  | { ok: true; context: RoomContextFeed }
  | { ok: false; error: RoomContextError };

/**
 * process-local context store 的运行时选项。
 */
export type RoomContextStoreOptions = {
  eventLimit?: number;
  now?: () => string;
};

/**
 * 当 room 存在 agent lifecycle record 时，附加到 context feed 上的可选 agent 关联。
 */
export type AgentContext = {
  agentSessionId?: string;
};

/**
 * 单个 room 的可变 process-local 状态。公共 store 始终基于这个内部结构暴露
 * 已校验、看起来不可变的 feed。
 */
type MutableRoomContext = {
  latestSnapshot: CanvasSnapshot | null;
  recentEvents: RoomOperationEvent[];
  eventVersion: number;
};

/**
 * Fastify app 使用的内存 context store。它为每个 room 记录最新 snapshot 和
 * 有边界的近期 event 列表。
 */
export type RoomContextStore = {
  acceptSnapshot: (
    routeRoomId: string,
    payload: unknown,
    agent?: AgentContext
  ) => RoomContextResult;
  appendEvent: (
    routeRoomId: string,
    payload: unknown,
    agent?: AgentContext
  ) => RoomContextResult;
  getFeed: (roomId: string, agent?: AgentContext) => RoomContextFeed;
};

/**
 * 创建 process-local room context store。
 *
 * 这里刻意不做持久化：只验证 room -> context -> mate 协议，不引入持久存储或
 * 多进程协调。
 */
export function createRoomContextStore({
  eventLimit = 50,
  now = () => new Date().toISOString()
}: RoomContextStoreOptions = {}): RoomContextStore {
  const contexts = new Map<string, MutableRoomContext>();

  /**
   * 返回已有的可变 room context；首次写入时创建空 context。
   */
  function getMutable(roomId: string): MutableRoomContext {
    const existing = contexts.get(roomId);
    if (existing) {
      return existing;
    }
    const created: MutableRoomContext = {
      latestSnapshot: null,
      recentEvents: [],
      eventVersion: 0
    };
    contexts.set(roomId, created);
    return created;
  }

  return {
    acceptSnapshot(routeRoomId, payload, agent) {
      const parsed = canvasSnapshotSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: "INVALID_CONTEXT",
            message: parsed.error.issues.map((issue) => issue.message).join("; ")
          }
        };
      }
      if (parsed.data.roomId !== routeRoomId) {
        return roomMismatch(routeRoomId, parsed.data.roomId);
      }

      const context = getMutable(routeRoomId);
      // 每个 room 只保留最新 snapshot。snapshot 自身不推进 eventVersion；
      // changedSinceSnapshot 由后续 operation events 和 snapshot 捕获的 eventVersion 比较得出。
      context.latestSnapshot = parsed.data;
      return { ok: true, context: buildFeed(routeRoomId, context, agent, now()) };
    },

    appendEvent(routeRoomId, payload, agent) {
      const parsed = roomOperationEventSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: "INVALID_EVENT",
            message: parsed.error.issues.map((issue) => issue.message).join("; ")
          }
        };
      }
      if (parsed.data.roomId !== routeRoomId) {
        return roomMismatch(routeRoomId, parsed.data.roomId);
      }

      const context = getMutable(routeRoomId);
      // eventVersion 采用 payload 中的单调版本号；recentEvents 是有界窗口，避免
      // AI context feed 随房间运行时间无限增长。
      context.eventVersion = Math.max(context.eventVersion, parsed.data.eventVersion);
      context.recentEvents = [...context.recentEvents, parsed.data].slice(
        -eventLimit
      );
      return { ok: true, context: buildFeed(routeRoomId, context, agent, now()) };
    },

    getFeed(roomId, agent) {
      const context = contexts.get(roomId);
      if (!context) {
        return createEmptyRoomContextFeed({
          roomId,
          ...(agent?.agentSessionId
            ? { agentSessionId: agent.agentSessionId }
            : {}),
          generatedAt: now()
        });
      }

      return buildFeed(roomId, context, agent, now());
    }
  };
}

/**
 * 根据 process-local 状态构造并校验 mate 可读取的公共 context feed。
 * freshness 通过比较最新 operation event version 和 snapshot 捕获到的 event
 * version 得出。
 */
function buildFeed(
  roomId: string,
  context: MutableRoomContext,
  agent: AgentContext | undefined,
  generatedAt: string
): RoomContextFeed {
  const snapshotVersion = context.latestSnapshot?.freshness.snapshotVersion ?? 0;
  const eventVersion = context.eventVersion;
  const eventVersionAtSnapshot =
    context.latestSnapshot?.freshness.eventVersionAtSnapshot ?? 0;

  return roomContextFeedSchema.parse({
    roomId,
    ...(agent?.agentSessionId ? { agentSessionId: agent.agentSessionId } : {}),
    latestSnapshot: context.latestSnapshot,
    recentEvents: context.recentEvents,
    freshness: {
      snapshotVersion,
      eventVersion,
      changedSinceSnapshot: eventVersion > eventVersionAtSnapshot
    },
    generatedAt
  });
}

/**
 * 当路由 room id 与 payload room id 不一致时，生成结构化 room mismatch 错误。
 */
function roomMismatch(routeRoomId: string, payloadRoomId: string): RoomContextResult {
  return {
    ok: false,
    error: {
      code: "ROOM_MISMATCH",
      message: `Payload room id ${payloadRoomId} does not match route room id ${routeRoomId}.`
    }
  };
}
